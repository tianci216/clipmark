#!/usr/bin/env bash
set -euo pipefail

# Build ClipMark as a native macOS .app (Swift shell + WKWebView around the
# existing Node/Express server). All build outputs live under app/.

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP_NAME="ClipMark"
APP_DIR="app/${APP_NAME}.app"
CONTENTS="${APP_DIR}/Contents"
RESOURCES="${CONTENTS}/Resources"
STAGE="app/.stage"

echo "==> Building server + client"
npm run build

echo "==> Assembling app bundle"
rm -rf "${APP_DIR}" "${STAGE}"
mkdir -p "${CONTENTS}/MacOS"
mkdir -p "${RESOURCES}/server"
mkdir -p "${RESOURCES}/dist"

echo "==> Compiling Swift shell"
swiftc -O \
  -framework AppKit \
  -framework WebKit \
  "app/${APP_NAME}.swift" \
  -o "${CONTENTS}/MacOS/${APP_NAME}"

echo "==> Copying server build"
cp server/*.js "${RESOURCES}/server/"

echo "==> Copying client build"
cp -R dist/* "${RESOURCES}/dist/"

echo "==> Installing production dependencies (native ABI matched to the node the app will run)"
# The app resolves node in this exact order (see ClipMark.swift); native modules
# must be built with the same node so the ABI matches at runtime.
NODE_BIN=""
for cand in "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -x "$cand" ]; then
    NODE_BIN="$cand"
    break
  fi
done
if [ -z "$NODE_BIN" ]; then
  echo "!! No node found in the app's candidate list; aborting" >&2
  exit 1
fi
echo "    bundling node_modules built for: $NODE_BIN"
mkdir -p "${STAGE}"
cp package.json package-lock.json "${STAGE}/"
(
  cd "${STAGE}"
  PATH="$(dirname "$NODE_BIN"):$PATH" npm ci --omit=dev --no-audit --no-fund >/dev/null
)
cp -R "${STAGE}/node_modules" "${RESOURCES}/node_modules"
rm -rf "${STAGE}"

echo "==> Writing marker package.json (keeps ESM + findRepoRoot working)"
printf '{"name":"clipmark","private":true,"type":"module"}\n' > "${RESOURCES}/package.json"

echo "==> Copying Info.plist"
cp "app/Info.plist" "${CONTENTS}/Info.plist"

echo "==> Ad-hoc codesigning"
codesign --force --deep --sign - "${APP_DIR}"

echo "==> Done: ${APP_DIR}"
echo "    Launch with: open ${APP_DIR}"
