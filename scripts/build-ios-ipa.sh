#!/bin/bash
# Build production iOS IPA for Maestro testing (macOS only)
set -e

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: iOS builds require macOS"
  exit 1
fi

echo "🔨 Building production iOS app..."

# Build the iOS app
npm run ios

echo "✅ iOS app built successfully"
echo "Note: For iOS Simulator, the app is automatically installed during build"
echo "For physical device, you may need to install manually via Xcode"
