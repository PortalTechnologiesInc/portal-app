package com.portal.cloudbackup

import android.accounts.Account
import android.accounts.AccountManager
import android.util.Log
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.http.ByteArrayContent
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.drive.Drive
import com.google.api.services.drive.model.File
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

private const val TAG = "CloudBackupModule"

class CloudBackupModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("CloudBackupAndroid")

    AsyncFunction("backupSeed") { seedData: String, fileName: String ->
      runBlocking {
        withContext(Dispatchers.IO) {
        try {
          val account = getGoogleAccount()
            ?: throw Exception("No Google account found on device")

          val drive = getDriveService(account)

          val folderId = getOrCreateFolder(drive, "Portal")

          val fileMetadata = File().apply {
            name = fileName
            parents = listOf(folderId)
          }

          val fileContent = ByteArrayContent(
            "text/plain",
            seedData.toByteArray(Charsets.UTF_8)
          )

          val uploadedFile = drive.files()
            .create(fileMetadata, fileContent)
            .setFields("id, webViewLink")
            .execute()

          Log.i(TAG, "Backup uploaded: ${uploadedFile.id}")
          uploadedFile.id
        } catch (e: Exception) {
          Log.e(TAG, "Backup failed", e)
          throw Exception("Backup failed: ${e.message}", e)
        }
        }
      }
    }

    AsyncFunction("restoreSeed") { fileName: String ->
      runBlocking {
        withContext(Dispatchers.IO) {
        try {
          val account = getGoogleAccount()
            ?: throw Exception("No Google account found on device")

          val drive = getDriveService(account)

          val query = "name='$fileName' and mimeType='text/plain' and trashed=false"
          val fileList = drive.files()
            .list()
            .setQ(query)
            .setSpaces("drive")
            .setFields("files(id, name)")
            .setPageSize(1)
            .execute()

          val file = fileList.files.firstOrNull()
            ?: throw Exception("Backup file '$fileName' not found")

          val outputStream = java.io.ByteArrayOutputStream()
          drive.files()
            .get(file.id)
            .executeMediaAndDownloadTo(outputStream)

          val content = String(outputStream.toByteArray(), Charsets.UTF_8)
          Log.i(TAG, "Backup restored: ${file.id}")
          content
        } catch (e: Exception) {
          Log.e(TAG, "Restore failed", e)
          throw Exception("Restore failed: ${e.message}", e)
        }
        }
      }
    }

    AsyncFunction("isAvailable") {
      getGoogleAccount() != null
    }
  }

  private fun getGoogleAccount(): Account? {
    val accountManager = AccountManager.get(appContext.reactContext)
    val accounts = accountManager.getAccountsByType("com.google")
    return accounts.firstOrNull()
  }

  private fun getDriveService(account: Account): Drive {
    val credential = GoogleAccountCredential.usingOAuth2(
      appContext.reactContext,
      listOf("https://www.googleapis.com/auth/drive")
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
    val query = "name='$folderName' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    val fileList = drive.files()
      .list()
      .setQ(query)
      .setSpaces("drive")
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
    }

    val createdFolder = drive.files()
      .create(folderMetadata)
      .setFields("id")
      .execute()

    Log.i(TAG, "Created new folder: ${createdFolder.id}")
    return createdFolder.id
  }
}
