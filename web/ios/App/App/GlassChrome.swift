import Capacitor
import PhotosUI
import UIKit

/// Hosts the web app and registers the in-app native plugin.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlassChromePlugin())
    }
}

/// Native camera chrome drawn above the web view so the controls get the system Liquid Glass material on iOS 26+
/// (with a blur fallback on older iOS). Taps are forwarded to the web app as `tap` events.
@objc(GlassChromePlugin)
public class GlassChromePlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "GlassChromePlugin"
    public let jsName = "GlassChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCameraControls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCloseButton", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
    ]

    private let accent = UIColor(red: 0.937, green: 0.416, blue: 0.227, alpha: 1)
    private var bar: UIStackView?
    private var badge: UILabel?
    private var closeButton: UIButton?
    private var pendingPick: CAPPluginCall?

    private var host: UIView? { bridge?.viewController?.view }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["liquidGlass": true])
        } else {
            call.resolve(["liquidGlass": false])
        }
    }

    @objc func setCameraControls(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        let count = call.getInt("count") ?? 0
        DispatchQueue.main.async {
            if visible, self.bar == nil { self.buildBar() }
            self.updateBadge(count)
            self.animate(self.bar, visible: visible, offset: 40)
            call.resolve()
        }
    }

    @objc func setCloseButton(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        DispatchQueue.main.async {
            if visible, self.closeButton == nil { self.buildClose() }
            self.animate(self.closeButton, visible: visible, offset: -12)
            call.resolve()
        }
    }

    @objc func pickPhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var config = PHPickerConfiguration()
            config.filter = .images
            config.selectionLimit = 1
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.pendingPick = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingPick else { return }
        pendingPick = nil
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            call.resolve(["cancelled": true])
            return
        }
        provider.loadObject(ofClass: UIImage.self) { object, _ in
            guard let image = object as? UIImage, let data = Self.jpeg(image, maxSide: 1600) else {
                call.reject("この画像は読み込めませんでした")
                return
            }
            call.resolve(["data": data.base64EncodedString(), "mimeType": "image/jpeg"])
        }
    }

    // MARK: - Views

    private func glassConfig(prominent: Bool = false) -> UIButton.Configuration {
        if #available(iOS 26.0, *) {
            var c: UIButton.Configuration = prominent ? .prominentGlass() : .glass()
            if prominent { c.baseBackgroundColor = .white }
            return c
        }
        var c = UIButton.Configuration.filled()
        c.baseBackgroundColor = prominent ? .white : UIColor(white: 0, alpha: 0.38)
        c.background.visualEffect = prominent ? nil : UIBlurEffect(style: .systemUltraThinMaterialDark)
        return c
    }

    private func makeButton(id: String, symbol: String, size: CGFloat, prominent: Bool = false, label: String) -> UIButton {
        var c = glassConfig(prominent: prominent)
        c.cornerStyle = .capsule
        c.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: size * (prominent ? 0.36 : 0.4), weight: .semibold))
        c.baseForegroundColor = prominent ? accent : .white
        let b = UIButton(configuration: c, primaryAction: UIAction { [weak self] _ in
            self?.notifyListeners("tap", data: ["id": id])
        })
        b.accessibilityLabel = label
        b.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([b.widthAnchor.constraint(equalToConstant: size), b.heightAnchor.constraint(equalToConstant: size)])
        return b
    }

    private func buildBar() {
        guard let host else { return }
        let gallery = makeButton(id: "gallery", symbol: "photo.on.rectangle.angled", size: 58, label: "写真をえらぶ")
        let shutter = makeButton(id: "shutter", symbol: "magnifyingglass", size: 86, prominent: true, label: "撮影する")
        let zukan = makeButton(id: "zukan", symbol: "rectangle.stack.fill", size: 58, label: "図鑑をひらく")

        let badge = UILabel()
        badge.font = .systemFont(ofSize: 12, weight: .heavy)
        badge.textColor = .white
        badge.backgroundColor = accent
        badge.textAlignment = .center
        badge.layer.cornerRadius = 11
        badge.layer.masksToBounds = true
        badge.isHidden = true
        badge.translatesAutoresizingMaskIntoConstraints = false
        zukan.addSubview(badge)
        NSLayoutConstraint.activate([
            badge.topAnchor.constraint(equalTo: zukan.topAnchor, constant: -4),
            badge.trailingAnchor.constraint(equalTo: zukan.trailingAnchor, constant: 4),
            badge.heightAnchor.constraint(equalToConstant: 22),
            badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 22),
        ])
        self.badge = badge

        let stack = UIStackView(arrangedSubviews: [gallery, shutter, zukan])
        stack.axis = .horizontal
        stack.alignment = .center
        stack.distribution = .equalCentering
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.alpha = 0
        host.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            stack.widthAnchor.constraint(equalToConstant: min(320, host.bounds.width - 64)),
            stack.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -12),
        ])
        bar = stack
    }

    private func buildClose() {
        guard let host else { return }
        let b = makeButton(id: "close", symbol: "xmark", size: 48, label: "カメラにもどる")
        b.alpha = 0
        host.addSubview(b)
        NSLayoutConstraint.activate([
            b.leadingAnchor.constraint(equalTo: host.leadingAnchor, constant: 16),
            b.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 8),
        ])
        closeButton = b
    }

    private func updateBadge(_ count: Int) {
        badge?.isHidden = count <= 0
        badge?.text = count > 99 ? "99+" : " \(count) "
    }

    private func animate(_ view: UIView?, visible: Bool, offset: CGFloat) {
        guard let view else { return }
        if visible { view.isHidden = false; view.superview?.bringSubviewToFront(view) }
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.82, initialSpringVelocity: 0.4, options: [.allowUserInteraction]) {
            view.alpha = visible ? 1 : 0
            view.transform = visible ? .identity : CGAffineTransform(translationX: 0, y: offset).scaledBy(x: 0.92, y: 0.92)
        } completion: { _ in
            if !visible { view.isHidden = true }
        }
    }

    private static func jpeg(_ image: UIImage, maxSide: CGFloat) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.9)
    }
}
