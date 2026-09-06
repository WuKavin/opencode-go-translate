#!/bin/bash
# 打包 Bob 插件：压缩 src 目录内部内容（不包含 src 文件夹本身），改名为 .bobplugin
# 参考：https://bobtranslate.com/plugin/quickstart/pack.html
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="opencode-go-translate"
DIST="dist"
VERSION=$(node -p "require('./package.json').version")

# 打包前先做 JSC 兼容性检查
bash scripts/jsc-check.sh

rm -rf "$DIST"
mkdir -p "$DIST"

(
    cd src
    # 进入插件根目录，压缩所有内容（含子目录），排除无关文件
    zip -r -X "../$DIST/$NAME.bobplugin" . -x '*.DS_Store' -x '__MACOSX*' -x '*.log'
)

echo "==> 插件版本：$VERSION"
unzip -l "$DIST/$NAME.bobplugin"

bash scripts/checksum.sh

cp "$DIST/$NAME.bobplugin" "$DIST/$NAME.bobplugin.sha256" "$HOME/Downloads/"

echo "==> 已输出到："
echo "    $HOME/Downloads/$NAME.bobplugin"
echo "    $HOME/Downloads/$NAME.bobplugin.sha256"
