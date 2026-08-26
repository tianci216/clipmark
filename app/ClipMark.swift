import AppKit
import WebKit

let PORT = 8899
let HOME_URL = URL(string: "http://127.0.0.1:8899")!
let HEALTH_URL = URL(string: "http://127.0.0.1:8899/api/health")!

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var healthTimer: Timer?
    var dataDir: URL!

    func applicationDidFinishLaunching(_ notification: Notification) {
        dataDir = appSupportClipMarkDir()
        buildMainMenu()
        makeWindow()
        startServer()
    }

    // MARK: - Server lifecycle

    private func startServer() {
        if serverIsHealthy() {
            loadApp()
            return
        }
        let node = findNodeBinary()
        guard let node else {
            showFatalError("Could not find Node.js. ClipMark needs Node on your system (Homebrew: `brew install node`).")
            return
        }
        let serverEntry = Bundle.main.resourceURL!.appendingPathComponent("server/index.js")
        guard FileManager.default.fileExists(atPath: serverEntry.path) else {
            showFatalError("Server bundle missing at \(serverEntry.path). Rebuild the app.")
            return
        }
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: node)
        proc.arguments = [serverEntry.path]
        var env = ProcessInfo.processInfo.environment
        env["CLIPMARK_DATA_DIR"] = dataDir.path
        // The Library Folder is a server-owned setting (ADR-0005), changed from the app's
        // Settings pane. A folder chosen through the old "Choose Video Folder…" menu is
        // handed over once as the first-run seed so an existing install keeps working.
        if let legacyFolder = UserDefaults.standard.string(forKey: "videoDir") {
            env["CLIPMARK_VIDEO_DIR"] = legacyFolder
        }
        proc.environment = env

        let logURL = dataDir.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        proc.standardOutput = FileHandle(forWritingAtPath: logURL.path)
        proc.standardError = FileHandle(forWritingAtPath: logURL.path)

        proc.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { self?.serverProcess = nil }
        }

        do {
            try proc.run()
            serverProcess = proc
            pollUntilHealthy()
        } catch {
            showFatalError("Failed to launch server: \(error.localizedDescription)")
        }
    }

    private func findNodeBinary() -> String? {
        let candidates = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private func serverIsHealthy() -> Bool {
        guard let url = HEALTH_URL as URL? else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1
        let semaphore = DispatchSemaphore(value: 0)
        var healthy = false
        URLSession.shared.dataTask(with: request) { _, response, _ in
            healthy = (response as? HTTPURLResponse)?.statusCode == 200
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 2)
        return healthy
    }

    private func pollUntilHealthy() {
        healthTimer?.invalidate()
        healthTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] timer in
            guard let self else { return }
            if self.serverIsHealthy() {
                timer.invalidate()
                self.loadApp()
            }
        }
    }

    private func stopServer() {
        if let proc = serverProcess, proc.isRunning {
            proc.interrupt()
            proc.waitUntilExit()
        }
        serverProcess = nil
    }

    // MARK: - UI

    private func makeWindow() {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "ClipMark"
        window.isReleasedWhenClosed = false
        window.center()
        window.contentView = webView
        window.setFrameAutosaveName("ClipMarkWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }

    private func loadApp() {
        guard !webView.isLoading, webView.url == nil else { return }
        webView.load(URLRequest(url: HOME_URL))
    }

    private func buildMainMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About ClipMark", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit ClipMark", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        // Edit menu: without it, Cmd+C/V/X/A never reach the WKWebView's
        // text fields (AppKit routes the key equivalents via the menu bar).
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenuItem.submenu = viewMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadPage() {
        webView.reload()
    }

    private func showFatalError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "ClipMark can't start"
        alert.informativeText = message
        alert.runModal()
    }

    // MARK: - App lifecycle

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            if let window {
                window.makeKeyAndOrderFront(nil)
            } else {
                makeWindow()
                loadApp()
            }
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    private func appSupportClipMarkDir() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("ClipMark")
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
