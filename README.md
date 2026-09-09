# OpenCode Go Translate（Bob 插件）

使用你自己的 OpenCode Go API Key（BYOK）在 [Bob](https://bobtranslate.com) 中调用大模型完成文本翻译。

- 仅支持 Bob 1.8.0+（macOS）
- 仅支持 OpenCode Go 中 **Chat Completions 协议**的模型
- 流式 / 非流式输出、请求取消、配置验证、稳定 session ID
- 仅限账户持有人本机使用

## ⚠️ 合规提示（请先阅读）

- OpenCode Go 官方定位主要面向 OpenCode 与产生类似请求的 coding agents（[官方说明](https://opencode.ai/docs/go/#where-can-i-use-it)）。**「个人触发的翻译调用」是否符合其预期用途，未获得官方明确确认。**
- 本插件仅供 API Key 持有人本人使用，不提供公共代理、不共享 Key、不规避任何限制或风控；不保证账户不会被限制。
- 如需公开分发本插件，请先向 OpenCode（`help@anoma.ly`）书面确认翻译用途是否允许。

## 安装

1. 在 [https://opencode.ai/auth](https://opencode.ai/auth) 登录并订阅 Go，复制 API Key
2. 双击 `opencode-go-translate.bobplugin` 安装
3. 打开 Bob 偏好设置 → 插件 → OpenCode Go 翻译，粘贴 API Key
4. 点击「验证」确认配置可用（验证会先检查模型列表，再发起一次最小真实翻译请求以确认 API Key 有效，消耗少量额度）

## 配置项

| 选项 | 说明 |
|---|---|
| API Key | OpenCode Go API Key，必填，仅保存在 Bob 偏好设置中 |
| 模型 | 仅列出走 Chat Completions 协议的模型（见下） |
| 思考模式 | 「请求关闭思考（实验性，仅 DeepSeek V4）」或「使用模型默认行为」 |
| 流式输出 | 开启后译文逐步显示（默认开启） |
| 请求超时 | 30 / 60 / 120 秒 |
| Session ID | 留空自动生成并保存在插件沙盒；也可自定义（`[A-Za-z0-9._:-]{8,128}`） |

### 模型列表

`deepseek-v4-flash`、`deepseek-v4-pro`、`glm-5.3-flash`、`glm-5.3`、`glm-5.2`、`glm-5.1`、`kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6`、`longcat-2.0`、`mimo-v2.5`、`mimo-v2.5-pro`、`hy4-preview`、`hy3`、`omen-alpha`

> OpenCode Go 的模型与 endpoint 映射会变化，以[官方页面](https://opencode.ai/docs/go/#endpoints)为准。
> GPT / Grok / Muse（Responses 协议）与 MiniMax / Qwen（Messages 协议）模型**不支持**，本插件不会发送这类请求。
> 请求头固定包含 `x-opencode-session`（用于 prompt caching 优化）与明确标识插件身份的 `User-Agent: Bob-OpenCode-Go-Translate/<version> (Bob Plugin; macOS)`，请求只发送到固定地址 `https://opencode.ai`。

## 隐私

- **待翻译的原文会发送至 OpenCode Go 及其上游模型供应商**，请勿翻译包含敏感信息的文本。
- API Key 仅从 Bob 偏好设置读取：不写入文件、不写入日志、不放入 URL 或错误信息。
- Session ID 仅用于 `x-opencode-session` 请求头，由随机 ID 生成（`bob-translate:<随机ID>`），不含用户名、设备名、Key 或原文；卸载插件时其沙盒由 Bob 清理。
- Bob 的 `secure` 输入框只是界面隐藏输入，官方未承诺加密存储。
- 各模型的数据保留与训练政策不同（例如 Muse Contributor 系列用于训练），请查看[官方 Privacy 表](https://opencode.ai/docs/go/#privacy)。

## 额度

OpenCode Go 按 5 小时 / 周 / 月限额计费（美元值），不同模型消耗差异很大（如 DeepSeek V4 Flash 每 5 小时约 7600 次请求，Kimi K3 约 110 次）。翻译属低 token 请求，实际请求数会高于官方估算口径；用量请在[控制台](https://opencode.ai/auth)查看。本插件**不做自动重试**，失败请求需要手动重新发起。

## 「请求关闭思考」（实验性）

选择 `disabled` 时，仅对 DeepSeek V4 系列模型发送 `reasoning_effort: "none"`：

- 该参数来自 OpenCode 仓库 Issue 反馈（[anomalyco/opencode#46178](https://github.com/anomalyco/opencode/issues/46178)），**不是正式 Go API 契约**；
- 不保证服务端完全不产生内部推理；即使响应不含 `reasoning_content` 也不能证明；
- 对非 DeepSeek V4 模型选择该选项会直接返回参数错误，不会静默发送。

## 开发

```bash
npm test          # 单元测试 + Mock 集成测试（Node 内置 test runner）
npm run jsc-check # JavaScriptCore 兼容性检查
npm run package   # 打包 dist/opencode-go-translate.bobplugin 并复制到 ~/Downloads
npm run checksum  # 生成 SHA-256
npm run live:test # Live Test（需环境变量 OPENCODE_GO_API_KEY，会产生真实用量）
```

插件运行于 Bob 内置 JavaScriptCore，源码不使用 Node API、fetch、DOM、`?.`/`??` 等 API 与语法。

## 已知限制

- 不支持 OpenAI Responses / Anthropic Messages 协议模型，不支持 OCR、TTS、图片输入；
- 不做对话记忆、历史消息、用量查询；
- 流式失败后不会自动回放为非流式；无自动重试；
- Live Test 需要本地配置 `OPENCODE_GO_API_KEY` 后单独执行；
- 公开提交至 Bob 插件列表前需完成前述合规确认。

## License

[MIT](./LICENSE)
