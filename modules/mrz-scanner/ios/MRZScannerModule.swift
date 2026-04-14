import ExpoModulesCore
import UIKit

public class MRZScannerModule: Module {
    public func definition() -> ModuleDefinition {
        Name("MRZScanner")

        AsyncFunction("scanMRZ") { (options: [String: Any]?, promise: Promise) in
            let instructionText = (options?["instructionText"] as? String)
            let isChipShow = (options?["isChipShow"] as? Bool) ?? true
            let timeoutMs = (options?["timeoutMs"] as? Double) ?? 0
            DispatchQueue.main.async {
                self.presentScanner(promise: promise, instructionText: instructionText, isChipShow: isChipShow, timeoutMs: timeoutMs)
            }
        }
    }

    private func presentScanner(promise: Promise, instructionText: String?, isChipShow: Bool = true, timeoutMs: Double = 0) {
        guard let presenter = topViewController() else {
            // Fix #13: English error message (was Turkish)
            promise.reject("ERR_UI", "Scanner could not be opened: no active view controller found.")
            return
        }

        var completed = false

        let scanner = VisionViewController()
        scanner.modalPresentationStyle = .fullScreen

        if let text = instructionText, !text.isEmpty {
            scanner.instructionText = text
        }

        scanner.isChipShow = isChipShow

        scanner.completionHandler = { mrz in
            guard !completed else { return }
            completed = true
            scanner.dismiss(animated: true) {
                promise.resolve(mrz)
            }
        }

        scanner.onCancel = {
            guard !completed else { return }
            completed = true
            // Fix #7: English error message
            promise.reject("ERR_CANCELLED", "MRZ scan was cancelled.")
        }

        presenter.present(scanner, animated: true)

        // Fix #10: timeout support
        if timeoutMs > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + timeoutMs / 1000.0) {
                guard !completed else { return }
                completed = true
                scanner.dismiss(animated: true) {
                    promise.reject("ERR_TIMEOUT", "MRZ scan timed out after \(Int(timeoutMs))ms.")
                }
            }
        }
    }

    private func topViewController(base: UIViewController? = nil) -> UIViewController? {
        let baseController: UIViewController?

        if let base {
            baseController = base
        } else {
            let scenes = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .filter { $0.activationState == .foregroundActive }
            let window = scenes
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }
            baseController = window?.rootViewController
        }

        if let nav = baseController as? UINavigationController {
            return topViewController(base: nav.visibleViewController)
        }

        if let tab = baseController as? UITabBarController {
            return topViewController(base: tab.selectedViewController)
        }

        if let presented = baseController?.presentedViewController {
            return topViewController(base: presented)
        }

        return baseController
    }
}
