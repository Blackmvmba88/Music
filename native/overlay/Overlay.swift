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
    let observedAtMs: Double
    let lyrics: String?
    let cues: [Cue]?

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
    @Published var compact = false
    @Published var opacity = 0.94
}

final class SubtitlePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

struct OverlayView: View {
    @ObservedObject var state: OverlayState
    let close: () -> Void
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
    private var panel: SubtitlePanel?
    private var timer: Timer?
    private var statusItem: NSStatusItem?
    private var elevated = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        menu.addItem(withTitle: "Mostrar cintilla", action: #selector(show), keyEquivalent: "").target = self
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
        }, configure: { [weak self] raise in
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

    private func poll() {
        let path = ProcessInfo.processInfo.environment["BLACKMAMBA_NOW_PLAYING_FILE"]
            ?? FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/BlackMamba Overlay/now-playing.json").path
        guard let data = FileManager.default.contents(atPath: path),
              let playback = try? JSONDecoder().decode(Playback.self, from: data),
              abs(Date().timeIntervalSince1970 * 1000 - playback.observedAtMs) < 15_000 else {
            if state.playback != nil { state.playback = nil }
            return
        }
        if state.playback?.observedAtMs != playback.observedAtMs { state.playback = playback }
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
