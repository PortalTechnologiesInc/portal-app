import ExpoModulesCore
import CloudKit
import Foundation
import os.log

public class CloudBackupModule: Module {
  private let container = CKContainer.default()
  private let logger = Logger()

  public func definition() -> ModuleDefinition {
    Name("CloudBackupIOS")

    AsyncFunction("backupSeed") { (seedData: String, fileName: String, promise: Promise) in
      let database = self.container.privateCloudDatabase

      let record = CKRecord(recordType: "PortalBackup")
      record["fileName"] = fileName
      record["seed"] = seedData
      record["timestamp"] = Date()

      database.save(record) { savedRecord, error in
        if let error = error {
          self.logger.error("Backup failed", error: error)
          promise.reject(NSError(
            domain: "CloudBackupFailed",
            code: -1,
            userInfo: ["message": "Backup failed: \(error.localizedDescription)" as NSString]
          ))
        } else if let savedRecord = savedRecord {
          self.logger.info("Backup saved: \(savedRecord.recordID.recordName)")
          promise.resolve(savedRecord.recordID.recordName)
        }
      }
    }

    AsyncFunction("restoreSeed") { (fileName: String, promise: Promise) in
      let database = self.container.privateCloudDatabase

      let predicate = NSPredicate(format: "fileName == %@", fileName)
      let query = CKQuery(recordType: "PortalBackup", predicate: predicate)
      let sortDescriptor = NSSortDescriptor(key: "timestamp", ascending: false)
      query.sortDescriptors = [sortDescriptor]

      database.perform(query, inZoneWith: nil) { records, error in
        if let error = error {
          self.logger.error("Restore failed", error: error)
          promise.reject(NSError(
            domain: "CloudBackupFailed",
            code: -1,
            userInfo: ["message": "Restore failed: \(error.localizedDescription)" as NSString]
          ))
        } else if let record = records?.first, let seed = record["seed"] as? String {
          self.logger.info("Backup restored: \(record.recordID.recordName)")
          promise.resolve(seed)
        } else {
          promise.reject(NSError(
            domain: "CloudBackupFailed",
            code: -1,
            userInfo: ["message": "Backup file '\(fileName)' not found" as NSString]
          ))
        }
      }
    }

    AsyncFunction("isAvailable") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }
  }
}

// MARK: - Logger

private class Logger {
  private let subsystem = "com.portal.cloudbackup"

  func info(_ message: String) {
    let log = OSLog(subsystem: subsystem, category: "info")
    os_log("%{public}@", log: log, type: .info, message)
  }

  func error(_ message: String, error: Error? = nil) {
    let log = OSLog(subsystem: subsystem, category: "error")
    if let error = error {
      os_log("%{public}@ - %{public}@", log: log, type: .error, message, error.localizedDescription)
    } else {
      os_log("%{public}@", log: log, type: .error, message)
    }
  }
}
