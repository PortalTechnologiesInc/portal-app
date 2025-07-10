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
          ndkVersion = "27.1.12297006";
        };
        androidComposition = pkgs.androidenv.composeAndroidPackages {
          buildToolsVersions = [ android.buildToolsVersion "34.0.0" ];
          platformVersions = [ "35" ];
          includeNDK = true;
          ndkVersion = android.ndkVersion;
          cmakeVersions = [ android.cmakeVersion ];
        };

        xcodeenv = import "${nixpkgs}/pkgs/development/mobile/xcodeenv" { inherit (pkgs) callPackage; };
        xcodewrapper = (xcodeenv.composeXcodeWrapper {
          versions = [ ];
          xcodeBaseDir = "/Applications/Xcode.app";
        });
        
        # Read package.json to get version
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
        
        # Fetch the template manually to avoid network accesses during the expo prebuild
        expoTemplate = pkgs.stdenv.mkDerivation {
          name = "expo-template-bare-minimum";
          src = pkgs.fetchFromGitHub {
            owner = "expo";
            repo = "expo";
            # NOTE: update this with new major expo versions. This is for sdk-53
            rev = "2b05fed7f45dc643175e4f1aad114e33402c6584";
            sha256 = "sha256-cMb+hE8rCgZSoLJGvGrqa0dvU+wn+GZBNDK3Fj4egII=";
            sparseCheckout = [ "templates/expo-template-bare-minimum" ];
          };
          nativeBuildInputs = [ pkgs.nodejs_23 ];
          buildPhase = ''
            # Set up npm environment to avoid permission issues
            export HOME=$TMPDIR
            export npm_config_cache=$TMPDIR/.npm
            export npm_config_tmp=$TMPDIR
            
            # Pack the local template directory, not a package from npm registry
            cd templates/expo-template-bare-minimum
            npm pack
          '';
          installPhase = ''
            mkdir -p $out
            cp expo-template-bare-minimum-*.tgz $out/expo-template-bare-minimum.tar.gz
          '';
        };

        src = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.difference
            (pkgs.lib.fileset.gitTracked ./.)
            ./flake.nix;
        };
        
        # First stage: Generate native Android project using Expo
        expo-prebuild = pkgs.buildNpmPackage {
          pname = "portal-expo-prebuild";
          version = packageJson.version;
          inherit src;
          
          npmDepsHash = "sha256-ZdkByDr8yh3J2WJOQyFW5hIX5jpaVAptootVipz/eCI=";
          
          nativeBuildInputs = with pkgs; [
            nodejs_23
          ];

          buildPhase = ''
            # Generate the native Android project (non-interactive)
            # Use local template tarball to avoid network access
            EXPO_NO_GIT_STATUS=1 npx expo prebuild \
              --platform android \
              --clean \
              --no-install \
              --template ${expoTemplate}/expo-template-bare-minimum.tar.gz
          '';

          installPhase = ''
            mkdir -p $out
            cp -r android $out/
            cp -r node_modules $out/
            cp package.json $out/
            cp app.json $out/
          '';
        };

        ANDROID_HOME = "${androidComposition.androidsdk}/libexec/android-sdk";
        GRADLE_JAVA_OPTS = "-Porg.gradle.java.installations.auto-detect=false -Porg.gradle.java.installations.auto-download=false -Porg.gradle.java.installations.paths=${pkgs.openjdk17.home}";
        GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${ANDROID_HOME}/build-tools/${android.buildToolsVersion}/aapt2 ";

        gradle-hack-files = self.packages.${system}.android-deps.overrideAttrs (oldAttrs: {
          name = "portal-gradle-hack-files";

          installPhase = ''
            mkdir -p $out
            cp -r .gradle/caches/modules-2/metadata-* $out/
          '';

          outputHash = "sha256-qr6RNZnWvfrFOwKSOBBUhsLJaIwWPvJI4HCRlzEVqd4=";
        });

        # Inspired by https://rafael.ovh/posts/packaging-gradle-software-with-nix/
        android-deps = pkgs.stdenv.mkDerivation rec {
          name = "portal-android-deps";
          inherit src;

          nativeBuildInputs = with pkgs; [ gradle nodejs_23 zip ];

          GRADLE_ARGS = "--no-daemon --write-verification-metadata sha512";
          JAVA_HOME = pkgs.openjdk17.home;

          inherit ANDROID_HOME GRADLE_OPTS;

          dontFixup = true;

          buildPhase = ''
            export HOME=$TMPDIR

            # Copy the expo-prebuild directory to the current directory
            cp -R --no-preserve=all ${expo-prebuild}/. .
            chmod +x ./android/gradlew
            chmod +x ./node_modules/react-native/sdks/hermesc/linux64-bin/hermesc

            cd android
            GRADLE_USER_HOME=$(pwd)/.gradle ./gradlew ${GRADLE_JAVA_OPTS} ${GRADLE_ARGS} bundleRelease
          '';

          installPhase = ''
            mkdir -p $out/caches/modules-2
            cp -a .gradle/caches/modules-2/. $out/caches/modules-2/

            rm -rf $out/caches/modules-2/metadata-**/*.bin

            # Delete extra files to ensure a stable hash
            find $out -type f -regex '.+\\(\\.lastUpdated\\|resolver-status\\.properties\\|_remote\\.repositories\\|\\.lock\\)' -delete
            find $out -type f \( -name "*.log" -o -name "*.lock" -o -name "gc.properties" \) -delete
          '';

          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = "sha256-7RbtH8yevDF77xZOLX1IAWuFiURJGbvveqkzXs+LIcc=";
        };

        android-bundle = pkgs.stdenv.mkDerivation rec {
          name = "portal-android-bundle";
          inherit src;

          nativeBuildInputs = with pkgs; [ gradle nodejs_23 zip ];
          
          GRADLE_ARGS = "--no-daemon --write-verification-metadata sha512";
          JAVA_HOME = pkgs.openjdk17.home;

          inherit ANDROID_HOME GRADLE_OPTS;
          
          dontFixup = true;
          
          buildPhase = ''
            export HOME=$TMPDIR

            # Copy the expo-prebuild directory to the current directory
            cp -R --no-preserve=all ${expo-prebuild}/. .
            chmod +x ./node_modules/react-native/sdks/hermesc/linux64-bin/hermesc

            cd android

            mkdir .gradle
            # Copy the whole gradle cache to a writeable path, since gradle wants to write more files into the $GRADLE_USER_HOME folder.
            cp -R --no-preserve=all ${android-deps}/. .gradle/

            cp -v ../nix-gradle-hack/* .gradle/caches/modules-2/metadata-*

            # Note: Nix Wiki makes use of $GRADLE_OPTS for setting additional gradle arguments, but this environment variable has since been deprecated:
            # https://nixos.wiki/wiki/Android#gradlew
            GRADLE_USER_HOME=$(pwd)/.gradle gradle bundleRelease --offline ${GRADLE_OPTS} ${GRADLE_JAVA_OPTS} ${GRADLE_ARGS}
          '';

          installPhase = ''
            mkdir -p $out/bin

            # Copy the release aab
            find ./app/build/outputs/bundle/release -name "*.aab" -exec cp {} $out/bin/portal-android-release.aab \;

            # Strip signature made with a random key
            zip -d $out/bin/portal-android-release.aab "META-INF/*"
          '';
        };
      in
      {
        packages = {
          inherit expo-prebuild android-deps android-bundle gradle-hack-files;
        };

        devShells = {
          ios = pkgs.mkShell {
            buildInputs = with pkgs; [ nodejs ];

            shellHook = ''
              export PATH="$HOME/.npm-global/bin:$PATH"
              export PATH="./node_modules/.bin:$PATH"
              npm config set prefix "$HOME/.npm-global"

              if ! command -v npx expo &> /dev/null; then
                echo "installing expo..."
                npm install -g @expo/cli
              fi

              # This is set somewhere by nix
              unset DEVELOPER_DIR
              # We want to use stuff from the xcode wrapper over nixpkgs
              export PATH=${xcodewrapper}/bin:$PATH
            '';
          };
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

              if ! command -v eas &> /dev/null; then
                echo "installing eas-cli..."      
                npm install -g eas-cli
              fi

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
