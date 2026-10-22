'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/lib/models.js');
const config = require('../src/lib/config.js');
const info = require('../src/info.json');
const request = require('../src/lib/request.js');
const snapshot = require('./fixtures/go-models-2026-10-22.json');
const { checkLocal, parseGoChatModels, compareUpstream } = require('../scripts/check-models.js');

const payload = (ids) => ({ object: 'list', data: ids.map((id) => ({ id })) });

test('模型目录：菜单、默认值、allowlist 与插件版本保持一致', () => {
    assert.doesNotThrow(() => checkLocal());
    assert.deepEqual(config.CHAT_COMPLETIONS_MODELS, models.ids);
    assert.equal(config.DEFAULTS.model, 'deepseek-v4.1-flash');
    assert.equal(config.DEFAULTS.reasoningMode, 'model_default');
    assert.equal(request.buildUserAgent(info.version), 'Bob-OpenCode-Go-Translate/' + require('../package.json').version + ' (Bob Plugin; macOS)');
});

test('模型目录：菜单漂移、默认值漂移、版本漂移均使本地检查失败', () => {
    for (const mutate of [
        (copy) => copy.options.find((item) => item.identifier === 'model').menuValues.pop(),
        (copy) => { copy.options.find((item) => item.identifier === 'model').defaultValue = 'deepseek-v4-flash'; },
        (copy) => { copy.version = '1.0.1'; }
    ]) {
        const copy = JSON.parse(JSON.stringify(info));
        mutate(copy);
        assert.throws(() => checkLocal(copy));
    }
});

test('模型目录：所有菜单 ID 同时满足官方 Chat 映射与公开列表快照', () => {
    for (const id of models.ids) {
        assert.ok(snapshot.observedIds.includes(id), id);
        assert.ok(snapshot.documentedChatIds.includes(id), id);
        assert.ok(!snapshot.excludedChatIds.includes(id), id);
    }
    assert.deepEqual(models.ids.slice().sort(), snapshot.documentedChatIds.filter((id) =>
        snapshot.observedIds.includes(id) && !snapshot.excludedChatIds.includes(id)
    ).sort());
});

test('配置迁移：旧 Flash 保留原值并拒绝，不静默切换或修改用户设置', () => {
    const option = { apiKey: 'test-placeholder', model: 'deepseek-v4-flash', reasoningMode: 'disabled', sessionId: 'bob-user:12345678' };
    const before = JSON.stringify(option);
    const result = config.readOptions(option, info.version);
    const error = config.validateConfig(result, result.sessionId);
    assert.equal(result.model, option.model);
    assert.equal(error.type, 'param');
    assert.match(error.message, /V4\.1 Flash/);
    assert.match(error.message, /模型默认行为/);
    assert.equal(JSON.stringify(option), before);
});

test('配置迁移：仅缺少当前 Go 协议证据的旧模型不冒称已下线', () => {
    for (const id of ['glm-5.1', 'kimi-k2.6', 'omen-alpha']) {
        const error = config.validateConfig(config.readOptions({ apiKey: 'test-placeholder', model: id }, info.version));
        assert.equal(error.type, 'param');
        assert.match(error.message, /仍在模型列表/);
        assert.match(error.message, /未确认/);
        assert.ok(!models.ids.includes(id));
    }
});

test('模型目录：Responses、Messages、Gemini、免费模型不得误入 allowlist', () => {
    for (const id of ['gpt-6-luna', 'grok-4.7', 'claude-haiku-5-5', 'qwen3.8-max',
        'gemini-4-argon-contributor', 'minimax-m3', ...snapshot.excludedChatIds]) {
        assert.equal(config.isChatCompletionsModel(id), false, id);
    }
});

test('请求：新模型保持原始 ID，新 Flash 默认不携带未经确认字段', () => {
    for (const id of models.ids) {
        const body = request.buildRequestBody(id, 'English', 'Simplified Chinese', 'hello', 'enabled', 'model_default');
        assert.equal(body.model, id);
        assert.equal(body.stream, true);
        for (const key of ['reasoning_effort', 'thinking', 'temperature', 'max_tokens']) assert.ok(!(key in body), key);
    }
    const body = request.buildValidateRequestBody(models.defaultModel);
    assert.equal(body.model, 'deepseek-v4.1-flash');
    assert.equal(body.stream, false);
    assert.ok(!('reasoning_effort' in body));
});

test('思考模式：V4.1 仅显式选择 disabled 时允许实验性请求，默认不变', () => {
    const opts = config.readOptions({ apiKey: 'test-placeholder', model: models.defaultModel, reasoningMode: 'disabled' }, info.version);
    const error = config.validateConfig(opts);
    assert.equal(error, null);
    assert.equal(config.DEFAULTS.reasoningMode, 'model_default');
    assert.deepEqual(config.REASONING_DISABLE_MODELS, ['deepseek-v4.1-flash', 'deepseek-v4-pro']);
});

test('只读检查：基线快照无差异', () => {
    assert.equal(compareUpstream(payload(snapshot.observedIds), snapshot.documentedChatIds).changed, false);
});

test('只读检查：默认模型消失时失败，即使其余模型存在', () => {
    const result = compareUpstream(payload(snapshot.observedIds.filter((id) => id !== models.defaultModel)), snapshot.documentedChatIds);
    assert.equal(result.changed, true);
    assert.deepEqual(result.changes.menuMissingOnline, [models.defaultModel]);
});

test('只读检查：新增/移除及协议漂移会被报告，不会自动加入菜单', () => {
    const before = models.ids.slice();
    const result = compareUpstream(payload([...snapshot.observedIds, 'unknown-new-model']), snapshot.documentedChatIds.filter((id) => id !== 'glm-5.3'));
    assert.equal(result.changed, true);
    assert.deepEqual(result.changes.upstreamAdded, ['unknown-new-model']);
    assert.deepEqual(result.changes.menuWithoutChatMapping, ['glm-5.3']);
    assert.deepEqual(models.ids, before);
});

test('只读检查：Go 协议表只提取精确 Chat URL，不按模型品牌猜协议', () => {
    const markdown = '| 模型 | ID | Endpoint | SDK |\n' +
        '| MiMo | mimo-v2.6-flash | `' + models.chatUrl + '` | compatible |\n' +
        '| MiniMax | minimax-m3 | `https://opencode.ai/inference/go/anthropic/v1/messages` | anthropic |\n';
    assert.deepEqual(parseGoChatModels(markdown), ['mimo-v2.6-flash']);
    assert.throws(() => parseGoChatModels('<html>Unexpected</html>'));
});

test('只读检查：异常 JSON 和空列表不得误报通过', () => {
    for (const value of [null, {}, { object: 'list', data: [] }, { object: 'list', data: [{}] }]) {
        assert.throws(() => compareUpstream(value, snapshot.documentedChatIds));
    }
});
