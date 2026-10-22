# Changelog

## 1.1.1 (2026-10-22)

- 应用户要求恢复 V4.1 Flash 的显式实验性关闭思考请求：选择 disabled 时发送 `reasoning_effort: "none"`，默认仍为 model_default。
- 保留 V4 Pro 原有实验性选项；其他模型仍拒绝 disabled，不混发原生 thinking 字段，不自动重试或回退。
- 插件验证同步携带所选思考参数；拒绝业务错误/异常 Chat 响应，防止误报成功；两阶段回调防重复发送和重复完成。
- 新增 `npm run live:ab`：默认与 disabled 各一次流式 API 观测，须另行配置环境变量并授权真实用量。
- 作为试用预发布版发布；尚未做真实 API 或 Bob 实机验收，不承诺参数生效或速度提升。v1.1.0 历史包保留。

## 1.1.0 (2026-10-22)

- 更新为 Go 当前 `/inference/go/openai/v1/chat/completions` 与 `/inference/go/v1/models`。
- 默认模型改为 DeepSeek V4.1 Flash，新增 MiMo V2.6 Flash / Pro、Step 5 Preview。
- 旧 Flash 配置明确提示手动迁移；GLM 5.1、Kimi K2.6、Omen Alpha 因当前 Go 协议未确认暂从菜单移除，不宣称下线。
- V4.1 Flash 不继承旧 V4 的实验性关闭思考参数；disabled 暂仅支持 V4 Pro。
- 新增统一模型目录、菜单/版本一致性测试、只读上游变化检查；Mock 严格校验新 API 路径。
- 更新 Live Test 默认模型与观测方式，不对 V4.1 发送未经确认参数、不将非空译文误作语义完整。
- 打包限定运行文件，保留旧安装包备份，不再删除整个 dist 目录。
- 应用户远程下载需要，先推送 GitHub 并提供预发布安装包；Bob 实机验收和真实 Key 测试尚未完成，appcast 待验收后配置。

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
