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
2. 从 [v1.1.0 预发布页面](https://github.com/WuKavin/opencode-go-translate/releases/tag/v1.1.0)下载 `opencode-go-translate.bobplugin`，双击安装（尚待 Bob 实机验收）
3. 打开 Bob 偏好设置 → 插件 → OpenCode Go 翻译，粘贴 API Key
4. 选择 **DeepSeek V4.1 Flash**，思考模式选 **使用模型默认行为**
5. 点击「验证」确认配置可用（验证会先检查模型列表，再发起一次最小真实请求以确认 API Key 和模型访问权限，消耗少量额度）

### 从 v1.0.x 升级

直接双击新安装包覆盖安装，不要先卸载，避免 Bob 清理插件沙盒中的 session ID。插件标识符未变，插件不会主动修改 API Key 或 session 配置。

旧 `deepseek-v4-flash` 已不在 2026-10-22 查询的线上列表中；请**手动改选 DeepSeek V4.1 Flash**，并将思考模式改为「使用模型默认行为」。插件不静默替换已保存的旧模型。GLM 5.1、Kimi K2.6、Omen Alpha 暂从菜单移除，是因为当前 Go 文档未确认其协议，不代表它们已从服务端下线。

本次先发布 GitHub 预发布版供远程下载，仍待 Bob 实机验收。Bob 更新检查地址将在验收通过后配置；旧 v1.0.x 未包含 `appcast`，需要手动安装一次新版。

## 配置项

| 选项 | 说明 |
|---|---|
| API Key | OpenCode Go API Key，必填，仅保存在 Bob 偏好设置中 |
| 模型 | 仅列出走 Chat Completions 协议的模型（见下） |
| 思考模式 | 「请求关闭思考（实验性，仅 DeepSeek V4 Pro）」或「使用模型默认行为」；V4.1 Flash 尚未确认关闭参数 |
| 流式输出 | 开启后译文逐步显示（默认开启） |
| 请求超时 | 30 / 60 / 120 秒 |
| Session ID | 留空自动生成并保存在插件沙盒；也可自定义（`[A-Za-z0-9._:-]{8,128}`） |

### 模型列表

根据 2026-10-22 官方 Go endpoint 映射和公开模型列表交集整理，非完整官方模型目录：

`deepseek-v4.1-flash`、`deepseek-v4-pro`、`glm-5.3-flash`、`glm-5.3`、`glm-5.2`、`kimi-k3`、`kimi-k2.7-code`、`longcat-2.0`、`mimo-v2.6-flash`、`mimo-v2.6-pro`、`mimo-v2.5`、`mimo-v2.5-pro`、`step-5-preview`、`hy4-preview`、`hy3`

> 模型与 endpoint 会变化，以[Go 官方协议表](https://opencode.ai/v2/docs/console/go/#endpoints)和[公开模型列表](https://opencode.ai/inference/go/v1/models)为准。列表存在不代表协议或账户权限已确认。
> GPT / Grok / Muse 使用 Responses；Claude Haiku、Qwen、MiniMax M3 使用 Messages；Gemini 使用 Google 协议，均不支持。不能按品牌一概推断协议：MiniMax M3.1 Flash Free 使用 Chat，但本版暂不纳入免费模型，避免免费调用成功被误作 Key 鉴权成功。
> Beam Free 有中国地区限制，暂不纳入；LongCat 2.5 Preview Free 尚未出现在本次公开列表，暂不纳入。[来源](https://opencode.ai/v2/docs/console/go/)
> 请求头固定包含 `x-opencode-session`（用于 prompt caching 优化）与明确标识插件身份的 `User-Agent: Bob-OpenCode-Go-Translate/<version> (Bob Plugin; macOS)`，请求只发送到固定地址 `https://opencode.ai`。

翻译地址固定为 `https://opencode.ai/inference/go/openai/v1/chat/completions`；模型检查为 `https://opencode.ai/inference/go/v1/models`，不自动向旧协议端点回放请求。

## 隐私

- **待翻译的原文会发送至 OpenCode Go 及其上游模型供应商**，请勿翻译包含敏感信息的文本。
- API Key 仅从 Bob 偏好设置读取：不写入文件、不写入日志、不放入 URL 或错误信息。
- Session ID 仅用于 `x-opencode-session` 请求头，由随机 ID 生成（`bob-translate:<随机ID>`），不含用户名、设备名、Key 或原文；卸载插件时其沙盒由 Bob 清理。
- Bob 的 `secure` 输入框只是界面隐藏输入，官方未承诺加密存储。
- 各模型的数据保留与训练政策不同，请查看[官方 Privacy 表](https://opencode.ai/v2/docs/console/go/#privacy)，不作“绝对零留存”承诺。

## 额度

Go 与 Go Plus 的额度、模型价格及限额会变化，实际消耗取决于输入、输出、推理和缓存等因素，不承诺翻译请求数或速度。请查看[官方用量说明](https://opencode.ai/v2/docs/console/go/#usage-limits)与[控制台](https://opencode.ai/console)。本插件**不做自动重试**，失败请求需要手动重新发起。

## 「请求关闭思考」（实验性）

选择 `disabled` 时，本版仅对 **DeepSeek V4 Pro** 发送 `reasoning_effort: "none"`：

- 该参数来自 OpenCode 仓库 Issue 反馈（[anomalyco/opencode#46178](https://github.com/anomalyco/opencode/issues/46178)），**不是正式 Go API 契约**；
- 不保证服务端完全不产生内部推理；即使响应不含 `reasoning_content` 也不能证明；
- 不把 V4 的社区反馈自动推广至 V4.1。对 V4.1 Flash 和其他模型选择该选项会返回明确参数错误，请改为「使用模型默认行为」。

## 开发

```bash
npm test          # 单元测试 + Mock 集成测试（Node 内置 test runner）
npm run jsc-check # JavaScriptCore 兼容性检查
npm run models:check-local # 菜单、统一目录、默认值及版本一致性（离线）
npm run models:check # 只读检查官方协议表与公开模型列表，不使用 Key，不产生推理用量
npm run package   # 打包 dist/opencode-go-translate.bobplugin 并复制到 ~/Downloads
npm run checksum  # 生成 SHA-256
npm run live:test # 显式付费 API 测试：V4.1 Flash 默认思考，流式/非流式各 5 次
```

插件运行于 Bob 内置 JavaScriptCore，源码不使用 Node API、fetch、DOM、`?.`/`??` 等 API 与语法。

模型唯一目录为 `src/lib/models.js`；修改后同步 `info.json` 菜单，本地检查和打包会阻止不一致的目录发布。在线检查发现上游缺失、新增或协议变化时以非零状态退出，仅报告差异，**不会自动改写模型或静默扩展协议支持**。尚未配置定时检查。

Live Test 仅从本地环境变量 `OPENCODE_GO_API_KEY` 读取 Key，请勿把 Key 写入代码或命令示例。记录真实 HTTP 状态、流式 TTFT、完成标志及 reasoning 字段观测，不保存原文/译文；非流式 TTFT 无法测得时记为 null。非空不等于译文语义完整，仍须人工验收。打包会保留旧包备份，验收前不要删除。

## 已知限制

- 不支持 OpenAI Responses / Anthropic Messages 协议模型，不支持 OCR、TTS、图片输入；
- 不做对话记忆、历史消息、用量查询；
- 流式失败后不会自动回放为非流式；无自动重试；
- Live Test 需要本地配置 `OPENCODE_GO_API_KEY` 后单独执行；
- 公开提交至 Bob 插件列表前需完成前述合规确认。

## License

[MIT](./LICENSE)
