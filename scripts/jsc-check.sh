#!/bin/bash
# JavaScriptCore 兼容性检查：
# 1. grep 检查禁用的语法（optional chaining / nullish coalescing）
# 2. 用 macOS 系统自带 JavaScriptCore（osascript -l JavaScript）解析所有插件源码
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0

echo "==> 检查禁用语法（?. ??）"
if grep -rnE '\?\.|\?\?|\?\.' src --include='*.js'; then
    echo "错误：src 中使用了 optional chaining / nullish coalescing 等未验证语法"
    FAIL=1
else
    echo "OK：未使用禁用语法"
fi

echo "==> JavaScriptCore 语法解析检查（osascript）"
# shellcheck disable=SC2046
osascript -l JavaScript scripts/jsc-syntax-check.js $(find src -name '*.js' | sort)

echo "JSC 兼容性检查通过"
exit "$FAIL"
