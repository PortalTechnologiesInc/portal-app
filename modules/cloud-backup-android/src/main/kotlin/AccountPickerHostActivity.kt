package com.portal.cloudbackup

import android.accounts.AccountManager
import android.os.Bundle
import android.os.ResultReceiver
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.common.AccountPicker

/**
 * Host Activity that shows the Account Picker in onCreate so registerForActivityResult
 * is called before STARTED (required on Android 14+).
 * Sends the selected account name back via ResultReceiver and finishes.
 */
class AccountPickerHostActivity : ComponentActivity() {

  private val pickerLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult(),
  ) { result ->
    val receiver = intent.getParcelableExtra<ResultReceiver>(EXTRA_RECEIVER)
    if (result.resultCode == android.app.Activity.RESULT_OK) {
      val name = result.data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
      receiver?.send(CODE_OK, Bundle().apply { putString(KEY_ACCOUNT_NAME, name) })
    } else {
      receiver?.send(CODE_CANCELLED, null)
    }
    finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val intent = try {
      val options = AccountPicker.AccountChooserOptions.Builder()
        .setAllowableAccountsTypes(listOf("com.google"))
        .build()
      AccountPicker.newChooseAccountIntent(options)
    } catch (e: Exception) {
      @Suppress("DEPRECATION")
      AccountPicker.newChooseAccountIntent(null, null, arrayOf("com.google"), false, null, null, null, null)
    }
    pickerLauncher.launch(intent)
  }

  companion object {
    const val EXTRA_RECEIVER = "receiver"
    const val KEY_ACCOUNT_NAME = "accountName"
    const val CODE_OK = 1
    const val CODE_CANCELLED = 0
  }
}
