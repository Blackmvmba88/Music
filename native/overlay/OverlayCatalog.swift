import Foundation

struct CatalogEntry: Decodable {
    let title: String
    let artist: String
    let durationMs: Double
    let spotifyId: String?
    let sources: [String: [URL]]
    let lyrics: String?
    let cues: [Cue]?

    func isCandidate(for track: Playback) -> Bool {
        guard let duration = track.durationMs, let artistName = track.artist else { return false }
        func normalize(_ value: String) -> String {
            value.trimmingCharacters(in: .whitespacesAndNewlines)
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es_MX"))
        }
        return abs(durationMs - duration) <= 2000
            && normalize(title) == normalize(track.title)
            && normalize(artist) == normalize(artistName)
    }
}

struct ListeningEvent: Decodable {
    let timestamp: Date
    let provider: String
    let title: String
    let artist: String
    let observedSeconds: Int
    let sessionId: String?
    let status: String?
}

@MainActor
final class OverlayCatalog {
    private let bundled: [CatalogEntry]
    private let bundledBank: [CatalogEntry]
    private var userBank: [CatalogEntry] = []
    private var userModifiedAt: Date?
    private var retryAfter: [String: Date] = [:]
    private var remoteLyrics: [String: String] = [:]
    private var previous: Playback?
    private var seconds = 0.0
    private var sessionId = UUID()
    private var startedAt = Date()
    private var lastSavedSeconds = -1
    private let directory: URL

    init(directory overrideDirectory: URL? = nil) {
        let root = FileManager.default.homeDirectoryForCurrentUser
        directory = overrideDirectory ?? root.appendingPathComponent("Library/Application Support/BlackMamba Overlay", isDirectory: true)
        bundled = Self.load(Bundle.main.url(forResource: "catalog-evidence", withExtension: "json"))
        bundledBank = Self.load(Bundle.main.url(forResource: "recordings", withExtension: "json"))
    }

    private static func load(_ url: URL?) -> [CatalogEntry] {
        guard let url, let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([CatalogEntry].self, from: data)) ?? []
    }

    private func bank() -> [CatalogEntry] {
        let file = directory.appendingPathComponent("recordings.json")
        let version = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        if version != userModifiedAt {
            userBank = Self.load(file)
            userModifiedAt = version
        }
        return userBank.isEmpty ? bundledBank : userBank
    }

    func importedText(for track: Playback) -> String? {
        guard track.provider == "spotify", let id = track.trackId,
              id.range(of: #"^[A-Za-z0-9]{22}$"#, options: .regularExpression) != nil else { return nil }
        let file = directory.appendingPathComponent("lyrics", isDirectory: true)
            .appendingPathComponent(id + ".txt")
        guard let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize,
              size > 0, size <= 64_000,
              let content = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    func bankLyrics(for track: Playback) -> CatalogEntry? {
        guard track.provider == "spotify", let duration = track.durationMs else { return nil }
        let matches = bank().filter {
            $0.spotifyId == nil && $0.lyrics?.isEmpty == false && $0.sources["Suno"]?.count == 1
                && abs($0.durationMs - duration) <= 350 && $0.isCandidate(for: track)
        }
        return matches.count == 1 ? matches[0] : nil
    }

    func resolve(_ track: Playback) -> (CatalogEntry?, Bool) {
        let local = bank()
        if let id = track.trackId, track.provider == "spotify" {
            let exact = local.filter { $0.spotifyId == id }
            if exact.count == 1 { return (exact[0], true) }
            if exact.count > 1 { return (nil, false) }
            let known = bundled.filter { $0.spotifyId == id }
            if known.count == 1 { return (known[0], true) }
        }
        let matches = (local + bundled).filter { $0.isCandidate(for: track) }
        return matches.count == 1 ? (matches[0], false) : (nil, false)
    }

    func cachedLyrics(for url: URL) -> String? { remoteLyrics[url.absoluteString] }

    func fetchLyrics(for url: URL) async -> String? {
        let key = url.absoluteString
        if let cached = remoteLyrics[key] { return cached }
        guard url.scheme == "https", url.host == "soundcloud.com",
              let token = ProcessInfo.processInfo.environment["SOUNDCLOUD_ACCESS_TOKEN"]
                ?? ProcessInfo.processInfo.environment["SOUNDCLOUD_OAUTH_TOKEN"],
              !token.isEmpty, Date() >= (retryAfter[key] ?? .distantPast) else { return nil }
        retryAfter[key] = Date().addingTimeInterval(120)
        var endpoint = URLComponents(string: "https://api.soundcloud.com/resolve")!
        endpoint.queryItems = [URLQueryItem(name: "url", value: key)]
        guard let target = endpoint.url else { return nil }
        var request = URLRequest(url: target, timeoutInterval: 8)
        request.setValue("OAuth \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["kind"] as? String == "track",
              json["permalink_url"] as? String == key,
              let description = json["description"] as? String else { return nil }
        let lines = description.components(separatedBy: .newlines)
        guard let marker = lines.firstIndex(where: {
            ["letra:", "lyrics:"].contains($0.trimmingCharacters(in: .whitespaces).lowercased())
        }) else { return nil }
        let text = lines.dropFirst(marker + 1).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        remoteLyrics[key] = text
        return text
    }

    func observe(_ current: Playback?) {
        guard let current, current.trackId != nil else {
            finish(reason: "Interrumpida")
            previous = nil
            return
        }
        let last = previous
        let elapsed = last.map { (current.observedAtMs - $0.observedAtMs) / 1000 } ?? 0
        let same = last?.trackId == current.trackId && last?.provider == current.provider
        let restarted = same && (current.positionMs ?? .infinity) < 5000 &&
            (last?.positionMs ?? 0) - (current.positionMs ?? 0) > 25_000
        if !same || elapsed >= 15 || restarted {
            let reason = elapsed >= 15 ? "Interrumpida" : restarted ? "Reiniciada" : "Cambiada antes del final"
            finish(reason: reason)
            sessionId = UUID()
            startedAt = Date(timeIntervalSince1970: current.observedAtMs / 1000)
            seconds = 0
            lastSavedSeconds = -1
        } else if let last, last.playing, current.playing,
                  let before = last.positionMs, let after = current.positionMs {
            let advance = (after - before) / 1000
            if elapsed > 0, advance > 0, advance <= elapsed + 1 {
                seconds += min(advance, elapsed)
            }
        }
        previous = current
        if current.playing && Int(seconds) >= lastSavedSeconds + 15 {
            save(track: current, status: "En reproducción")
        } else if same && last?.playing == true && !current.playing {
            save(track: current, status: "Pausada")
        } else if same && last?.playing == false && current.playing && lastSavedSeconds >= 0 {
            save(track: current, status: "En reproducción")
        }
    }

    private func finish(reason: String) {
        guard let last = previous, last.playing || seconds > 0 || lastSavedSeconds >= 0 else { return }
        let nearEnd: Bool
        if let duration = last.durationMs, let position = last.positionMs, duration > 0 {
            nearEnd = position >= max(duration * 0.9, duration - 6000)
        } else {
            nearEnd = false
        }
        let status = nearEnd ? "Llegó al final (estimado)"
            : reason == "Cambiada antes del final" && last.durationMs == nil ? "Cambiada" : reason
        save(track: last, status: status)
    }

    private func save(track: Playback, status: String) {
        if append(track: track, seconds: seconds, status: status) {
            lastSavedSeconds = Int(seconds)
        }
    }

    func recentListens() -> [ListeningEvent] {
        let file = directory.appendingPathComponent("listening-history.jsonl")
        guard let handle = try? FileHandle(forReadingFrom: file) else { return [] }
        defer { try? handle.close() }
        do {
            let end = try handle.seekToEnd()
            let start = end > 256_000 ? end - 256_000 : 0
            try handle.seek(toOffset: start)
            guard let data = try handle.read(upToCount: 256_000) else { return [] }
            var lines = String(decoding: data, as: UTF8.self).split(separator: "\n")
            if start > 0 && !lines.isEmpty { lines.removeFirst() }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            var seen = Set<String>()
            var recent: [ListeningEvent] = []
            for line in lines.reversed() {
                guard let event = try? decoder.decode(ListeningEvent.self, from: Data(line.utf8)) else { continue }
                if let id = event.sessionId, !seen.insert(id).inserted { continue }
                recent.append(event)
                if recent.count == 100 { break }
            }
            return recent
        } catch {
            return []
        }
    }

    private func append(track: Playback, seconds: Double, status: String) -> Bool {
        let event: [String: Any] = [
            "timestamp": ISO8601DateFormatter().string(from: startedAt),
            "sessionId": sessionId.uuidString, "status": status,
            "provider": track.provider, "trackId": track.trackId ?? "",
            "title": track.title, "artist": track.artist ?? "", "observedSeconds": Int(seconds)
        ]
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.posixPermissions: 0o700])
            let file = directory.appendingPathComponent("listening-history.jsonl")
            var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
            data.append(10)
            if !FileManager.default.fileExists(atPath: file.path) {
                try data.write(to: file, options: .withoutOverwriting)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            } else {
                let handle = try FileHandle(forWritingTo: file)
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
            }
            return true
        } catch {
            NSLog("BlackMamba Overlay: no se pudo guardar el historial")
            return false
        }
    }
}
