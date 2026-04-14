package cc.getportal.mrz

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MRZScannerActivity : AppCompatActivity() {

    companion object {
        private const val CAMERA_PERMISSION_CODE = 1001
        const val EXTRA_INSTRUCTION_TEXT = "instructionText"
        const val EXTRA_IS_CHIP_SHOW = "isChipShow"
        const val EXTRA_TIMEOUT_MS = "timeoutMs"
    }

    private lateinit var cameraExecutor: ExecutorService
    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.Builder().build())
    private val stringTracker = StringTracker()
    private var resultDelivered = false

    // Fix #9: store direct reference to PreviewView instead of traversing hierarchy
    private lateinit var previewView: PreviewView

    // Fix #10: timeout handler
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        MRZUtils.resetCaptures()

        // Fix #7: English default instruction text (was Turkish)
        val instructionText = intent.getStringExtra(EXTRA_INSTRUCTION_TEXT)
            ?: "Place the back of your document in the frame"
        val timeoutMs = intent.getLongExtra(EXTRA_TIMEOUT_MS, 0L)

        // ── Build UI ──────────────────────────────

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }

        // Camera preview — Fix #9: store direct reference
        previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
        root.addView(previewView)

        // Card overlay (includes border, corners, MRZ band + text)
        val overlayView = CardOverlayView(this)
        root.addView(overlayView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        // Scan line (full screen width)
        val scanLineView = View(this).apply {
            setBackgroundColor(Color.parseColor("#804DC0FF"))
        }
        root.addView(scanLineView, FrameLayout.LayoutParams(MATCH_PARENT, dp(2)))

        // Hint text
        val hintView = TextView(this).apply {
            text = instructionText
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            setShadowLayer(4f, 0f, 1f, Color.parseColor("#B3000000"))
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
        }
        root.addView(hintView)

        // Close button
        val closeBtn = createCloseButton()
        root.addView(closeBtn)

        setContentView(root)

        // Position scan line and hint after layout
        root.post {
            val cardRect = overlayView.cardRect
            if (cardRect.width() > 0f) {
                // Scan line — full screen width, sweeps full screen height
                val scanLP = scanLineView.layoutParams as FrameLayout.LayoutParams
                scanLP.width = MATCH_PARENT
                scanLP.height = dp(2)
                scanLP.topMargin = 0
                scanLP.leftMargin = 0
                scanLineView.layoutParams = scanLP

                val screenH = root.height
                val animator = ObjectAnimator.ofFloat(
                    scanLineView, "translationY",
                    0f, (screenH - dp(2)).toFloat()
                )
                animator.duration = 2500
                animator.repeatCount = ValueAnimator.INFINITE
                animator.repeatMode = ValueAnimator.RESTART
                animator.interpolator = LinearInterpolator()
                animator.start()

                val hintLP = hintView.layoutParams as FrameLayout.LayoutParams
                hintLP.leftMargin = cardRect.left.toInt() - dp(10)
                hintLP.width = cardRect.width().toInt() + dp(20)
                hintLP.topMargin = cardRect.bottom.toInt() + dp(24)
                hintView.layoutParams = hintLP
            }
        }

        cameraExecutor = Executors.newSingleThreadExecutor()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera(previewView)
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
        }

        // Fix #10: schedule timeout
        if (timeoutMs > 0) {
            timeoutRunnable = Runnable {
                if (!resultDelivered) {
                    resultDelivered = true
                    deliverError("ERR_TIMEOUT")
                }
            }
            timeoutHandler.postDelayed(timeoutRunnable!!, timeoutMs)
        }
    }

    // ── Close button ────────────────────────────────

    private fun createCloseButton(): View {
        val size = dp(36)
        val btn = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(size, size).apply {
                gravity = Gravity.TOP or Gravity.START
                topMargin = dp(48)
                leftMargin = dp(16)
            }
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
            isFocusable = true
            setOnClickListener { cancelScan() }
        }

        val bg = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(size, size)
            background = createCircleDrawable(Color.parseColor("#80000000"), size)
        }
        btn.addView(bg)

        val xIcon = XMarkView(this)
        btn.addView(xIcon, FrameLayout.LayoutParams(size, size))

        return btn
    }

    private fun createCircleDrawable(color: Int, sizePx: Int): android.graphics.drawable.Drawable {
        return object : android.graphics.drawable.Drawable() {
            private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
            override fun draw(canvas: Canvas) {
                val r = bounds.width() / 2f
                canvas.drawCircle(r, r, r, paint)
            }
            override fun setAlpha(alpha: Int) { paint.alpha = alpha }
            override fun setColorFilter(cf: ColorFilter?) { paint.colorFilter = cf }
            override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
        }
    }

    // ── Camera ──────────────────────────────────────

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // Fix #9: use stored reference instead of traversing view hierarchy
                startCamera(previewView)
            } else {
                // Fix #7: English error message
                deliverError("Camera permission denied.")
            }
        }
    }

    @OptIn(ExperimentalGetImage::class)
    private fun startCamera(previewView: PreviewView) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }

            val imageAnalysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(1920, 1080))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                processImageProxy(imageProxy)
            }

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
            } catch (e: Exception) {
                // Fix #7: English error message
                deliverError("Camera could not be started: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @ExperimentalGetImage
    private fun processImageProxy(imageProxy: ImageProxy) {
        if (resultDelivered) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

        textRecognizer.process(inputImage)
            .addOnSuccessListener { visionText ->
                val codes = mutableListOf<String>()

                for (block in visionText.textBlocks) {
                    for (line in block.lines) {
                        val raw = line.text.replace(" ", "")
                        val filtered = raw.uppercase().filter {
                            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<".contains(it)
                        }
                        val result = MRZUtils.checkMrz(filtered)
                        if (result != null) {
                            codes.add(result)
                        }
                    }
                }

                stringTracker.logFrame(codes)

                val stable = stringTracker.getStableString()
                if (stable != null && !resultDelivered) {
                    resultDelivered = true
                    stringTracker.reset(stable)
                    deliverResult(stable)
                }
            }
            .addOnFailureListener { /* ignore frame errors */ }
            .addOnCompleteListener { imageProxy.close() }
    }

    // ── Results ─────────────────────────────────────

    private fun deliverResult(mrz: String) {
        timeoutRunnable?.let { timeoutHandler.removeCallbacks(it) }
        val data = Intent().apply {
            putExtra(MRZScannerModule.EXTRA_MRZ_RESULT, mrz)
        }
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    private fun deliverError(message: String) {
        timeoutRunnable?.let { timeoutHandler.removeCallbacks(it) }
        val data = Intent().apply {
            putExtra(MRZScannerModule.EXTRA_ERROR, message)
        }
        setResult(Activity.RESULT_CANCELED, data)
        finish()
    }

    private fun cancelScan() {
        timeoutRunnable?.let { timeoutHandler.removeCallbacks(it) }
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        timeoutRunnable?.let { timeoutHandler.removeCallbacks(it) }
        if (::cameraExecutor.isInitialized) {
            cameraExecutor.shutdown()
        }
        // Fix #6: close textRecognizer to release resources
        textRecognizer.close()
    }

    // ── Helpers ─────────────────────────────────────

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    // ═══════════════════════════════════════════════
    // Inner Views
    // ═══════════════════════════════════════════════

    inner class CardOverlayView(context: Context) : View(context) {

        var cardRect = RectF()
            private set

        private val overlayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#8C000000")
            style = Paint.Style.FILL
        }
        private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#59FFFFFF")
            style = Paint.Style.STROKE
            strokeWidth = dpF(1.5f)
        }
        private val cornerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = dpF(3f)
            strokeCap = Paint.Cap.ROUND
        }
        private val mrzBandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#40000000") // black at 25% alpha
            style = Paint.Style.FILL
        }
        private val mrzTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#59FFFFFF") // white at 35% alpha
            typeface = Typeface.MONOSPACE
            textSize = spF(13f)
        }

        private val cr = dpF(12f)
        private val cornerLen = dpF(28f)

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            val w = width.toFloat()
            val h = height.toFloat()

            val cardW = w * 0.88f
            val cardH = cardW / 1.586f
            val cardX = (w - cardW) / 2f
            val cardY = (h - cardH) / 2f - cardH * 0.08f
            cardRect.set(cardX, cardY, cardX + cardW, cardY + cardH)

            // Dark overlay with card cutout
            val path = Path().apply {
                fillType = Path.FillType.EVEN_ODD
                addRect(0f, 0f, w, h, Path.Direction.CW)
                addRoundRect(cardRect, cr, cr, Path.Direction.CW)
            }
            canvas.drawPath(path, overlayPaint)

            // Card border
            canvas.drawRoundRect(cardRect, cr, cr, borderPaint)

            // Corner brackets
            drawCorners(canvas)

            // MRZ preview band — bottom 28% of card
            val bandH = cardH * 0.28f
            val bandTop = cardRect.bottom - bandH
            val bandRect = RectF(cardRect.left, bandTop, cardRect.right, cardRect.bottom)

            // Draw band with only bottom corners rounded
            val bandPath = Path().apply {
                moveTo(bandRect.left, bandRect.top)
                lineTo(bandRect.right, bandRect.top)
                lineTo(bandRect.right, bandRect.bottom - cr)
                quadTo(bandRect.right, bandRect.bottom, bandRect.right - cr, bandRect.bottom)
                lineTo(bandRect.left + cr, bandRect.bottom)
                quadTo(bandRect.left, bandRect.bottom, bandRect.left, bandRect.bottom - cr)
                lineTo(bandRect.left, bandRect.top)
                close()
            }
            canvas.drawPath(bandPath, mrzBandPaint)

            // MRZ sample text
            val textInset = dpF(8f)
            val gap = dpF(4f)
            val textY1 = bandTop + textInset + mrzTextPaint.textSize
            canvas.drawText("P<GBRSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<", bandRect.left + textInset, textY1, mrzTextPaint)
            val textY2 = textY1 + gap + mrzTextPaint.textSize
            canvas.drawText("AB1234567<GBR8001011M3001015<<<<<<<<<<<6", bandRect.left + textInset, textY2, mrzTextPaint)
        }

        private fun drawCorners(canvas: Canvas) {
            val r = cardRect

            // Top-left
            val tl = Path().apply {
                moveTo(r.left, r.top + cr + cornerLen)
                lineTo(r.left, r.top + cr)
                quadTo(r.left, r.top, r.left + cr, r.top)
                lineTo(r.left + cr + cornerLen, r.top)
            }
            canvas.drawPath(tl, cornerPaint)

            // Top-right
            val tr = Path().apply {
                moveTo(r.right - cr - cornerLen, r.top)
                lineTo(r.right - cr, r.top)
                quadTo(r.right, r.top, r.right, r.top + cr)
                lineTo(r.right, r.top + cr + cornerLen)
            }
            canvas.drawPath(tr, cornerPaint)

            // Bottom-left
            val bl = Path().apply {
                moveTo(r.left, r.bottom - cr - cornerLen)
                lineTo(r.left, r.bottom - cr)
                quadTo(r.left, r.bottom, r.left + cr, r.bottom)
                lineTo(r.left + cr + cornerLen, r.bottom)
            }
            canvas.drawPath(bl, cornerPaint)

            // Bottom-right
            val br = Path().apply {
                moveTo(r.right - cr - cornerLen, r.bottom)
                lineTo(r.right - cr, r.bottom)
                quadTo(r.right, r.bottom, r.right, r.bottom - cr)
                lineTo(r.right, r.bottom - cr - cornerLen)
            }
            canvas.drawPath(br, cornerPaint)
        }

        private fun dpF(value: Float): Float {
            return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
            )
        }

        private fun spF(value: Float): Float {
            return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_SP, value, resources.displayMetrics
            )
        }
    }

    inner class XMarkView(context: Context) : View(context) {

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = dpF(2f)
            strokeCap = Paint.Cap.ROUND
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val pad = width * 0.32f
            canvas.drawLine(pad, pad, width - pad, height - pad, paint)
            canvas.drawLine(width - pad, pad, pad, height - pad, paint)
        }

        private fun dpF(value: Float): Float {
            return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
            )
        }
    }
}
