require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CloudBackupModule'
  s.version        = package['version']
  s.summary        = 'Cloud backup native module for Portal (iOS)'
  s.description    = 'CloudKit-based backup/restore for seed data'
  s.license        = package['license'] || 'MIT'
  s.author         = package['author'] || 'Portal'
  s.homepage       = package['homepage'] || ''
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { :path => __dir__ }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.swift'
end
