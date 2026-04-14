import UIKit
import AVFoundation
import Vision

public class MRZViewController: UIViewController {

    // MARK: – Camera preview
    var previewView: PreviewView!

    // MARK: – Overlay layers & views
    private var overlayView: UIView!
    private var maskLayer = CAShapeLayer()
    private var cardBorderLayer = CAShapeLayer()
    private var cornerLayers: [CAShapeLayer] = []
    private var mrzBandView: UIView!
    private var mrzLine1Label: UILabel!
    private var mrzLine2Label: UILabel!
    private var scanLineView: UIView!
    var hintLabel: UILabel!

    // MARK: – Public configuration
    // Fix #7: default instruction text in English (was Turkish)
    var instructionText: String = "Place the back of your document in the frame" {
        didSet { hintLabel?.text = instructionText }
    }

    // MARK: – Camera & capture
    var currentOrientation = UIDeviceOrientation.portrait
    private let captureSession = AVCaptureSession()
    let captureSessionQueue = DispatchQueue(label: "cc.getportal.mrz.capture")
    var captureDevice: AVCaptureDevice?
    var videoDataOutput = AVCaptureVideoDataOutput()
    let videoDataOutputQueue = DispatchQueue(label: "cc.getportal.mrz.video")

    // MARK: – Region of interest & transforms
    var regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
    var textOrientation = CGImagePropertyOrientation.up
    var bufferAspectRatio: Double = 16.0 / 9.0
    var uiRotationTransform = CGAffineTransform.identity
    var bottomToTopTransform = CGAffineTransform(scaleX: 1, y: -1).translatedBy(x: 0, y: -1)
    var roiToGlobalTransform = CGAffineTransform.identity
    var visionToAVFTransform = CGAffineTransform.identity

    // MARK: – Card frame constants
    private let cardAspectRatio: CGFloat = 85.6 / 54.0   // ID-1 standard
    private let cardWidthRatio: CGFloat = 0.88
    private(set) var cardRect: CGRect = .zero

    // ─────────────────────────────────────────────
    // MARK: – Lifecycle
    // ─────────────────────────────────────────────

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        NotificationCenter.default.addObserver(self, selector: #selector(appWillEnterForeground),
                                               name: UIApplication.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)

        setupPreviewView()
        setupOverlay()
        setupCardOverlayElements()

        previewView.session = captureSession

        captureSessionQueue.async {
            self.setupCamera()
            DispatchQueue.main.async {
                self.calculateRegionOfInterest()
            }
        }
    }

    public override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        captureSessionQueue.async {
            if !self.captureSession.isRunning { self.captureSession.startRunning() }
        }
    }

    public override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        captureSessionQueue.async {
            if self.captureSession.isRunning { self.captureSession.stopRunning() }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if captureSession.isRunning { captureSession.stopRunning() }
    }

    @objc private func appWillEnterForeground() {
        captureSessionQueue.async {
            if !self.captureSession.isRunning { self.captureSession.startRunning() }
        }
    }

    @objc private func appDidEnterBackground() {
        captureSessionQueue.async {
            if self.captureSession.isRunning { self.captureSession.stopRunning() }
        }
    }

    public override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        let deviceOrientation = UIDevice.current.orientation
        if deviceOrientation.isPortrait || deviceOrientation.isLandscape {
            currentOrientation = deviceOrientation
        }
        if let connection = previewView.videoPreviewLayer.connection,
           let newOrientation = AVCaptureVideoOrientation(deviceOrientation: deviceOrientation) {
            connection.videoOrientation = newOrientation
        }
        calculateRegionOfInterest()
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        updateCutout()
    }

    // ─────────────────────────────────────────────
    // MARK: – UI Setup
    // ─────────────────────────────────────────────

    private func setupPreviewView() {
        previewView = PreviewView()
        previewView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(previewView)
        NSLayoutConstraint.activate([
            previewView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewView.topAnchor.constraint(equalTo: view.topAnchor),
            previewView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupOverlay() {
        overlayView = UIView()
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        overlayView.isUserInteractionEnabled = false
        view.addSubview(overlayView)
        NSLayoutConstraint.activate([
            overlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlayView.topAnchor.constraint(equalTo: view.topAnchor),
            overlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        overlayView.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        maskLayer.backgroundColor = UIColor.clear.cgColor
        maskLayer.fillRule = .evenOdd
        overlayView.layer.mask = maskLayer
    }

    private func setupCardOverlayElements() {
        // Thin card border
        cardBorderLayer.fillColor = UIColor.clear.cgColor
        cardBorderLayer.strokeColor = UIColor.white.withAlphaComponent(0.35).cgColor
        cardBorderLayer.lineWidth = 1.5
        view.layer.addSublayer(cardBorderLayer)

        // Four corner brackets
        for _ in 0..<4 {
            let corner = CAShapeLayer()
            corner.fillColor = UIColor.clear.cgColor
            corner.strokeColor = UIColor.white.cgColor
            corner.lineWidth = 3.0
            corner.lineCap = .round
            cornerLayers.append(corner)
            view.layer.addSublayer(corner)
        }

        // MRZ preview band (semi-transparent dark rectangle at bottom 28% of card)
        mrzBandView = UIView()
        mrzBandView.backgroundColor = UIColor.black.withAlphaComponent(0.25)
        mrzBandView.isUserInteractionEnabled = false
        mrzBandView.clipsToBounds = true
        view.addSubview(mrzBandView)

        // MRZ sample text line 1
        mrzLine1Label = UILabel()
        mrzLine1Label.text = "P<GBRSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<"
        mrzLine1Label.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        mrzLine1Label.textColor = UIColor.white.withAlphaComponent(0.35)
        mrzLine1Label.numberOfLines = 1
        mrzBandView.addSubview(mrzLine1Label)

        // MRZ sample text line 2
        mrzLine2Label = UILabel()
        mrzLine2Label.text = "AB1234567<GBR8001011M3001015<<<<<<<<<<<6"
        mrzLine2Label.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        mrzLine2Label.textColor = UIColor.white.withAlphaComponent(0.35)
        mrzLine2Label.numberOfLines = 1
        mrzBandView.addSubview(mrzLine2Label)

        // Animated scan line (full screen width)
        scanLineView = UIView()
        scanLineView.backgroundColor = UIColor(red: 0.3, green: 0.75, blue: 1.0, alpha: 0.5)
        scanLineView.layer.cornerRadius = 1
        view.addSubview(scanLineView)

        // Hint label
        hintLabel = UILabel()
        hintLabel.text = instructionText
        hintLabel.textColor = .white
        hintLabel.font = .systemFont(ofSize: 15, weight: .medium)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.layer.shadowColor = UIColor.black.cgColor
        hintLabel.layer.shadowOffset = CGSize(width: 0, height: 1)
        hintLabel.layer.shadowOpacity = 0.7
        hintLabel.layer.shadowRadius = 3
        view.addSubview(hintLabel)
    }

    // ─────────────────────────────────────────────
    // MARK: – Region of Interest (text recognition)
    // ─────────────────────────────────────────────

    func calculateRegionOfInterest() {
        regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
        setupOrientationAndTransform()
        DispatchQueue.main.async { self.updateCutout() }
    }

    // ─────────────────────────────────────────────
    // MARK: – Cutout & Overlay Layout
    // ─────────────────────────────────────────────

    func updateCutout() {
        let vw = view.bounds.width
        let vh = view.bounds.height
        guard vw > 0, vh > 0 else { return }

        let cardW = vw * cardWidthRatio
        let cardH = cardW / cardAspectRatio
        let cardX = (vw - cardW) / 2
        let cardY = (vh - cardH) / 2 - cardH * 0.08
        cardRect = CGRect(x: cardX, y: cardY, width: cardW, height: cardH)

        let cr: CGFloat = 12

        let full = UIBezierPath(rect: overlayView.bounds)
        full.append(UIBezierPath(roundedRect: cardRect, cornerRadius: cr))
        maskLayer.path = full.cgPath

        cardBorderLayer.path = UIBezierPath(roundedRect: cardRect, cornerRadius: cr).cgPath

        layoutCornerBrackets(cornerRadius: cr)

        // MRZ preview band — bottom 28% of card, bottom corners rounded to match card
        let bandH = cardH * 0.28
        let bandY = cardRect.maxY - bandH
        let bandRect = CGRect(x: cardRect.minX, y: bandY, width: cardW, height: bandH)
        mrzBandView.frame = bandRect

        // Round only bottom corners to match card corner radius
        let bandMask = CAShapeLayer()
        let bandPath = UIBezierPath(
            roundedRect: mrzBandView.bounds,
            byRoundingCorners: [.bottomLeft, .bottomRight],
            cornerRadii: CGSize(width: cr, height: cr)
        )
        bandMask.path = bandPath.cgPath
        mrzBandView.layer.mask = bandMask

        // MRZ text labels inside band
        let textInset: CGFloat = 8
        let gap: CGFloat = 4
        let lineHeight: CGFloat = 17 // approximate height for 14pt monospaced
        mrzLine1Label.frame = CGRect(
            x: textInset,
            y: textInset,
            width: bandRect.width - 2 * textInset,
            height: lineHeight
        )
        mrzLine2Label.frame = CGRect(
            x: textInset,
            y: textInset + lineHeight + gap,
            width: bandRect.width - 2 * textInset,
            height: lineHeight
        )

        // Scan line — full screen width, sweeps full screen height
        scanLineView.frame = CGRect(x: 0, y: 0, width: vw, height: 2)
        startScanLineAnimation()

        hintLabel.frame = CGRect(
            x: cardRect.minX - 10,
            y: cardRect.maxY + 24,
            width: cardW + 20,
            height: 50
        )
    }

    // MARK: Corner brackets

    private func layoutCornerBrackets(cornerRadius cr: CGFloat) {
        let len: CGFloat = 28
        let r = cardRect

        // Top-left
        let tl = UIBezierPath()
        tl.move(to: CGPoint(x: r.minX, y: r.minY + cr + len))
        tl.addLine(to: CGPoint(x: r.minX, y: r.minY + cr))
        tl.addQuadCurve(to: CGPoint(x: r.minX + cr, y: r.minY),
                        controlPoint: CGPoint(x: r.minX, y: r.minY))
        tl.addLine(to: CGPoint(x: r.minX + cr + len, y: r.minY))
        cornerLayers[0].path = tl.cgPath

        // Top-right
        let tr = UIBezierPath()
        tr.move(to: CGPoint(x: r.maxX - cr - len, y: r.minY))
        tr.addLine(to: CGPoint(x: r.maxX - cr, y: r.minY))
        tr.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + cr),
                        controlPoint: CGPoint(x: r.maxX, y: r.minY))
        tr.addLine(to: CGPoint(x: r.maxX, y: r.minY + cr + len))
        cornerLayers[1].path = tr.cgPath

        // Bottom-left
        let bl = UIBezierPath()
        bl.move(to: CGPoint(x: r.minX, y: r.maxY - cr - len))
        bl.addLine(to: CGPoint(x: r.minX, y: r.maxY - cr))
        bl.addQuadCurve(to: CGPoint(x: r.minX + cr, y: r.maxY),
                        controlPoint: CGPoint(x: r.minX, y: r.maxY))
        bl.addLine(to: CGPoint(x: r.minX + cr + len, y: r.maxY))
        cornerLayers[2].path = bl.cgPath

        // Bottom-right
        let br = UIBezierPath()
        br.move(to: CGPoint(x: r.maxX - cr - len, y: r.maxY))
        br.addLine(to: CGPoint(x: r.maxX - cr, y: r.maxY))
        br.addQuadCurve(to: CGPoint(x: r.maxX, y: r.maxY - cr),
                        controlPoint: CGPoint(x: r.maxX, y: r.maxY))
        br.addLine(to: CGPoint(x: r.maxX, y: r.maxY - cr - len))
        cornerLayers[3].path = br.cgPath
    }

    // MARK: Scan line animation

    private func startScanLineAnimation() {
        scanLineView.layer.removeAllAnimations()
        let vh = view.bounds.height
        guard vh > 0 else { return }

        scanLineView.frame.origin.y = 0
        scanLineView.alpha = 1.0

        UIView.animate(withDuration: 2.5, delay: 0,
                       options: [.repeat, .curveLinear],
                       animations: {
            self.scanLineView.frame.origin.y = vh - 2
        })
    }

    // ─────────────────────────────────────────────
    // MARK: – Orientation
    // ─────────────────────────────────────────────

    func setupOrientationAndTransform() {
        let roi = regionOfInterest
        roiToGlobalTransform = CGAffineTransform(translationX: roi.origin.x, y: roi.origin.y)
            .scaledBy(x: roi.width, y: roi.height)

        switch currentOrientation {
        case .landscapeLeft:
            textOrientation = .up
            uiRotationTransform = .identity
        case .landscapeRight:
            textOrientation = .down
            uiRotationTransform = CGAffineTransform(translationX: 1, y: 1).rotated(by: CGFloat.pi)
        case .portraitUpsideDown:
            textOrientation = .left
            uiRotationTransform = CGAffineTransform(translationX: 1, y: 0).rotated(by: CGFloat.pi / 2)
        default:
            textOrientation = .right
            uiRotationTransform = CGAffineTransform(translationX: 0, y: 1).rotated(by: -CGFloat.pi / 2)
        }

        visionToAVFTransform = roiToGlobalTransform
            .concatenating(bottomToTopTransform)
            .concatenating(uiRotationTransform)
    }

    // ─────────────────────────────────────────────
    // MARK: – Camera
    // ─────────────────────────────────────────────

    func setupCamera() {
        guard let captureDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            return
        }
        self.captureDevice = captureDevice

        if captureDevice.supportsSessionPreset(.hd4K3840x2160) {
            captureSession.sessionPreset = .hd4K3840x2160
            bufferAspectRatio = 3840.0 / 2160.0
        } else {
            captureSession.sessionPreset = .hd1920x1080
            bufferAspectRatio = 1920.0 / 1080.0
        }

        guard let deviceInput = try? AVCaptureDeviceInput(device: captureDevice) else { return }
        if captureSession.canAddInput(deviceInput) {
            captureSession.addInput(deviceInput)
        }

        videoDataOutput.alwaysDiscardsLateVideoFrames = true
        videoDataOutput.setSampleBufferDelegate(self, queue: videoDataOutputQueue)
        videoDataOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]

        if captureSession.canAddOutput(videoDataOutput) {
            captureSession.addOutput(videoDataOutput)
            videoDataOutput.connection(with: .video)?.preferredVideoStabilizationMode = .off
        }

        do {
            try captureDevice.lockForConfiguration()
            captureDevice.videoZoomFactor = 1.5
            captureDevice.autoFocusRangeRestriction = .near
            captureDevice.unlockForConfiguration()
        } catch {}

        captureSession.startRunning()
    }

    func showString(string: String) {
        captureSessionQueue.sync {
            self.captureSession.stopRunning()
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension MRZViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    }
}

extension AVCaptureVideoOrientation {
    init?(deviceOrientation: UIDeviceOrientation) {
        switch deviceOrientation {
        case .portrait: self = .portrait
        case .portraitUpsideDown: self = .portraitUpsideDown
        case .landscapeLeft: self = .landscapeRight
        case .landscapeRight: self = .landscapeLeft
        default: return nil
        }
    }
}
