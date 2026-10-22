// Go 协议映射与线上模型列表核对于 2026-10-22；运行时不自动采纳未知模型。
var catalog = [
    { id: 'deepseek-v4.1-flash', title: 'DeepSeek V4.1 Flash' },
    { id: 'deepseek-v4-pro', title: 'DeepSeek V4 Pro', disableReasoning: true },
    { id: 'glm-5.3-flash', title: 'GLM 5.3 Flash' },
    { id: 'glm-5.3', title: 'GLM 5.3' },
    { id: 'glm-5.2', title: 'GLM 5.2' },
    { id: 'kimi-k3', title: 'Kimi K3' },
    { id: 'kimi-k2.7-code', title: 'Kimi K2.7 Code' },
    { id: 'longcat-2.0', title: 'LongCat 2.0' },
    { id: 'mimo-v2.6-flash', title: 'MiMo V2.6 Flash' },
    { id: 'mimo-v2.6-pro', title: 'MiMo V2.6 Pro' },
    { id: 'mimo-v2.5', title: 'MiMo V2.5' },
    { id: 'mimo-v2.5-pro', title: 'MiMo V2.5 Pro' },
    { id: 'step-5-preview', title: 'Step 5 Preview' },
    { id: 'hy4-preview', title: 'Hy4 Preview' },
    { id: 'hy3', title: 'Hy3' }
];

module.exports = {
    checkedAt: '2026-10-22',
    source: 'https://opencode.ai/v2/docs/console/go/#endpoints',
    chatUrl: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
    modelsUrl: 'https://opencode.ai/inference/go/v1/models',
    defaultModel: 'deepseek-v4.1-flash',
    catalog: catalog,
    ids: catalog.map(function (model) { return model.id; }),
    reasoningDisableIds: catalog.filter(function (model) {
        return model.disableReasoning === true;
    }).map(function (model) { return model.id; }),
    menuValues: catalog.map(function (model) {
        return { title: model.title, value: model.id };
    })
};
