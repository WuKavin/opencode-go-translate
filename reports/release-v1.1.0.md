# v1.1.0：Go 模型与端点更新（预发布）

供远程下载安装；160 项自动测试已通过，但尚未完成真实 Key 与 Bob 实机验收。

## 安装与迁移

1. 下载下方 Assets 中的 `opencode-go-translate.bobplugin`，双击覆盖安装，不要先卸载。
2. 手动选择 **DeepSeek V4.1 Flash**，思考模式选择 **使用模型默认行为**。
3. 点击「验证」（会消耗少量真实用量），测试流式/非流式翻译及取消。

旧 `deepseek-v4-flash` 不再出现在本次线上列表中，插件不会静默替换已保存的模型。V4.1 的关闭思考参数尚未确认，请勿沿用旧 disabled 配置。

## 更新内容

- 采用当前 Go `/inference/go/openai/v1/chat/completions` 与 `/inference/go/v1/models` 端点。
- 新增 MiMo V2.6 Flash / Pro、Step 5 Preview；菜单以 Go 官方协议表与线上列表交集为准。
- GLM 5.1、Kimi K2.6、Omen Alpha 因当前 Go 协议尚未确认暂从菜单移除，不代表服务端下线。
- 增加统一模型目录、菜单一致性测试和只读模型变化检查。
- 保留鉴权校验、流式/非流式取消与一次性完成回调测试。

## 校验

SHA-256：`0503c5014d7453c699461defef94890d33f2359790a35cb58f2b763bf96614c0`

附带 `opencode-go-translate.bobplugin.sha256`。自动测试 160/160、JavaScriptCore 8 个运行文件、JS 与 shell 语法检查均通过。

本版暂未配置 Bob appcast，需手动下载安装。未使用真实 API Key 做付费测试；不保证上游模型可用性或翻译质量，欢迎反馈实机结果。
