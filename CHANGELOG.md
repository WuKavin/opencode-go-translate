# Changelog

## 1.0.0 (2026-09-06)

首个版本。

- OpenCode Go BYOK 文本翻译（Chat Completions 模型，15 个内置模型）
- 流式（`$http.streamRequest` + SSE 解析状态机）与非流式输出
- 请求取消（`query.cancelSignal`，once guard 保证最终回调最多一次）
- `pluginValidate` 配置验证（GET `/v1/models` 确认所选模型存在）
- 稳定 session ID：自动生成 `bob-translate:<随机ID>`，持久化到插件沙盒，跨 Bob 重启复用；支持自定义（含格式校验）
- 实验性「请求关闭思考」：仅 DeepSeek V4 系列发送 `reasoning_effort: "none"`
- 错误处理按 Bob service error 规范；错误摘要脱敏；API Key 不落日志
- 单元测试 + Mock 集成测试（Node 内置 test runner）；JavaScriptCore 语法兼容检查
- 合规范围：仅限账户持有人本机使用
