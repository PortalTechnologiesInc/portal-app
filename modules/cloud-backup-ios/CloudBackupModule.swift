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
      let predicate = NSPredicate(format: "fileName == %@", fileName)
      let query = CKQuery(recordType: "PortalBackup", predicate: predicate)
      let sortDescriptor = NSSortDescriptor(key: "timestamp", ascending: false)
      query.sortDescriptors = [sortDescriptor]

      database.fetch(withQuery: query, inZoneWith: nil, desiredKeys: [], resultsLimit: 1) { result in
        switch result {
        case .failure(let error):
          if let ckError = error as? CKError, ckError.code == .notAuthenticated {
            self.logger.error("Backup failed: no iCloud account", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "NO_ICLOUD_ACCOUNT" as NSString]
            ))
          } else {
            self.logger.error("Backup query failed", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Backup failed: \(error.localizedDescription)" as NSString]
            ))
          }

        case .success(let (matchResults, _)):
          // Upsert: update existing record when present, otherwise create a new one.
          let existingRecord: CKRecord? = {
            guard let first = matchResults.first else { return nil }
            switch first.1 {
            case .success(let record):
              return record
            case .failure:
              return nil
            }
          }()

          let record: CKRecord
          if let existingRecord {
            record = existingRecord
          } else {
            record = CKRecord(recordType: "PortalBackup")
            record["fileName"] = fileName
          }
          record["seed"] = seedData
          record["timestamp"] = Date()

          database.modifyRecords(saving: [record], deleting: []) { result in
            switch result {
            case .failure(let error):
              if let ckError = error as? CKError, ckError.code == .notAuthenticated {
                self.logger.error("Backup failed: no iCloud account", error: error)
                promise.reject(NSError(
                  domain: "CloudBackupFailed",
                  code: -1,
                  userInfo: ["message": "NO_ICLOUD_ACCOUNT" as NSString]
                ))
              } else {
                self.logger.error("Backup failed", error: error)
                promise.reject(NSError(
                  domain: "CloudBackupFailed",
                  code: -1,
                  userInfo: ["message": "Backup failed: \(error.localizedDescription)" as NSString]
                ))
              }

            case .success(let (saveResults, _)):
              guard let (recordID, recordResult) = saveResults.first else {
                promise.reject(NSError(
                  domain: "CloudBackupFailed",
                  code: -1,
                  userInfo: ["message": "Backup failed: no record in response" as NSString]
                ))
                return
              }

              switch recordResult {
              case .success(let savedRecord):
                self.logger.info("Backup saved: \(savedRecord.recordID.recordName)")
                promise.resolve(recordID.recordName)

              case .failure(let error):
                self.logger.error("Backup failed (record error)", error: error)
                promise.reject(NSError(
                  domain: "CloudBackupFailed",
                  code: -1,
                  userInfo: ["message": "Backup failed: \(error.localizedDescription)" as NSString]
                ))
              }
            }
          }
        }
      }
    }

    AsyncFunction("restoreSeed") { (fileName: String, promise: Promise) in
      let database = self.container.privateCloudDatabase

      let predicate = NSPredicate(format: "fileName == %@", fileName)
      let query = CKQuery(recordType: "PortalBackup", predicate: predicate)
      let sortDescriptor = NSSortDescriptor(key: "timestamp", ascending: false)
      query.sortDescriptors = [sortDescriptor]

      database.fetch(withQuery: query, inZoneWith: nil, desiredKeys: ["seed"], resultsLimit: 1) { result in
        switch result {
        case .failure(let error):
          if let ckError = error as? CKError, ckError.code == .notAuthenticated {
            self.logger.error("Restore failed: no iCloud account", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "NO_ICLOUD_ACCOUNT" as NSString]
            ))
          } else {
            self.logger.error("Restore failed", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Restore failed: \(error.localizedDescription)" as NSString]
            ))
          }

        case .success(let (matchResults, _)):
          guard let first = matchResults.first else {
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Backup file '\(fileName)' not found" as NSString]
            ))
            return
          }

          switch first.1 {
          case .failure(let error):
            self.logger.error("Restore failed (record error)", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Restore failed: \(error.localizedDescription)" as NSString]
            ))

          case .success(let record):
            if let seed = record["seed"] as? String {
              self.logger.info("Backup restored: \(record.recordID.recordName)")
              promise.resolve(seed)
            } else {
              promise.reject(NSError(
                domain: "CloudBackupFailed",
                code: -1,
                userInfo: ["message": "Backup record missing seed data" as NSString]
              ))
            }
          }
        }
      }
    }

    AsyncFunction("hasBackup") { (fileName: String, promise: Promise) in
      let database = self.container.privateCloudDatabase
      let predicate = NSPredicate(format: "fileName == %@", fileName)
      let query = CKQuery(recordType: "PortalBackup", predicate: predicate)

      database.fetch(withQuery: query, inZoneWith: nil, desiredKeys: [], resultsLimit: 1) { result in
        switch result {
        case .failure(let error):
          if let ckError = error as? CKError, ckError.code == .notAuthenticated {
            // Non-disruptive: treat as "no backup" when iCloud is not signed in.
            self.logger.error("hasBackup: no iCloud account", error: error)
            promise.resolve(false)
          } else {
            self.logger.error("hasBackup failed", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "hasBackup failed: \(error.localizedDescription)" as NSString]
            ))
          }

        case .success(let (matchResults, _)):
          promise.resolve(!matchResults.isEmpty)
        }
      }
    }

    AsyncFunction("deleteBackup") { (fileName: String, promise: Promise) in
      let database = self.container.privateCloudDatabase
      let predicate = NSPredicate(format: "fileName == %@", fileName)
      let query = CKQuery(recordType: "PortalBackup", predicate: predicate)

      database.fetch(withQuery: query, inZoneWith: nil, desiredKeys: [], resultsLimit: 1) { result in
        switch result {
        case .failure(let error):
          if let ckError = error as? CKError, ckError.code == .notAuthenticated {
            // Treat missing iCloud as "nothing to delete".
            self.logger.error("deleteBackup: no iCloud account", error: error)
            promise.resolve(nil)
          } else {
            self.logger.error("deleteBackup query failed", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Delete backup failed: \(error.localizedDescription)" as NSString]
            ))
          }

        case .success(let (matchResults, _)):
          guard let first = matchResults.first else {
            // Nothing to delete; treat as success.
            promise.resolve(nil)
            return
          }

          switch first.1 {
          case .failure(let error):
            self.logger.error("deleteBackup record error", error: error)
            promise.reject(NSError(
              domain: "CloudBackupFailed",
              code: -1,
              userInfo: ["message": "Delete backup failed: \(error.localizedDescription)" as NSString]
            ))

          case .success(let record):
            database.modifyRecords(saving: [], deleting: [record.recordID]) { result in
              switch result {
              case .failure(let error):
                if let ckError = error as? CKError, ckError.code == .unknownItem {
                  promise.resolve(nil)
                } else {
                  self.logger.error("deleteBackup failed", error: error)
                  promise.reject(NSError(
                    domain: "CloudBackupFailed",
                    code: -1,
                    userInfo: ["message": "Delete backup failed: \(error.localizedDescription)" as NSString]
                  ))
                }

              case .success(let (_, deleteResults)):
                if let deleteResult = deleteResults[record.recordID] {
                  switch deleteResult {
                  case .success:
                    self.logger.info("Backup deleted: \(record.recordID.recordName)")
                    promise.resolve(nil)
                  case .failure(let err):
                    if let ckErr = err as? CKError, ckErr.code == .unknownItem {
                      promise.resolve(nil)
                    } else {
                      self.logger.error("deleteBackup failed", error: err)
                      promise.reject(NSError(
                        domain: "CloudBackupFailed",
                        code: -1,
                        userInfo: ["message": "Delete backup failed: \(err.localizedDescription)" as NSString]
                      ))
                    }
                  }
                } else {
                  promise.resolve(nil)
                }
              }
            }
          }
        }
      }
    }

    AsyncFunction("isAvailable") { (promise: Promise) in
      self.container.accountStatus { status, error in
        if let error = error {
          self.logger.error("isAvailable: accountStatus failed", error: error)
          promise.resolve(false)
          return
        }

        switch status {
        case .available:
          promise.resolve(true)
        case .noAccount, .restricted, .couldNotDetermine, .temporarilyUnavailable:
          promise.resolve(false)
        @unknown default:
          promise.resolve(false)
        }
      }
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
