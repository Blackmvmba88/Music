import AppKit
import SwiftUI

struct Cue: Decodable {
    let start: Double
    let end: Double
    let text: String
}

struct Playback: Decodable {
    let title: String
    let artist: String?
    let provider: String
    let trackId: String?
    let playing: Bool
    let positionMs: Double?
    var durationMs: Double? = nil
    let observedAtMs: Double
    var lyrics: String?
    var cues: [Cue]?

    var position: Double? {
        positionMs.map { value in
            let elapsed = max(0, Date().timeIntervalSince1970 * 1000 - observedAtMs)
            return (value + (playing ? elapsed : 0)) / 1000
        }
    }
}

enum OverlayPalette: String, CaseIterable, Identifiable {
    case amber = "Ámbar", cyan = "Cian", violet = "Violeta", emerald = "Esmeralda"
    case rose = "Rosa", white = "Blanco"

    var id: String { rawValue }

    var ink: Color {
        switch self {
        case .amber: Color(red: 1, green: 0.8, blue: 0.47)
        case .cyan: Color(red: 0.46, green: 0.92, blue: 1)
        case .violet: Color(red: 0.82, green: 0.70, blue: 1)
        case .emerald: Color(red: 0.47, green: 1, blue: 0.72)
        case .rose: Color(red: 1, green: 0.64, blue: 0.77)
        case .white: .white
        }
    }

    var backdrop: Color {
        switch self {
        case .amber: Color(red: 0.08, green: 0.06, blue: 0.04)
        case .cyan: Color(red: 0.025, green: 0.10, blue: 0.14)
        case .violet: Color(red: 0.13, green: 0.06, blue: 0.20)
        case .emerald: Color(red: 0.035, green: 0.13, blue: 0.095)
        case .rose: Color(red: 0.16, green: 0.05, blue: 0.095)
        case .white: Color(white: 0.075)
        }
    }
}

final class OverlayState: ObservableObject {
    @Published var playback: Playback?
    @Published var expanded = false
    @Published var showingHistory = false
    @Published var lyricImportMessage: String?
    @Published var sources: [String: [URL]] = [:]
    @Published var compact = false
    @Published var wide = false
    @Published var spotifyStatus = "Conectar Spotify"
}

final class SubtitlePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

struct OverlayView: View {
    @ObservedObject var state: OverlayState
    let close: () -> Void
    let connect: () -> Void
    let configure: (Bool?) -> Void
    let loadHistory: () -> [ListeningEvent]
    let pasteLyrics: (Playback) -> Void
    @AppStorage("backgroundOpacity") private var backgroundOpacity = 0.94
    @AppStorage("lyricOpacity") private var lyricOpacity = 1.0
    @AppStorage("lyricPalette") private var palette = OverlayPalette.amber

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "line.3.horizontal")
                    .foregroundStyle(.secondary)
                    .help("Arrastra por los bordes del panel")
                Button {
                    state.compact = false
                    if state.showingHistory {
                        state.showingHistory = false
                        state.expanded = true
                    } else {
                        state.expanded.toggle()
                    }
                    configure(nil)
                } label: {
                    let track = state.playback
                    let title = [track?.artist, track?.title].compactMap { $0 }.filter { !$0.isEmpty }
                    Text(state.compact ? "♪" : title.isEmpty ? "Esperando reproducción" : title.joined(separator: " · "))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .help(state.expanded && !state.showingHistory ? "Ocultar letra" : "Ver letra")
                if !state.compact && state.playback == nil {
                    Button(state.spotifyStatus, action: connect)
                        .buttonStyle(.bordered)
                }
                if !state.compact {
                    Button {
                        state.showingHistory.toggle()
                        state.expanded = state.showingHistory
                        configure(nil)
                    } label: {
                        Image(systemName: "clock.arrow.circlepath")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(state.showingHistory ? "Cerrar historial" : "Historial de reproducción")
                    .help(state.showingHistory ? "Cerrar historial" : "Historial de reproducción")
                }
                if state.expanded {
                    Button {
                        state.wide.toggle()
                        configure(nil)
                    } label: {
                        Image(systemName: state.wide ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(state.wide ? "Reducir panel" : "Ampliar panel")
                    .help(state.wide ? "Reducir panel" : "Ampliar panel")
                }
                if !state.compact {
                    Button {
                        state.expanded = false
                        state.showingHistory = false
                        state.compact = true
                        configure(nil)
                    } label: { Image(systemName: "minus") }
                    .buttonStyle(.plain)
                    .help("Minimizar a una nota")
                }
                Button(action: close) { Image(systemName: "xmark") }
                    .buttonStyle(.plain)
                    .help("Ocultar cintilla")
            }
            .padding(.horizontal, 15)
            .frame(height: 48)
            .font(.system(size: 14, weight: .semibold, design: .monospaced))
            if state.expanded && state.showingHistory {
                Divider().opacity(backgroundOpacity)
                history
            } else if state.expanded {
                Divider().opacity(backgroundOpacity)
                lyrics
                if !state.sources.isEmpty && (state.playback?.lyrics != nil || state.playback?.cues?.isEmpty == false) {
                    HStack {
                        ForEach(["DistroKid", "SoundCloud", "Suno"], id: \.self) { name in
                            let urls = state.sources[name] ?? []
                            if !urls.isEmpty {
                                Menu(name) {
                                    ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                                        Link(urls.count == 1 ? "Abrir en \(name)" : "\(name) · candidato \(index + 1)", destination: url)
                                    }
                                }
                            } else {
                                Text("\(name) · pendiente")
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                VStack(spacing: 6) {
                    HStack {
                        opacitySlider("Fondo", value: $backgroundOpacity)
                        opacitySlider("Letras", value: $lyricOpacity)
                    }
                    HStack {
                        Menu("Color: \(palette.rawValue)") {
                            Picker("Color", selection: $palette) {
                                ForEach(OverlayPalette.allCases) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                        }
                        Menu("Nivel") {
                            Button("Flotante") { configure(false) }
                            Button("Sobre otras ventanas flotantes") { configure(true) }
                        }
                        Spacer()
                        Button("Cerrar letra") {
                            state.expanded = false
                            configure(nil)
                        }
                    }
                }
                .padding(12)
            }
        }
        .foregroundStyle(palette.ink)
        .background(palette.backdrop.opacity(backgroundOpacity))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(5)
        .preferredColorScheme(.dark)
    }

    private var history: some View {
        TimelineView(.periodic(from: .now, by: 5)) { _ in
            let events = loadHistory()
            VStack(alignment: .leading, spacing: 8) {
                Text("Historial de reproducción").font(.headline)
                if events.isEmpty {
                    Text("Aquí aparecerá tu primera escucha detectada.")
                        .foregroundStyle(.secondary)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(Array(events.enumerated()), id: \.offset) { _, event in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(event.title).font(.system(.body, weight: .semibold))
                                    Text([event.artist, event.provider.capitalized,
                                          event.timestamp.formatted(date: .abbreviated, time: .shortened)]
                                        .filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(.secondary)
                                    let elapsed = Duration.seconds(event.observedSeconds).formatted(.time(pattern: .minuteSecond))
                                    Text(event.status.map { "\(elapsed) escuchados · \($0)" }
                                         ?? "\(elapsed) registrados · Historial anterior")
                                        .font(.caption)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(16)
        }
    }

    private func opacitySlider(_ title: String, value: Binding<Double>) -> some View {
        HStack(spacing: 6) {
            Text(title)
            Slider(value: value, in: 0...1, step: 0.01)
                .accessibilityLabel("Opacidad de \(title.lowercased())")
            Text("\(Int((value.wrappedValue * 100).rounded())) %")
                .font(.caption.monospacedDigit())
                .frame(minWidth: 42, alignment: .trailing)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func missingLyrics(for track: Playback?) -> some View {
        if let track {
            Text("La letra todavía no está guardada en el banco.")
            ForEach(Array((state.sources["Letra"] ?? []).enumerated()), id: \.offset) { index, url in
                Link(index == 0 ? "Leer letra de referencia" : "Abrir video con letra", destination: url)
                    .font(.body)
            }
            if track.provider == "spotify",
               let id = track.trackId, id.range(of: #"^[A-Za-z0-9]{22}$"#, options: .regularExpression) != nil,
               let url = URL(string: "https://open.spotify.com/track/\(id)") {
                Link("Ver pista en Spotify", destination: url).font(.body)
                Button("Pegar y guardar letra") { pasteLyrics(track) }
                    .font(.body)
            }
            if (state.sources["Letra"] ?? []).isEmpty,
               let url = lyricsSearchURL(for: track) {
                Link("Buscar letra por canción y artista", destination: url).font(.body)
            }
            if let message = state.lyricImportMessage {
                Text(message).font(.caption)
            }
        } else {
            Text("Esperando reproducción")
        }
    }

    private func lyricsSearchURL(for track: Playback) -> URL? {
        var url = URLComponents()
        url.scheme = "https"
        url.host = "www.google.com"
        url.path = "/search"
        let query = [track.title, track.artist].compactMap { $0 }
            .map { "\"\($0)\"" }.joined(separator: " ")
        url.queryItems = [URLQueryItem(name: "q", value: query + " lyrics")]
        return url.url
    }

    private var lyrics: some View {
        TimelineView(.periodic(from: .now, by: 0.2)) { _ in
            let track = state.playback
            let cues = track?.cues ?? []
            let position = track?.position
            let active = position.flatMap { time in cues.lastIndex { $0.start <= time && time < $0.end } }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 9) {
                        if cues.isEmpty {
                            if let text = track?.lyrics, !text.isEmpty {
                                Text(text)
                            } else {
                                missingLyrics(for: track)
                            }
                        } else {
                            ForEach(cues.indices, id: \.self) { index in
                                Text(cues[index].text)
                                    .fontWeight(index == active ? .bold : .regular)
                                    .foregroundStyle(index == active ? palette.ink : palette.ink.opacity(0.68))
                                    .id(index)
                            }
                        }
                    }
                    .font(.system(size: state.wide ? 36 : 24))
                    .opacity(lyricOpacity)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                }
                .onChange(of: active) { _, index in
                    if let index { proxy.scrollTo(index, anchor: .center) }
                }
            }
        }
    }
}

@MainActor
final class OverlayController: NSObject, NSApplicationDelegate {
    private let state = OverlayState()
    private let catalog = OverlayCatalog()
    private var panel: SubtitlePanel?
    private var timer: Timer?
    private var statusItem: NSStatusItem?
    private var elevated = false
    private var spotifyEnabled = false
    private var nextSpotifyRead = Date.distantPast
    private var spotifyTask: Process?
    private var spotifyPlayback: Playback?
    private var spotifyMenuItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        menu.addItem(withTitle: "Mostrar cintilla", action: #selector(show), keyEquivalent: "").target = self
        let spotifyItem = menu.addItem(withTitle: "Conectar Spotify local", action: #selector(connectSpotify), keyEquivalent: "")
        spotifyItem.target = self
        spotifyMenuItem = spotifyItem
        menu.addItem(withTitle: "Salir", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.title = "♪"
        item.menu = menu
        statusItem = item

        let panel = SubtitlePanel(contentRect: NSRect(x: 0, y: 0, width: 540, height: 58),
                                  styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
                                  backing: .buffered, defer: false)
        panel.title = "BlackMamba · Cintilla"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.contentView = NSHostingView(rootView: OverlayView(state: state, close: { [weak panel] in
            panel?.orderOut(nil)
        }, connect: { [weak self] in self?.connectSpotify() }, configure: { [weak self] raise in
            self?.resize(raise: raise)
        }, loadHistory: { [weak self] in
            self?.catalog.recentListens() ?? []
        }, pasteLyrics: { [weak self] track in
            self?.importLyrics(for: track)
        }))
        if let area = NSScreen.main?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: area.midX - 270, y: area.minY + 42))
        }
        self.panel = panel
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.poll() }
        }
        show()
    }

    func applicationWillTerminate(_ notification: Notification) { catalog.observe(nil) }

    @objc private func show() { panel?.orderFrontRegardless() }

    private func resize(raise: Bool?) {
        guard let panel else { return }
        if let raise { elevated = raise }
        panel.level = elevated ? .statusBar : .floating
        let old = panel.frame
        let area = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
        let wide = state.expanded && state.wide
        let desiredWidth: CGFloat = state.compact ? 106 : wide ? 960 : 540
        let desiredHeight: CGFloat = state.expanded ? wide ? 630 : 370 : 58
        let width = min(desiredWidth, area?.width ?? desiredWidth)
        let height = min(desiredHeight, area?.height ?? desiredHeight)
        let candidate = old.midX - width / 2
        let x = area.map { max($0.minX, min(candidate, $0.maxX - width)) } ?? candidate
        let y = area.map { max($0.minY, min(old.minY, $0.maxY - height)) } ?? old.minY
        panel.setFrame(NSRect(x: x, y: y, width: width, height: height), display: true)
    }

    @objc private func connectSpotify() {
        spotifyEnabled = true
        nextSpotifyRead = .distantPast
        spotifyMenuItem?.title = "Consultando Spotify…"
        state.spotifyStatus = "Consultando…"
        pollSpotify()
    }

    private func pollSpotify() {
        guard spotifyEnabled, spotifyTask == nil, Date() >= nextSpotifyRead else { return }
        nextSpotifyRead = Date().addingTimeInterval(3)
        guard !NSRunningApplication.runningApplications(withBundleIdentifier: "com.spotify.client").isEmpty else {
            spotifyPlayback = nil
            return
        }

        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", """
            tell application "/Applications/Spotify.app"
                if player state is stopped then return ""
                set t to current track
                return (name of t) & linefeed & (artist of t) & linefeed & (spotify url of t) & linefeed & ((duration of t) as text) & linefeed & ((player position) as text) & linefeed & ((player state is playing) as text)
            end tell
            """]
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        process.terminationHandler = { [weak self] child in
            let data = output.fileHandleForReading.readDataToEndOfFile()
            let fields = String(decoding: data, as: UTF8.self)
                .trimmingCharacters(in: .newlines).components(separatedBy: "\n")
            let status = child.terminationStatus
            DispatchQueue.main.async {
                guard let self else { return }
                self.spotifyTask = nil
                if status != 0 {
                    self.spotifyEnabled = false
                    self.spotifyPlayback = nil
                    self.spotifyMenuItem?.title = "Spotify sin acceso · Reintentar"
                    self.state.spotifyStatus = "Reintentar Spotify"
                } else if fields.count == 6 {
                    self.spotifyMenuItem?.title = "Spotify conectado"
                    self.spotifyPlayback = Playback(
                        title: fields[0], artist: fields[1], provider: "spotify",
                        trackId: fields[2].split(separator: ":").last.map(String.init),
                        playing: fields[5] == "true",
                        positionMs: Double(fields[4].replacingOccurrences(of: ",", with: ".")).map { $0 * 1000 },
                        durationMs: Double(fields[3]).map { $0 < 10_000 ? $0 * 1000 : $0 },
                        observedAtMs: Date().timeIntervalSince1970 * 1000, lyrics: nil, cues: nil
                    )
                } else {
                    self.spotifyPlayback = nil
                    self.spotifyMenuItem?.title = "Spotify conectado · En espera"
                    self.state.spotifyStatus = "Spotify en espera"
                }
                self.poll()
            }
        }
        do {
            try process.run()
            spotifyTask = process
        } catch {
            spotifyEnabled = false
            spotifyMenuItem?.title = "Spotify sin acceso · Reintentar"
            state.spotifyStatus = "Reintentar Spotify"
        }
    }

    private func poll() {
        pollSpotify()
        let path = ProcessInfo.processInfo.environment["BLACKMAMBA_NOW_PLAYING_FILE"]
            ?? FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/BlackMamba Overlay/now-playing.json").path
        guard let data = FileManager.default.contents(atPath: path),
              let playback = try? JSONDecoder().decode(Playback.self, from: data),
              abs(Date().timeIntervalSince1970 * 1000 - playback.observedAtMs) < 15_000 else {
            publish(spotifyPlayback)
            return
        }
        publish(playback)
    }

    private func importLyrics(for track: Playback) {
        guard let current = state.playback, current.trackId == track.trackId,
              current.provider == track.provider else { return }
        guard let clipboard = NSPasteboard.general.string(forType: .string), !clipboard.isEmpty else {
            state.lyricImportMessage = "No hay texto en el portapapeles."
            return
        }
        do {
            state.playback?.lyrics = try catalog.saveImportedText(clipboard, for: current)
            state.lyricImportMessage = nil
        } catch {
            state.lyricImportMessage = "No se pudo guardar la letra para esta pista."
        }
    }

    private func publish(_ playback: Playback?) {
        guard state.playback?.observedAtMs != playback?.observedAtMs else { return }
        if state.playback?.trackId != playback?.trackId || state.playback?.provider != playback?.provider {
            state.lyricImportMessage = nil
        }
        guard var playback else {
            catalog.observe(nil)
            state.playback = nil
            state.sources = [:]
            return
        }
        catalog.observe(playback)
        let (entry, exact) = catalog.resolve(playback)
        state.sources = entry?.sources ?? [:]
        if exact {
            playback.lyrics = playback.lyrics ?? entry?.lyrics
            playback.cues = playback.cues ?? entry?.cues
        }
        if playback.lyrics == nil, playback.cues?.isEmpty != false {
            playback.lyrics = catalog.importedText(for: playback)
        }
        if playback.lyrics == nil, playback.cues?.isEmpty != false,
           let match = catalog.bankLyrics(for: playback) {
            playback.lyrics = match.lyrics
            state.sources.merge(match.sources) { existing, _ in existing }
        }
        if playback.lyrics == nil, playback.cues?.isEmpty != false,
           let urls = entry?.sources["SoundCloud"], urls.count == 1, let url = urls.first {
            playback.lyrics = catalog.cachedLyrics(for: url)
            if playback.lyrics == nil, let id = playback.trackId {
                Task { [weak self] in
                    guard let self, let lyrics = await self.catalog.fetchLyrics(for: url),
                          self.state.playback?.trackId == id,
                          self.state.playback?.provider == playback.provider,
                          self.state.playback?.lyrics == nil else { return }
                    self.state.playback?.lyrics = lyrics
                }
            }
        }
        state.playback = playback
    }

}

@main
struct OverlayMain {
    @MainActor static func main() {
        let app = NSApplication.shared
        let controller = OverlayController()
        app.setActivationPolicy(.accessory)
        app.delegate = controller
        withExtendedLifetime(controller) { app.run() }
    }
}
