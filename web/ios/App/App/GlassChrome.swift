import Capacitor
import PhotosUI
import UIKit

/// Hosts the web app and registers the in-app native plugin.
class MainViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlassChromePlugin())
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwiped(_:)))
        edge.edges = .left
        edge.delegate = self
        webView?.addGestureRecognizer(edge)
    }

    /// A swipe in from the left edge sends `edgeback` to the web app, which closes the top layer (lib/native.ts).
    @objc private func edgeSwiped(_ g: UIScreenEdgePanGestureRecognizer) {
        guard g.state == .ended, let view = g.view else { return }
        let t = g.translation(in: view)
        let v = g.velocity(in: view)
        guard t.x > abs(t.y), t.x > 80 || (t.x > 30 && v.x > 600) else { return }
        bridge?.triggerWindowJSEvent(eventName: "edgeback")
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}

/// Native camera chrome drawn above the web view so the controls get the system Liquid Glass material on iOS 26+
/// (with a blur fallback on older iOS). Taps are forwarded to the web app as `tap` events.
/// Capacitor calls plugin methods off the main thread; every UIKit touch hops to the main actor, and the
/// mutable view references below are only read or written there.
@objc(GlassChromePlugin)
public final class GlassChromePlugin: CAPPlugin, CAPBridgedPlugin, @unchecked Sendable {
    public let identifier = "GlassChromePlugin"
    public let jsName = "GlassChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCameraControls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCloseButton", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
    ]

    private static let accent = UIColor(red: 0.937, green: 0.416, blue: 0.227, alpha: 1)
    @MainActor private var bar: UIStackView?
    @MainActor private var badge: UILabel?
    @MainActor private var closeButton: UIButton?
    @MainActor private lazy var picker = PhotoPicker()

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
        let call = CallBox(call)
        Task { @MainActor in
            if visible, self.bar == nil { self.buildBar() }
            self.updateBadge(count)
            self.animate(self.bar, visible: visible, offset: 40)
            call.value.resolve()
        }
    }

    @objc func setCloseButton(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        let call = CallBox(call)
        Task { @MainActor in
            if visible, self.closeButton == nil { self.buildClose() }
            self.animate(self.closeButton, visible: visible, offset: -12)
            call.value.resolve()
        }
    }

    @objc func pickPhoto(_ call: CAPPluginCall) {
        let call = CallBox(call)
        Task { @MainActor in
            guard let presenter = self.bridge?.viewController else { return call.value.reject("no view controller") }
            switch await self.picker.pick(from: presenter) {
            case .cancelled: call.value.resolve(["cancelled": true])
            case .failed: call.value.reject("この画像は読み込めませんでした")
            case .picked(let data): call.value.resolve(["data": data.base64EncodedString(), "mimeType": "image/jpeg"])
            }
        }
    }

    // MARK: - Views

    @MainActor private var host: UIView? { bridge?.viewController?.view }

    @MainActor private func glassConfig(prominent: Bool) -> UIButton.Configuration {
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

    /// モノシリのマーク（Assets の BrandMark、元は web/assets/mark.svg）を、Web版の Icon と同じく1文字分の大きさで描く
    private static func brandMark(size: CGFloat) -> UIImage? {
        guard let mark = UIImage(named: "BrandMark") else { return nil }
        let image = UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { _ in
            mark.draw(in: CGRect(x: 0, y: 0, width: size, height: size))
        }
        return image.withRenderingMode(.alwaysTemplate)
    }

    @MainActor private func makeButton(id: String, symbol: String, image: UIImage? = nil, size: CGFloat, prominent: Bool = false, label: String) -> UIButton {
        var c = glassConfig(prominent: prominent)
        c.cornerStyle = .capsule
        c.image = image ?? UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: size * (prominent ? 0.36 : 0.4), weight: .semibold))
        c.baseForegroundColor = prominent ? Self.accent : .white
        let b = UIButton(configuration: c, primaryAction: UIAction { [weak self] _ in
            self?.notifyListeners("tap", data: ["id": id])
        })
        // 撮影ボタンはいつも白地にオレンジ。ダークモードのガラスだと白地がくすみ、マークも淡くなるので、ライトの見た目に固定する
        if prominent { b.overrideUserInterfaceStyle = .light }
        b.accessibilityLabel = label
        b.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([b.widthAnchor.constraint(equalToConstant: size), b.heightAnchor.constraint(equalToConstant: size)])
        return b
    }

    @MainActor private func buildBar() {
        guard let host else { return }
        let gallery = makeButton(id: "gallery", symbol: "photo.on.rectangle.angled", size: 58, label: "写真をえらぶ")
        // 撮影ボタンはアプリのアイコンと同じマーク。Web版（白丸64にマーク34）と同じ割合にする
        let shutter = makeButton(id: "shutter", symbol: "magnifyingglass", image: Self.brandMark(size: 40), size: 74, prominent: true, label: "撮影する")
        // Web版と同じく、白い丸のまわりに白い輪を重ねて、カメラのシャッターらしい二重丸にする
        let ring = UIView()
        ring.isUserInteractionEnabled = false
        ring.backgroundColor = .clear
        ring.layer.borderColor = UIColor.white.withAlphaComponent(0.95).cgColor
        ring.layer.borderWidth = 4
        ring.layer.cornerRadius = 45
        ring.translatesAutoresizingMaskIntoConstraints = false
        shutter.addSubview(ring)
        NSLayoutConstraint.activate([
            ring.centerXAnchor.constraint(equalTo: shutter.centerXAnchor),
            ring.centerYAnchor.constraint(equalTo: shutter.centerYAnchor),
            ring.widthAnchor.constraint(equalToConstant: 90),
            ring.heightAnchor.constraint(equalToConstant: 90),
        ])
        let zukan = makeButton(id: "zukan", symbol: "rectangle.stack.fill", size: 58, label: "図鑑をひらく")

        let badge = UILabel()
        badge.font = .systemFont(ofSize: 12, weight: .heavy)
        badge.textColor = .white
        badge.backgroundColor = Self.accent
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

    @MainActor private func buildClose() {
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

    @MainActor private func updateBadge(_ count: Int) {
        badge?.isHidden = count <= 0
        badge?.text = count > 99 ? "99+" : " \(count) "
    }

    @MainActor private func animate(_ view: UIView?, visible: Bool, offset: CGFloat) {
        guard let view else { return }
        if visible {
            view.isHidden = false
            view.superview?.bringSubviewToFront(view)
        }
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.82, initialSpringVelocity: 0.4, options: [.allowUserInteraction]) {
            view.alpha = visible ? 1 : 0
            view.transform = visible ? .identity : CGAffineTransform(translationX: 0, y: offset).scaledBy(x: 0.92, y: 0.92)
        } completion: { _ in
            if !visible { view.isHidden = true }
        }
    }
}

/// Capacitor's call object is not Sendable, but resolving it from the main actor is safe, so it is boxed to cross over.
private struct CallBox: @unchecked Sendable {
    let value: CAPPluginCall
    init(_ value: CAPPluginCall) { self.value = value }
}

/// System photo picker; returns a JPEG no larger than 1600px on the long side.
@MainActor
final class PhotoPicker: NSObject, PHPickerViewControllerDelegate {
    enum Result { case picked(Data), cancelled, failed }

    private var continuation: CheckedContinuation<Result, Never>?

    func pick(from presenter: UIViewController) async -> Result {
        continuation?.resume(returning: .cancelled)
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        presenter.present(picker, animated: true)
        return await withCheckedContinuation { continuation = $0 }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        let done = continuation
        continuation = nil
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            done?.resume(returning: .cancelled)
            return
        }
        provider.loadObject(ofClass: UIImage.self) { object, _ in
            let image = object as? UIImage
            let data = image.flatMap { Self.jpeg($0, maxSide: 1600) }
            done?.resume(returning: data.map(Result.picked) ?? .failed)
        }
    }

    nonisolated private static func jpeg(_ image: UIImage, maxSide: CGFloat) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.9)
    }
}
