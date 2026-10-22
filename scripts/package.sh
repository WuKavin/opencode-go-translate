#!/bin/bash
# 打包 Bob 插件：压缩 src 目录内部内容（不包含 src 文件夹本身），改名为 .bobplugin
# 参考：https://bobtranslate.com/plugin/quickstart/pack.html
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="opencode-go-translate"
DIST="dist"
VERSION=$(node -p "require('./package.json').version")

# 打包前先做 JSC 兼容性检查
node scripts/check-models.js --local
bash scripts/jsc-check.sh

mkdir -p "$DIST"
BACKUP=""
for dir in "$DIST" "$HOME/Downloads"; do
    for suffix in bobplugin bobplugin.sha256; do
        if [ -f "$dir/$NAME.$suffix" ]; then
            if [ -z "$BACKUP" ]; then
                BACKUP=$(mktemp -d "${TMPDIR:-/tmp}/bob-opencode-go-package.XXXXXX")
            fi
            label=$(basename "$dir")
            mkdir -p "$BACKUP/$label"
            cp -p "$dir/$NAME.$suffix" "$BACKUP/$label/"
        fi
    done
done
if [ -f "$DIST/$NAME.bobplugin" ]; then
    mv "$DIST/$NAME.bobplugin" "$BACKUP/previous.bobplugin"
fi

(
    cd src
    # 仅打包运行文件，避免日志、测试或备份意外入包。
    zip -X "../$DIST/$NAME.bobplugin" info.json main.js lib/*.js
)

echo "==> 插件版本：$VERSION"
unzip -l "$DIST/$NAME.bobplugin"

bash scripts/checksum.sh

cp "$DIST/$NAME.bobplugin" "$DIST/$NAME.bobplugin.sha256" "$HOME/Downloads/"

echo "==> 已输出到："
echo "    $HOME/Downloads/$NAME.bobplugin"
echo "    $HOME/Downloads/$NAME.bobplugin.sha256"
if [ -n "$BACKUP" ]; then
    echo "==> 旧包备份（验收前保留）：$BACKUP"
fi
