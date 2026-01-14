#!/bin/bash
# Install Android APK on connected device/emulator
set -e

APK_PATH="${1:-android/app/build/outputs/apk/release/app-release.apk}"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ Error: APK not found at $APK_PATH"
  echo "Usage: $0 [path-to-apk]"
  exit 1
fi

echo "📱 Checking for connected Android devices..."

# Check if adb is available
if ! command -v adb &> /dev/null; then
  echo "❌ Error: adb not found. Please install Android SDK platform-tools."
  exit 1
fi

# Check for connected devices
DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)

if [ "$DEVICES" -eq 0 ]; then
  echo "⚠️  No Android devices/emulators connected."
  echo "🔍 Attempting to start an emulator..."
  
  # Check if emulator command is available
  if ! command -v emulator &> /dev/null; then
    echo "❌ Error: emulator command not found."
    echo "Please install Android SDK emulator or start an emulator manually."
    exit 1
  fi
  
  # List available AVDs
  AVD_LIST=$(emulator -list-avds | head -1)
  
  if [ -z "$AVD_LIST" ]; then
    echo "❌ Error: No Android Virtual Devices (AVDs) found."
    echo "Please create an AVD using Android Studio or the command line."
    exit 1
  fi
  
  # Start the first available AVD
  AVD_NAME=$(echo "$AVD_LIST" | head -1)
  echo "🚀 Starting emulator: $AVD_NAME"
  
  # Start emulator in background
  emulator -avd "$AVD_NAME" -no-snapshot-load -wipe-data > /dev/null 2>&1 &
  EMULATOR_PID=$!
  
  echo "⏳ Waiting for emulator to boot (this may take a minute)..."
  
  # Wait for emulator to be ready (max 120 seconds)
  TIMEOUT=120
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)
    if [ "$DEVICES" -gt 0 ]; then
      echo "✅ Emulator is ready!"
      break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    echo -n "."
  done
  
  if [ "$DEVICES" -eq 0 ]; then
    echo ""
    echo "❌ Error: Emulator failed to start within $TIMEOUT seconds."
    kill $EMULATOR_PID 2>/dev/null || true
    exit 1
  fi
  
  echo ""
else
  echo "✅ Found $DEVICES device(s) already connected"
fi

# Uninstall existing app if present (to ensure clean install)
echo "🗑️  Uninstalling existing app (if present)..."
adb uninstall cc.getportal.portal 2>/dev/null || true

# Install the APK
echo "📦 Installing APK..."
adb install -r "$APK_PATH"

if [ $? -eq 0 ]; then
  echo "✅ APK installed successfully"
else
  echo "❌ Error: Failed to install APK"
  exit 1
fi
