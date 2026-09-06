#!/bin/bash
# 生成 SHA-256 校验文件
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="opencode-go-translate"
DIST="dist"

if [ ! -f "$DIST/$NAME.bobplugin" ]; then
    echo "错误：$DIST/$NAME.bobplugin 不存在，请先运行 npm run package" >&2
    exit 1
fi

cd "$DIST"
shasum -a 256 "$NAME.bobplugin" > "$NAME.bobplugin.sha256"
cat "$NAME.bobplugin.sha256"
