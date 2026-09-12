import AppKit
import ApplicationServices
import Darwin
import Foundation

private let leftCommandKeyCode: UInt16 = 55

private var pressedKeyCodes = Set<UInt16>()
private var leftCommandIsDown = false
private var invalidPress = false

private func emit(_ message: String) {
    print(message)
    fflush(stdout)
}

private func cancelCurrentPress() {
    guard leftCommandIsDown, !invalidPress else { return }
    invalidPress = true
    emit("cancel")
}

private func handle(_ event: NSEvent) {
    switch event.type {
    case .flagsChanged:
        // flagsChanged is emitted once per modifier transition. Tracking the
        // hardware key code lets us distinguish left and right Command even
        // though both share the same .command modifier flag.
        let isDown = !pressedKeyCodes.contains(event.keyCode)
        if isDown {
            pressedKeyCodes.insert(event.keyCode)
        } else {
            pressedKeyCodes.remove(event.keyCode)
        }
        if event.keyCode == leftCommandKeyCode {
            if isDown && !leftCommandIsDown {
                leftCommandIsDown = true
                invalidPress = pressedKeyCodes.contains { $0 != leftCommandKeyCode }
                if invalidPress { emit("cancel") } else { emit("down") }
            } else if !isDown && leftCommandIsDown {
                emit("up")
                leftCommandIsDown = false
                invalidPress = false
            }
        } else if leftCommandIsDown {
            // Any other modifier, including the right Command key, makes this
            // a combination rather than a left-Command-only press.
            cancelCurrentPress()
        }
    case .keyDown:
        pressedKeyCodes.insert(event.keyCode)
        if leftCommandIsDown && event.keyCode != leftCommandKeyCode {
            cancelCurrentPress()
        }
    case .keyUp:
        pressedKeyCodes.remove(event.keyCode)
    default:
        break
    }
}

guard AXIsProcessTrusted() else {
    fputs("Accessibility permission is required for the left Command shortcut.\n", stderr)
    exit(2)
}

guard NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged, .keyDown, .keyUp], handler: handle) != nil else {
    fputs("Unable to install the global keyboard monitor.\n", stderr)
    exit(3)
}

emit("ready")
RunLoop.main.run()
