# Changelog

## 1.0.1 (2026-09-09)

修复（Code Review 反馈）：

- **验证不再被假 Key 骗过（P1）**：公开 `/models` 端点不校验 API Key（实测无效 Key 也返回 200），原实现仅凭该端点判定验证通过。现在 `pluginValidate` 改为两阶段：`/models` 仅作模型存在性检查，另发起一次最小真实 Chat Completions 请求确认 API Key 与模型访问权限（会消耗少量额度）；README 已注明。
- **非流式取消终止底层请求（P2）**：非流式路径此前只屏蔽回调，未把 `cancelSignal` 传给 `$http.request`，取消后请求仍会继续占用网络并可能消耗额度。现在与流式路径语义一致。
- Mock 测试环境修正：`/models` 对假 Key 返回 200（与真实服务行为一致），鉴权回归测试移至 Chat 请求阶段；新增「非流式取消 → 服务端观察到连接断开」集成回归测试。

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
