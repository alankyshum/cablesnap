import ExpoModulesCore
import Foundation

public class FormClipsBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FormClipsBackup")

    // Excludes a single file or directory URL from iCloud backup.
    // Used by the save flow: write file → setExcludedFromBackup → INSERT DB row.
    AsyncFunction("setExcludedFromBackup") { (uri: String) throws in
      guard let url = URL(string: uri) else {
        throw FormClipsBackupError.invalidUri(uri)
      }
      var resourceUrl = url
      // expo-file-system URIs are file:// URLs — handle plain paths too.
      if !url.isFileURL, let fileUrl = URL(string: "file://\(uri)") {
        resourceUrl = fileUrl
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try resourceUrl.setResourceValues(values)
    }

    // Reads back the backup-exclusion flag — used in runtime tests.
    AsyncFunction("readBackupExclusion") { (uri: String) throws -> Bool in
      guard let url = URL(string: uri) else {
        throw FormClipsBackupError.invalidUri(uri)
      }
      var resourceUrl = url
      if !url.isFileURL, let fileUrl = URL(string: "file://\(uri)") {
        resourceUrl = fileUrl
      }
      let values = try resourceUrl.resourceValues(forKeys: [.isExcludedFromBackupKey])
      return values.isExcludedFromBackup ?? false
    }

    // Convenience boot function: ensures form-clips/ directory exists and
    // sets its backup-exclusion flag. Returns {ok, path}.
    AsyncFunction("excludeFormClipsFromBackup") { () throws -> [String: Any] in
      guard let documentDir = FileManager.default.urls(
        for: .documentDirectory,
        in: .userDomainMask
      ).first else {
        throw FormClipsBackupError.documentDirectoryUnavailable
      }
      let formClipsDir = documentDir.appendingPathComponent("form-clips", isDirectory: true)
      if !FileManager.default.fileExists(atPath: formClipsDir.path) {
        try FileManager.default.createDirectory(
          at: formClipsDir,
          withIntermediateDirectories: true,
          attributes: nil
        )
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      var mutable = formClipsDir
      try mutable.setResourceValues(values)
      return ["ok": true, "path": formClipsDir.path]
    }
  }
}

private enum FormClipsBackupError: Error, LocalizedError {
  case invalidUri(String)
  case documentDirectoryUnavailable

  var errorDescription: String? {
    switch self {
    case .invalidUri(let uri):
      return "FormClipsBackup: invalid URI '\(uri)'"
    case .documentDirectoryUnavailable:
      return "FormClipsBackup: document directory unavailable"
    }
  }
}
