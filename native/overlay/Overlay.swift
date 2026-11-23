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

final class OverlayState: ObservableObject {
    @Published var playback: Playback?
    @Published var expanded = false
    @Published var sources: [String: [URL]] = [:]
    @Published var compact = false
    @Published var opacity = 0.94
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

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "line.3.horizontal")
                    .foregroundStyle(.secondary)
                    .help("Arrastra por los bordes del panel")
                Button {
                    state.compact = false
                    state.expanded.toggle()
                    configure(nil)
                } label: {
                    let track = state.playback
                    let title = [track?.artist, track?.title].compactMap { $0 }.filter { !$0.isEmpty }
                    Text(state.compact ? "♪" : title.isEmpty ? "Esperando reproducción" : title.joined(separator: " · "))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .help(state.expanded ? "Ocultar letra" : "Ver letra")
                if !state.compact && state.playback == nil {
                    Button(state.spotifyStatus, action: connect)
                        .buttonStyle(.bordered)
                }
                if !state.compact {
                    Button {
                        state.expanded = false
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
            if state.expanded {
                Divider()
                lyrics
                if !state.sources.isEmpty {
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
                HStack {
                    Text("Transparencia")
                    Slider(value: $state.opacity, in: 0.35...1)
                        .accessibilityLabel("Transparencia")
                    Menu("Nivel") {
                        Button("Flotante") { configure(false) }
                        Button("Sobre otras ventanas flotantes") { configure(true) }
                    }
                    Button("Cerrar letra") {
                        state.expanded = false
                        configure(nil)
                    }
                }
                .padding(12)
            }
        }
        .foregroundStyle(Color(red: 1, green: 0.8, blue: 0.47))
        .background(Color(red: 0.08, green: 0.06, blue: 0.04).opacity(state.opacity))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(5)
        .preferredColorScheme(.dark)
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
                            Text(track?.lyrics ?? "Todavía no hay letra vinculada a esta grabación.")
                        } else {
                            ForEach(cues.indices, id: \.self) { index in
                                Text(cues[index].text)
                                    .fontWeight(index == active ? .bold : .regular)
                                    .foregroundStyle(index == active ? Color.white : Color(white: 0.72))
                                    .id(index)
                            }
                        }
                    }
                    .font(.system(size: 24))
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

    @objc private func show() { panel?.orderFrontRegardless() }

    private func resize(raise: Bool?) {
        guard let panel else { return }
        if let raise { elevated = raise }
        panel.level = elevated ? .statusBar : .floating
        let old = panel.frame
        let width: CGFloat = state.compact ? 106 : 540
        let height: CGFloat = state.expanded ? 340 : 58
        let area = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
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
                        durationMs: Double(fields[3]),
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

    private func publish(_ playback: Playback?) {
        guard state.playback?.observedAtMs != playback?.observedAtMs else { return }
        guard var playback else {
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
