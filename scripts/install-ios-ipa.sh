#!/bin/bash
# Install iOS app on iOS Simulator (macOS only)
set -e

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: iOS installation requires macOS"
  exit 1
fi

echo "📱 Checking for iOS Simulators..."

# Check if xcrun simctl is available
if ! command -v xcrun &> /dev/null; then
  echo "❌ Error: xcrun not found. Please install Xcode Command Line Tools."
  exit 1
fi

# Check if a simulator is already booted
BOOTED_SIMULATORS=$(xcrun simctl list devices | grep "(Booted)" | wc -l | tr -d ' ')

if [ "$BOOTED_SIMULATORS" -eq 0 ]; then
  echo "⚠️  No iOS Simulators are currently running."
  echo "🔍 Attempting to start a simulator..."
  
  # Get list of available simulators (prefer iPhone)
  AVAILABLE_SIMULATORS=$(xcrun simctl list devices available | grep -E "iPhone|iPad" | grep -v "unavailable")
  
  if [ -z "$AVAILABLE_SIMULATORS" ]; then
    echo "❌ Error: No available iOS Simulators found."
    echo "Please create a simulator using Xcode or: xcrun simctl create"
    exit 1
  fi
  
  # Try to find an iPhone first, then fall back to any device
  SIMULATOR_UDID=$(echo "$AVAILABLE_SIMULATORS" | grep "iPhone" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
  
  if [ -z "$SIMULATOR_UDID" ]; then
    # Fall back to any available device
    SIMULATOR_UDID=$(echo "$AVAILABLE_SIMULATORS" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
  fi
  
  if [ -z "$SIMULATOR_UDID" ]; then
    echo "❌ Error: Could not find a simulator UDID."
    exit 1
  fi
  
  SIMULATOR_NAME=$(echo "$AVAILABLE_SIMULATORS" | grep "$SIMULATOR_UDID" | sed 's/.*\(iPhone\|iPad\).*/\1/' | head -1)
  
  echo "🚀 Starting iOS Simulator: $SIMULATOR_NAME ($SIMULATOR_UDID)"
  
  # Start the simulator
  xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
  
  # Open Simulator app (required for the simulator to be visible)
  open -a Simulator
  
  echo "⏳ Waiting for simulator to boot (this may take a minute)..."
  
  # Wait for simulator to be ready (max 120 seconds)
  TIMEOUT=120
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    BOOTED=$(xcrun simctl list devices | grep "$SIMULATOR_UDID" | grep "(Booted)" | wc -l | tr -d ' ')
    if [ "$BOOTED" -gt 0 ]; then
      echo "✅ Simulator is ready!"
      break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    echo -n "."
  done
  
  if [ "$BOOTED" -eq 0 ]; then
    echo ""
    echo "❌ Error: Simulator failed to boot within $TIMEOUT seconds."
    exit 1
  fi
  
  echo ""
else
  echo "✅ Found $BOOTED_SIMULATORS simulator(s) already running"
fi

echo ""
echo "ℹ️  Note: iOS apps are typically installed during the build process via 'expo run:ios'."
echo "The simulator is now ready for Maestro testing."
