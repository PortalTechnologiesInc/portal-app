#!/bin/bash
# Build Android APK for Maestro testing
set -e

VARIANT="${1:-release}"

if [ "$VARIANT" != "debug" ] && [ "$VARIANT" != "release" ]; then
  echo "❌ Error: Unknown build variant: $VARIANT (expected: debug|release)"
  exit 1
fi

echo "🔨 Building Android APK ($VARIANT)..." >&2

GRADLE_TASK="app:assembleRelease"
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ "$VARIANT" = "debug" ]; then
  GRADLE_TASK="app:assembleDebug"
  APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
fi

# Build the APK using Gradle directly.
# Keep stdout clean (APK path only) for callers that capture output.
cd android && ./gradlew "$GRADLE_TASK" 1>&2 && cd ..

if [ ! -f "$APK_PATH" ]; then
  echo "❌ Error: APK not found at $APK_PATH" >&2
  exit 1
fi

# Print logs to stderr; stdout is reserved for the APK path (used by scripts).
echo "✅ APK built successfully at $APK_PATH" >&2
echo "$APK_PATH"
