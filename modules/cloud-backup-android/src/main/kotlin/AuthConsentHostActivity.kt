package com.portal.cloudbackup

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.os.ResultReceiver
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Host Activity that launches the OAuth consent intent (from UserRecoverableAuthIOException).
 * Required so registerForActivityResult is called in onCreate (Android 14+).
 */
class AuthConsentHostActivity : ComponentActivity() {

  private val authLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult(),
  ) { result ->
    val receiver = intent.parcelableExtraCompat<ResultReceiver>(EXTRA_RECEIVER)
    receiver?.send(result.resultCode, null)
    finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val authIntent = intent.parcelableExtraCompat<Intent>(EXTRA_AUTH_INTENT)
    if (authIntent != null) {
      authLauncher.launch(authIntent)
    } else {
      finish()
    }
  }

  companion object {
    const val EXTRA_AUTH_INTENT = "auth_intent"
    const val EXTRA_RECEIVER = "receiver"
  }

  @Suppress("DEPRECATION")
  private inline fun <reified T : Parcelable> Intent.parcelableExtraCompat(key: String): T? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableExtra(key, T::class.java)
    } else {
      getParcelableExtra(key)
    }
  }
}
