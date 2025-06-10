{
  description = "React native flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;

          config.android_sdk.accept_license = true;
          config.allowUnfree = true;
        };
        android = {
          buildToolsVersion = "35.0.0";
          cmakeVersion = "3.22.1";
        };
        androidComposition = pkgs.androidenv.composeAndroidPackages {
          buildToolsVersions = [ android.buildToolsVersion "34.0.0" ];
          platformVersions = [ "35" ];
          includeNDK = true;
          ndkVersion = "26.1.10909125";
          cmakeVersions = [ android.cmakeVersion ];
        };
      in
      {
        devShells = {
          default = pkgs.mkShell rec {
            name = "rn-shell";
            # Packages included in the environment
            buildInputs = with pkgs; [
              aider-chat
              nodejs_23
              openjdk17
            ];

            ANDROID_SDK_ROOT = "${androidComposition.androidsdk}/libexec/android-sdk";
            ANDROID_HOME = "${ANDROID_SDK_ROOT}";
            ANDROID_NDK_ROOT = "${ANDROID_SDK_ROOT}/ndk-bundle";
            JAVA_HOME = pkgs.openjdk17.home;

            # Ensures that we don't have to use a FHS env by using the nix store's aapt2.
            GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${ANDROID_SDK_ROOT}/build-tools/${android.buildToolsVersion}/aapt2";

            # Run when the shell is started up
            shellHook = ''
              export PATH="$HOME/.npm-global/bin:$PATH"
              export PATH="./node_modules/.bin:$PATH"
              npm config set prefix "$HOME/.npm-global"

              if ! command -v npx expo &> /dev/null; then
                echo "installing expo..."
                npm install -g @expo/cli
              fi
            '';
          };
        };
      }
    );
}
