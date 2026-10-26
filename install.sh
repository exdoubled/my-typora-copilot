#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
work_dir=$(mktemp -d "$temp_root/typora-copilot.XXXXXXXXXX")
cleanup() {
  if [[ "$work_dir" == "$temp_root"/typora-copilot.* ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT
cd "$work_dir"

latest_release=$(curl -fsSL https://api.github.com/repos/exdoubled/my-typora-copilot/releases/latest)
download_url=$(grep -m 1 '"browser_download_url"' <<< "$latest_release" | sed -E 's/.*"browser_download_url": "(.*)".*/\1/')
if [[ -z "$download_url" ]]; then
  echo "No release archive found" >&2
  exit 1
fi
curl -fsSL --proto '=https' --proto-redir '=https' "$download_url" -o release.zip
mkdir release
unzip release.zip -d release
cd release
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Trying to uninstall the previous version (if any)..."
  chmod +x ./bin/uninstall_macos.sh
  ./bin/uninstall_macos.sh --silent
  echo "Trying to install the new version..."
  chmod +x ./bin/install_macos.sh
  ./bin/install_macos.sh
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "Trying to uninstall the previous version (if any)..."
  chmod +x ./bin/uninstall_linux.sh
  ./bin/uninstall_linux.sh --silent
  echo "Trying to install the new version..."
  chmod +x ./bin/install_linux.sh
  ./bin/install_linux.sh
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi
