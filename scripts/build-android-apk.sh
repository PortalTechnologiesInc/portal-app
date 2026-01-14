#!/bin/bash
# Build production Android APK for Maestro testing
set -e

echo "🔨 Building production Android APK..."

# Build the release APK using Gradle directly
cd android && ./gradlew app:assembleRelease && cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ Error: APK not found at $APK_PATH"
  exit 1
fi

echo "✅ APK built successfully at $APK_PATH"
echo "$APK_PATH"
