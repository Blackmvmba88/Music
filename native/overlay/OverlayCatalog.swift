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
    private var recorded = false
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

    func observe(_ current: Playback) {
        guard let id = current.trackId else { return }
        defer { previous = current }
        guard let last = previous, last.trackId == id, last.provider == current.provider,
              current.observedAtMs - last.observedAtMs < 15_000 else {
            seconds = 0
            recorded = false
            return
        }
        guard let before = last.positionMs, let after = current.positionMs else { return }
        if after < 5000, before - after > 25_000 {
            seconds = 0
            recorded = false
            return
        }
        guard current.playing, last.playing, !recorded else { return }
        let elapsed = (current.observedAtMs - last.observedAtMs) / 1000
        let advance = (after - before) / 1000
        guard elapsed > 0, advance > 0, advance <= elapsed + 1 else { return }
        seconds += min(advance, elapsed)
        if seconds >= 30 {
            recorded = append(track: current, seconds: seconds)
        }
    }

    private func append(track: Playback, seconds: Double) -> Bool {
        let event: [String: Any] = [
            "timestamp": ISO8601DateFormatter().string(from: Date()),
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
