/**
 * 插件配置读取与校验。
 * 所有函数均通过参数注入依赖（$option 等环境对象），便于在 Node 测试中复用。
 */

var errors = require('./errors.js');

/**
 * OpenCode Go 中使用 OpenAI Chat Completions 协议的模型。
 * 来源：https://opencode.ai/docs/go/#endpoints（核对于 2026-09-06）
 * 注意：deepseek-v4-flash-vision-exp 也走 Chat Completions，但 MVP 不支持图片，不纳入菜单。
 */
var CHAT_COMPLETIONS_MODELS = [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'glm-5.3-flash',
    'glm-5.3',
    'glm-5.2',
    'glm-5.1',
    'kimi-k3',
    'kimi-k2.7-code',
    'kimi-k2.6',
    'longcat-2.0',
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'hy4-preview',
    'hy3',
    'omen-alpha'
];

/**
 * 实验性关闭思考（reasoning_effort: "none"）仅允许的模型。
 * 依据 OpenCode 仓库 Issue（非正式 API 契约）：
 * https://github.com/anomalyco/opencode/issues/46178
 */
var REASONING_DISABLE_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];

var DEFAULTS = {
    model: 'deepseek-v4-flash',
    reasoningMode: 'model_default',
    stream: 'enabled',
    requestTimeout: 60
};

var VALID_TIMEOUTS = [30, 60, 120];

function isChatCompletionsModel(model) {
    return CHAT_COMPLETIONS_MODELS.indexOf(model) >= 0;
}

function isReasoningDisableModel(model) {
    return REASONING_DISABLE_MODELS.indexOf(model) >= 0;
}

/**
 * 从 $option 读取配置。未设置或非法的菜单值回退为默认值。
 */
function readOptions(option, pluginVersion) {
    var o = option || {};

    var model = typeof o.model === 'string' && o.model ? o.model : DEFAULTS.model;
    var reasoningMode = typeof o.reasoningMode === 'string' && o.reasoningMode
        ? o.reasoningMode
        : DEFAULTS.reasoningMode;
    var stream = typeof o.stream === 'string' && o.stream ? o.stream : DEFAULTS.stream;

    var timeout = parseInt(o.requestTimeout, 10);
    if (VALID_TIMEOUTS.indexOf(timeout) < 0) {
        timeout = DEFAULTS.requestTimeout;
    }

    return {
        apiKey: typeof o.apiKey === 'string' ? o.apiKey.trim() : '',
        model: model,
        reasoningMode: reasoningMode,
        stream: stream,
        requestTimeout: timeout,
        sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
        pluginVersion: pluginVersion
    };
}

/**
 * 校验配置，返回 service error 或 null。
 * 注意：sessionId 只做用户输入格式校验，实际的生成/读取在 session.js 中。
 */
function validateConfig(config, rawUserSessionId) {
    if (!config.apiKey || (typeof config.apiKey === 'string' && config.apiKey.trim() === '')) {
        return errors.secretKeyError('未设置 API Key。请在插件设置中填写 OpenCode Go API Key（https://opencode.ai/auth 获取）。');
    }
    if (!isChatCompletionsModel(config.model)) {
        return errors.paramError(
            '所选模型「' + config.model + '」不属于 Chat Completions 模型。请在插件设置中选择受支持的模型。'
        );
    }
    if (config.reasoningMode !== 'disabled' && config.reasoningMode !== 'model_default') {
        return errors.paramError('思考模式配置无效。');
    }
    if (config.reasoningMode === 'disabled' && !isReasoningDisableModel(config.model)) {
        return errors.paramError(
            '「请求关闭思考」仅支持 DeepSeek V4 系列（deepseek-v4-flash / deepseek-v4-pro），当前模型为「' +
            config.model + '」。请在插件设置中调整。'
        );
    }
    if (config.stream !== 'enabled' && config.stream !== 'disabled') {
        return errors.paramError('流式输出配置无效。');
    }
    if (typeof rawUserSessionId === 'string' && rawUserSessionId.length > 0) {
        var err = require('./session.js').validateUserSessionId(rawUserSessionId);
        if (err) {
            return err;
        }
    }
    return null;
}

module.exports = {
    CHAT_COMPLETIONS_MODELS: CHAT_COMPLETIONS_MODELS,
    REASONING_DISABLE_MODELS: REASONING_DISABLE_MODELS,
    DEFAULTS: DEFAULTS,
    isChatCompletionsModel: isChatCompletionsModel,
    isReasoningDisableModel: isReasoningDisableModel,
    readOptions: readOptions,
    validateConfig: validateConfig
};
