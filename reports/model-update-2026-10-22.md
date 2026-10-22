# v1.1.0 模型更新核对记录

## 只读调查结论

- 原始版本：v1.0.1 / `0143028`，默认模型为 `deepseek-v4-flash`。
- 2026-10-22 读取新旧模型列表，均未包含旧 Flash，均包含 `deepseek-v4.1-flash`。
- 官方 Go 文档已改为 `/inference/go/openai/v1/chat/completions` 与 `/inference/go/v1/models`。旧模型列表仍能访问，未测试旧推理端点，不宣称它已不可用。
- 以 Go 专用协议映射为准，不以通用 Console 推理示例或模型品牌推断 Go 协议。
- 本次没有使用真实 API Key 或发送付费推理请求。公开列表不能证明账户权限或实际翻译成功。

来源：[Go 文档](https://opencode.ai/v2/docs/console/go/#endpoints)、[当前模型列表](https://opencode.ai/inference/go/v1/models)、[旧模型列表](https://opencode.ai/zen/go/v1/models)。

## 根据上述来源整理，非完整官方模型目录

- 默认模型改为 DeepSeek V4.1 Flash。
- 新增 MiMo V2.6 Flash、MiMo V2.6 Pro、Step 5 Preview。
- GLM 5.1、Kimi K2.6、Omen Alpha 仍在列表，但当前 Go endpoint 表未确认协议，暂从菜单移除，不宣称已下线。
- MiniMax M3.1 Flash Free 与 Beam Free 暂不纳入；免费调用成功不能用来证明 Key 有效。Beam Free 官方还列有中国地区限制。
- LongCat 2.5 Preview Free 在官方表中，但本次线上列表无此 ID，暂不加入。
- V4.1 的 `reasoning_effort: "none"` 未找到 Go 官方契约，本版不发送；仅 V4 Pro 保留原有实验性选项。

公开元数据快照：`tests/fixtures/go-models-2026-10-22.json`；人工审核的唯一运行时目录：`src/lib/models.js`。

## 回归验证入口

`npm test`、`npm run jsc-check`、`npm run models:check-local`、`npm run models:check`、所有源文件 `node --check` 与 shell 脚本 `bash -n`。

真实 Key 验证、Bob 流式/非流式翻译、取消与重启后 session 复用需实机验收。结果在交付时另行记录，不把 Mock 结果视为实机通过。

## 本次执行结果（2026-10-22）

- `npm test`：160/160 通过，新增 27 项测试；保留原鉴权与流式/非流式取消回归。
- `npm run jsc-check`：8 个运行文件通过 macOS JavaScriptCore 语法检查。
- `npm run models:check-local`：15 个模型的目录/菜单/默认值/版本一致。
- `npm run models:check`：菜单内模型均在线上存在，均有 Go Chat 协议映射；与核对快照无新增、移除或协议差异。
- 所有 `src` 与 `scripts` JavaScript 的 `node --check`、所有 shell 的 `bash -n`、`git diff --check` 均通过。
- 安装包 v1.1.0：9 个运行文件，根目录包含 info.json 与 main.js；逐文件与源码比对一致；无测试、Key 样式字符串或 Live Test 数据。
- 下载文件与 dist 包、校验文件一致；大小 18,675 字节。
- SHA-256：`0503c5014d7453c699461defef94890d33f2359790a35cb58f2b763bf96614c0`。
- 安装包：`~/Downloads/opencode-go-translate.bobplugin`；校验：同名 `.sha256` 文件。
- 源码和旧 dist 已完整备份在本机临时目录；备份时下载目录无同名旧包。验收前不清理备份。
- 付费 Live Test、Bob 实机测试：未执行。应用户远程下载要求，先推送源码并发布 GitHub 预发布版供下载，不能视为实机验收已通过。appcast 仍待验收后配置。

## 请在 Bob 验收

1. 从 [GitHub v1.1.0 预发布页面](https://github.com/WuKavin/opencode-go-translate/releases/tag/v1.1.0)下载安装包，覆盖安装，不先卸载。
2. 模型选择 **DeepSeek V4.1 Flash**，思考模式选择 **使用模型默认行为**。
3. 点击验证（会产生真实请求及少量用量）；测试中英双向流式和非流式翻译。
4. 测试多段文本、Markdown、代码、URL、路径和占位符；尝试取消慢请求。
5. 重启 Bob 后再次翻译，确认 session ID 复用。
6. 告知是否通过；通过后配置后续版本检查。预发布包不代表 Bob 实机验收通过。
