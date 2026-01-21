#!/bin/bash
# Wrapper script to run Maestro tests with optional --nobuild flag
set -e

PLATFORM="${1:-android}"
TEST_TYPE="${2:-regular}"
shift 2 || true

MAESTRO_ARGS=()

# Check for --nobuild flag in all arguments (npm passes args after --)
SKIP_BUILD=false
for arg in "$@"; do
  if [ "$arg" = "--nobuild" ] || [ "$arg" = "--no-build" ]; then
    SKIP_BUILD=true
  else
    MAESTRO_ARGS+=("$arg")
  fi
done

# Also check for NO_BUILD environment variable
if [ "$SKIP_BUILD" = "false" ] && [ "${NO_BUILD:-}" = "true" ]; then
  SKIP_BUILD=true
fi

if [ "$SKIP_BUILD" = "false" ]; then
  echo "🔨 Building and installing app..."
  
  if [ "$PLATFORM" = "android" ]; then
    ANDROID_VARIANT="${MAESTRO_ANDROID_VARIANT:-debug}"
    APK_PATH="$(bash scripts/build-android-apk.sh "$ANDROID_VARIANT")"
    bash scripts/install-android-apk.sh "$APK_PATH"
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

# Load environment variables from .env.maestro if it exists
if [ -f ".env.maestro" ]; then
  echo "📝 Loading environment variables from .env.maestro..."
  # Source the env file and export variables for Maestro
  set -a
  source .env.maestro
  set +a
  export MAESTRO_TEST_SEED_PHRASE
  export MAESTRO_TEST_NSEC
else
  echo "ℹ️  No .env.maestro file found. Create one from .env.maestro.example to use test seed phrase."
  echo "   Tests will use hardcoded seed phrase if available in flow files."
fi

# Determine which flows to run
EXTRA_ARGS=()
case "$TEST_TYPE" in
  "push")
    FLOWS=( ".maestro/flows/push-notifications.yaml" )
    ;;
  "all")
    FLOWS=( ".maestro/flows/" )
    # Exclude manual-only flows (e.g. physical-device push notification checks).
    EXTRA_ARGS=( "--exclude-tags" "manual" )
    ;;
  *)
    FLOWS=( ".maestro/flows/app-launch.yaml" ".maestro/flows/onboarding-flow.yaml" )
    ;;
esac

echo "🧪 Running Maestro tests..."
# Maestro will automatically pick up exported environment variables
maestro test "${FLOWS[@]}" "${EXTRA_ARGS[@]}" "${MAESTRO_ARGS[@]}"
