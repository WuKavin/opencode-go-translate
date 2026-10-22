# v1.1.1：V4.1 Flash 实验性关闭思考试用包

恢复插件的显式尝试能力，不代表已证实 OpenCode Go 能关闭 V4.1 的内部推理或提升速度。尚未完成真实 Key 与 Bob 实机验收。

## 下载后这样试

1. 下载 Assets 中的 `opencode-go-translate.bobplugin`，双击覆盖安装，不要先卸载。
2. 模型选择 **DeepSeek V4.1 Flash**。
3. 思考模式选择 **请求关闭思考（实验性，V4.1 Flash / V4 Pro）**。
4. 点击验证（消耗少量真实用量），再翻译一段不敏感短文本。
5. 手动切回「使用模型默认行为」，翻译同一文本，对比首段译文等待、总时长及译文完整性。

若参数被拒绝，请改回模型默认行为并反馈错误；插件不会自动重试、改参数或切换模型。

## 改动范围

- 显式 disabled 时，V4.1 Flash 的翻译与验证请求均发送 `reasoning_effort: "none"`。
- 默认仍为 model_default，不发送 reasoning/thinking 字段；不与原生 thinking 参数混发。
- V4 Pro 保留原有行为，其他模型仍拒绝 disabled。
- 验证检查正常 Chat 响应，防止业务错误误报成功，重复 handler 不重复发送请求。
- `npm run live:ab` 提供默认/disabled 各一次的流式对照入口（须环境变量与付费用量授权）；本次未运行。

HTTP 200 或没有 reasoning_content 均不能证明内部完全无推理，也不保证更快。参数尝试依据旧 V4 的 [Zen Issue 反馈](https://github.com/anomalyco/opencode/issues/46178)，并非 V4.1 Go 正式契约。

本包为预发布试用，不覆盖 v1.1.0 历史包，暂未配置 appcast；校验文件随包提供。

SHA-256：`1069919fa3384ab58a141f57725e8b1dbfe3a921aaa1279eeb9d934f186d0fa0`。

## 自动验证

- 178/178 项单元与 Mock 集成测试通过，包括 V4.1 的流式/非流式实验参数、参数拒绝后的不重试、验证参数一致性和回调防重。
- 8 个运行文件通过 macOS JavaScriptCore 语法解析；全部源文件/脚本通过 node --check 与 bash -n。
- 15 个模型的本地目录一致性和公开上游模型/协议检查通过。
- 未运行付费 API A/B 或 Bob 实机测试；真实效果需用户下载后对比。
