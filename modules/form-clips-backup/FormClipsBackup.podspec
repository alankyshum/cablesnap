Pod::Spec.new do |s|
  s.name           = 'FormClipsBackup'
  s.version        = '1.0.0'
  s.summary        = 'CableSnap: excludes form-clips/ from iOS iCloud backup'
  s.description    = 'Expo Module that sets URLResourceKey.isExcludedFromBackupKey on the form-clips sandbox directory, preventing form-check video clips from being included in iCloud backups.'
  s.license        = 'MIT'
  s.author         = 'CableSnap'
  s.homepage       = 'https://github.com/alankyshum/cablesnap'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
