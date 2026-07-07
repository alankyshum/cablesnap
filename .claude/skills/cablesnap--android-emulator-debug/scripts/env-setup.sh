#!/usr/bin/env bash
set -euo pipefail
# One-time: install JDK17 + Android SDK, create the 'cablesnap' AVD, and write <repo>/.android-env.sh.
# Idempotent. macOS Apple Silicon, no sudo.
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

# 1. JDK 17
brew list openjdk@17 >/dev/null 2>&1 || brew install openjdk@17
JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home)"

# 2. Android command-line tools
brew list --cask android-commandlinetools >/dev/null 2>&1 || brew install --cask android-commandlinetools
ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"

export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# 3. SDK packages (app targets sdk 35/36, min 26)
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager --install \
  "platform-tools" "emulator" \
  "platforms;android-35" "platforms;android-36" \
  "build-tools;35.0.0" "build-tools;36.0.0" \
  "system-images;android-35;google_apis;arm64-v8a"

# 4. AVD (Pixel 7, Google APIs, arm64)
if ! avdmanager list avd 2>/dev/null | grep -qE 'Name:[[:space:]]*cablesnap$'; then
  echo no | avdmanager create avd -n cablesnap -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7
fi

# 5. Write the env file every other script sources (git-ignored)
ENV_FILE="$REPO_ROOT/.android-env.sh"
cat > "$ENV_FILE" <<EOF
export JAVA_HOME="$JAVA_HOME"
export ANDROID_HOME="$ANDROID_HOME"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH"
EOF
grep -qxF '.android-env.sh' "$REPO_ROOT/.gitignore" 2>/dev/null || echo '.android-env.sh' >> "$REPO_ROOT/.gitignore"
echo "WROTE $ENV_FILE ; AVD 'cablesnap' ready."
