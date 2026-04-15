package cc.getportal.mrz

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class MRZScannerModule : Module() {
    companion object {
        private const val REQUEST_CODE_SCAN = 9101
        const val EXTRA_MRZ_RESULT = "mrz_result"
        const val EXTRA_ERROR = "mrz_error"
    }

    private var pendingPromise: Promise? = null

    override fun definition() = ModuleDefinition {
        Name("MRZScanner")

        AsyncFunction("scanMRZ") { options: Map<String, Any>?, promise: Promise ->
            val activity = appContext.activityProvider?.currentActivity
            if (activity == null) {
                // Fix #7: English error message (was Turkish)
                promise.reject("ERR_NO_ACTIVITY", "No activity found.", null)
                return@AsyncFunction
            }

            // Fix #5: reject orphaned promise before overwriting
            pendingPromise?.reject("ERR_CANCELLED", "A new scan was started.", null)
            pendingPromise = promise

            val intent = Intent(activity, MRZScannerActivity::class.java)
            val instructionText = options?.get("instructionText") as? String
            if (!instructionText.isNullOrEmpty()) {
                intent.putExtra(MRZScannerActivity.EXTRA_INSTRUCTION_TEXT, instructionText)
            }
            val isChipShow = (options?.get("isChipShow") as? Boolean) ?: true
            intent.putExtra(MRZScannerActivity.EXTRA_IS_CHIP_SHOW, isChipShow)

            // Fix #10: pass timeout to activity
            val timeoutMs = (options?.get("timeoutMs") as? Number)?.toLong() ?: 0L
            intent.putExtra(MRZScannerActivity.EXTRA_TIMEOUT_MS, timeoutMs)

            activity.startActivityForResult(intent, REQUEST_CODE_SCAN)
        }

        OnActivityResult { _, payload ->
            val promise = pendingPromise ?: return@OnActivityResult
            pendingPromise = null

            val resultCode = payload.resultCode
            val data = payload.data

            if (resultCode == Activity.RESULT_OK && data != null) {
                val mrz = data.getStringExtra(EXTRA_MRZ_RESULT)
                if (!mrz.isNullOrEmpty()) {
                    promise.resolve(mrz)
                } else {
                    // Fix #7: English error message
                    promise.reject("ERR_MRZ", "MRZ could not be read.", null)
                }
            } else {
                val error = data?.getStringExtra(EXTRA_ERROR)
                promise.reject("ERR_CANCELLED", error ?: "MRZ scan was cancelled.", null)
            }
        }
    }
}
