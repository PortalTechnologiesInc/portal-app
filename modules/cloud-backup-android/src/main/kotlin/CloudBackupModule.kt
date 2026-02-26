package com.portal.cloudbackup

import android.app.Activity
import android.accounts.Account
import android.accounts.AccountManager
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import android.util.Log
import com.google.android.gms.common.AccountPicker
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.googleapis.extensions.android.gms.auth.UserRecoverableAuthIOException
import com.google.api.client.http.ByteArrayContent
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.drive.Drive
import com.google.api.services.drive.model.File
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

private const val TAG = "CloudBackupModule"

class CloudBackupModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("CloudBackupAndroid")

    AsyncFunction("backupSeed") { seedData: String, fileName: String ->
      runBlocking(Dispatchers.IO) {
        try {
          val account = getGoogleAccountOrPick()
            ?: throw NoGoogleAccountException()

          val drive = getDriveService(account)

          val fileId = performWithAuthRetry {
            val folderId = getOrCreateFolder(drive, "Portal")

            val createMetadata = File().apply {
              name = fileName
              parents = listOf(folderId)
            }
            val updateMetadata = File().apply {
              name = fileName
              // Parents are managed separately on update; keep existing parent linkage.
            }
            val fileContent = ByteArrayContent(
              "text/plain",
              seedData.toByteArray(Charsets.UTF_8)
            )

            // If a backup file already exists, update it instead of creating a duplicate.
            val existing = drive.files()
              .list()
              .setQ(
                "'$folderId' in parents and name='$fileName' and mimeType='text/plain' and trashed=false"
              )
              .setFields("files(id, name)")
              .setPageSize(1)
              .execute()
              .files
              .firstOrNull()

            val uploadedFile =
              if (existing != null) {
                drive.files()
                  .update(existing.id, updateMetadata, fileContent)
                  .setFields("id, webViewLink")
                  .execute()
              } else {
                drive.files()
                  .create(createMetadata, fileContent)
                  .setFields("id, webViewLink")
                  .execute()
              }

            Log.i(TAG, "Backup uploaded: ${uploadedFile.id}")
            uploadedFile.id
          }
          fileId
        } catch (e: NoGoogleAccountException) {
          throw e
        } catch (e: Exception) {
          val msg = exceptionMessage(e)
          Log.e(TAG, "Backup failed: $msg", e)
          throw Exception("Backup failed: $msg", e)
        }
      }
    }

    AsyncFunction("restoreSeed") { fileName: String ->
      runBlocking(Dispatchers.IO) {
        try {
          val account = getGoogleAccountOrPick()
            ?: throw NoGoogleAccountException()

          val drive = getDriveService(account)

          val content = performWithAuthRetry {
            val folderId = getOrCreateFolder(drive, "Portal")
            val query =
              "'$folderId' in parents and name='$fileName' and mimeType='text/plain' and trashed=false"
            val fileList = drive.files()
              .list()
              .setQ(query)
              .setFields("files(id, name)")
              .setPageSize(1)
              .execute()

            val file = fileList.files.firstOrNull()
              ?: throw Exception("Backup file '$fileName' not found")

            val outputStream = java.io.ByteArrayOutputStream()
            drive.files()
              .get(file.id)
              .executeMediaAndDownloadTo(outputStream)

            String(outputStream.toByteArray(), Charsets.UTF_8)
          }
          Log.i(TAG, "Backup restored")
          content
        } catch (e: NoGoogleAccountException) {
          throw e
        } catch (e: Exception) {
          val msg = exceptionMessage(e)
          Log.e(TAG, "Restore failed: $msg", e)
          throw Exception("Restore failed: $msg", e)
        }
      }
    }

    AsyncFunction("deleteBackup") { fileName: String ->
      runBlocking(Dispatchers.IO) {
        try {
          val account = getGoogleAccountOrPick()
            ?: throw NoGoogleAccountException()

          val drive = getDriveService(account)

          performWithAuthRetry {
            val folderId = getOrCreateFolder(drive, "Portal")
            val query =
              "'$folderId' in parents and name='$fileName' and mimeType='text/plain' and trashed=false"
            val fileList = drive.files()
              .list()
              .setQ(query)
              .setFields("files(id, name)")
              .setPageSize(1)
              .execute()

            val file = fileList.files.firstOrNull()
              ?: return@performWithAuthRetry Unit

            drive.files().delete(file.id).execute()
            Log.i(TAG, "Backup deleted: ${file.id}")

            // If the Portal folder is now empty (no other files), remove it as well.
            val remaining = drive.files()
              .list()
              .setQ("'$folderId' in parents and trashed=false")
              .setFields("files(id)")
              .setPageSize(1)
              .execute()

            if (remaining.files.isEmpty()) {
              drive.files().delete(folderId).execute()
              Log.i(TAG, "Portal folder deleted: $folderId")
            }
          }
        } catch (e: NoGoogleAccountException) {
          // If there's no Google account, there's nothing to delete – treat as success.
        } catch (e: Exception) {
          val msg = exceptionMessage(e)
          Log.e(TAG, "Delete backup failed: $msg", e)
          throw Exception("Delete backup failed: $msg", e)
        }
      }
    }

    AsyncFunction("hasBackup") { fileName: String ->
      runBlocking(Dispatchers.IO) {
        try {
          // Non-disruptive check: do NOT show the account picker here.
          // If there is no visible Google account, simply return false.
          val account = getGoogleAccount() ?: return@runBlocking false

          val drive = getDriveService(account)

          val exists = performWithAuthRetry {
            val folderId = getOrCreateFolder(drive, "Portal")
            val query =
              "'$folderId' in parents and name='$fileName' and mimeType='text/plain' and trashed=false"
            val fileList = drive.files()
              .list()
              .setQ(query)
              .setFields("files(id, name)")
              .setPageSize(1)
              .execute()

            fileList.files.firstOrNull() != null
          }
          exists
        } catch (e: Exception) {
          val msg = exceptionMessage(e)
          Log.e(TAG, "Has backup check failed: $msg", e)
          throw Exception("Has backup check failed: $msg", e)
        }
      }
    }

    AsyncFunction("isAvailable") {
      // True only when at least one Google account is already visible on the device.
      // Account picker / consent flows are triggered by backup/restore operations themselves.
      getGoogleAccount() != null
    }
  }

  /** Thrown when user cancelled picker or no account. JS can treat as "skip backup". */
  class NoGoogleAccountException : Exception("NO_GOOGLE_ACCOUNT")

  private fun exceptionMessage(e: Exception): String {
    var t: Throwable? = e
    while (t != null) {
      val msg = t.message?.takeIf { it.isNotBlank() }
      if (msg != null) {
        if (msg.contains("UnregisteredOnApiConsole", ignoreCase = true)) {
          return "UnregisteredOnApiConsole: add Android OAuth client (package + SHA-1) in Google Cloud Console"
        }
        if (msg == "ERROR" && t.javaClass.simpleName.contains("GoogleAuth", ignoreCase = true)) {
          return "GoogleAuth ERROR: add your account as Test user in OAuth consent screen (Cloud Console), enable Drive API"
        }
        if (
          msg.contains("storageQuotaExceeded", ignoreCase = true) ||
          msg.contains("quota", ignoreCase = true)
        ) {
          return "Drive storage quota exceeded: free up space in Google Drive and try again"
        }
        return msg
      }
      t = t.cause
    }
    if (e.cause?.javaClass?.simpleName?.contains("GoogleAuth") == true) {
      return "Google auth failed: check OAuth consent (Test users), Drive API enabled, Android client (package + SHA-1)"
    }
    return e.javaClass.simpleName
  }

  private fun getGoogleAccount(): Account? {
    val ctx = appContext.reactContext ?: return null
    val accountManager = AccountManager.get(ctx)
    val accounts = accountManager.getAccountsByType("com.google")
    return accounts.firstOrNull()
  }

  /** Show Account Picker via host Activity (registerForActivityResult must run in onCreate on Android 14+). */
  private suspend fun pickGoogleAccount(): Account? = suspendCancellableCoroutine { cont ->
    val ctx = appContext.reactContext ?: run {
      cont.resume(null)
      return@suspendCancellableCoroutine
    }
    val receiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
      override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
        val name = resultData?.getString(AccountPickerHostActivity.KEY_ACCOUNT_NAME)
        cont.resume(name?.let { Account(it, "com.google") })
      }
    }
    val intent = Intent(ctx, AccountPickerHostActivity::class.java)
      .putExtra(AccountPickerHostActivity.EXTRA_RECEIVER, receiver)
    try {
      if (ctx is Activity) {
        ctx.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
      }
      Log.i(TAG, "Launched AccountPickerHostActivity")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to launch Account Picker", e)
      cont.resume(null)
    }
  }

  /** Gets account from list, or shows Account Picker if list is empty (Android 10+ visibility). */
  private suspend fun getGoogleAccountOrPick(): Account? {
    getGoogleAccount()?.let { return it }
    return withContext(Dispatchers.Main) { pickGoogleAccount() }
  }

  /** Runs a Drive operation; if UserRecoverableAuthIOException (consent needed), shows consent UI then retries once. */
  private suspend fun <T> performWithAuthRetry(block: () -> T): T {
    return try {
      block()
    } catch (e: UserRecoverableAuthIOException) {
      Log.i(TAG, "Drive consent required, launching consent activity")
      withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { cont ->
          val ctx = appContext.reactContext ?: run {
            cont.resume(Unit)
            return@suspendCancellableCoroutine
          }
          val receiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
            override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
              cont.resume(Unit)
            }
          }
          val intent = Intent(ctx, AuthConsentHostActivity::class.java)
            .putExtra(AuthConsentHostActivity.EXTRA_AUTH_INTENT, e.intent)
            .putExtra(AuthConsentHostActivity.EXTRA_RECEIVER, receiver)
          try {
            if (ctx is Activity) ctx.startActivity(intent)
            else {
              intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              ctx.startActivity(intent)
            }
          } catch (e2: Exception) {
            Log.e(TAG, "Failed to launch consent activity", e2)
            cont.resume(Unit)
          }
        }
      }
      block()
    }
  }

  private fun getDriveService(account: Account): Drive {
    val credential = GoogleAccountCredential.usingOAuth2(
      appContext.reactContext,
      listOf("https://www.googleapis.com/auth/drive.appdata")
    ).apply {
      selectedAccount = account
    }

    return Drive.Builder(
      NetHttpTransport(),
      GsonFactory.getDefaultInstance(),
      credential
    ).setApplicationName("Portal").build()
  }

  private fun getOrCreateFolder(drive: Drive, folderName: String): String {
    // Always operate in the hidden appDataFolder, to avoid accidentally matching or cluttering
    // the user's visible Drive with similarly named folders.
    val query =
      "name='$folderName' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    val fileList = drive.files()
      .list()
      .setQ(query)
      .setSpaces("appDataFolder")
      .setFields("files(id, name)")
      .setPageSize(1)
      .execute()

    fileList.files.firstOrNull()?.let { folder ->
      Log.i(TAG, "Found existing folder: ${folder.id}")
      return folder.id
    }

    val folderMetadata = File().apply {
      name = folderName
      mimeType = "application/vnd.google-apps.folder"
      parents = listOf("appDataFolder")
    }

    val createdFolder = drive.files()
      .create(folderMetadata)
      .setFields("id")
      .execute()

    Log.i(TAG, "Created new folder: ${createdFolder.id}")
    return createdFolder.id
  }
}
