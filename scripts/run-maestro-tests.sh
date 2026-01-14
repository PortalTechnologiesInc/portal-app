#!/bin/bash
# Wrapper script to run Maestro tests with optional --nobuild flag
set -e

PLATFORM="${1:-android}"
TEST_TYPE="${2:-regular}"

# Check for --nobuild flag in all arguments (npm passes args after --)
NO_BUILD=false
for arg in "$@"; do
  if [ "$arg" = "--nobuild" ] || [ "$arg" = "--no-build" ]; then
    NO_BUILD=true
    break
  fi
done

# Also check for NO_BUILD environment variable
if [ "$NO_BUILD" = "false" ] && [ "${NO_BUILD:-}" = "true" ]; then
  NO_BUILD=true
fi

if [ "$NO_BUILD" = "false" ]; then
  echo "🔨 Building and installing app..."
  
  if [ "$PLATFORM" = "android" ]; then
    bash scripts/build-android-apk.sh
    bash scripts/install-android-apk.sh
  elif [ "$PLATFORM" = "ios" ]; then
    bash scripts/build-ios-ipa.sh
    bash scripts/install-ios-ipa.sh
  else
    echo "❌ Error: Unknown platform: $PLATFORM"
    exit 1
  fi
else
  echo "⏭️  Skipping build and install (--nobuild flag set)"
fi

# Determine which flows to run
case "$TEST_TYPE" in
  "push")
    FLOWS=".maestro/flows/push-notifications.yaml"
    ;;
  "all")
    FLOWS=".maestro/flows/"
    ;;
  *)
    FLOWS=".maestro/flows/app-launch.yaml .maestro/flows/onboarding-flow.yaml"
    ;;
esac

echo "🧪 Running Maestro tests..."
maestro test $FLOWS
