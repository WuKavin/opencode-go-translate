'use strict';

const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/lib/config.js');
const errors = require('../src/lib/errors.js');

function baseConfig(overrides) {
    return {
        apiKey: 'sk-test-key-1234567890',
        model: 'deepseek-v4.1-flash',
        reasoningMode: 'model_default',
        stream: 'enabled',
        requestTimeout: 60,
        sessionId: '',
        pluginVersion: '1.0.0',
        ...overrides
    };
}

test('readOptions：未配置时使用默认值', () => {
    const opts = config.readOptions({}, '1.0.0');
    assert.equal(opts.model, 'deepseek-v4.1-flash');
    assert.equal(opts.reasoningMode, 'model_default');
    assert.equal(opts.stream, 'enabled');
    assert.equal(opts.requestTimeout, 60);
    assert.equal(opts.apiKey, '');
    assert.equal(opts.pluginVersion, '1.0.0');
});

test('readOptions：非法菜单值原样透传，由 validateConfig 报 param（不静默忽略）', () => {
    const opts = config.readOptions(
        {
            apiKey: 'sk-test-key-1234567890',
            model: 'gpt-5.6-luna',
            reasoningMode: 'always',
            stream: 'maybe',
            requestTimeout: '999'
        },
        '1.0.0'
    );
    assert.equal(opts.model, 'gpt-5.6-luna');
    assert.equal(opts.reasoningMode, 'always');
    assert.equal(opts.stream, 'maybe');
    assert.equal(opts.requestTimeout, 60);
    const err = config.validateConfig(opts);
    assert.ok(err);
    assert.equal(err.type, 'param');
});

test('readOptions：合法超时值保留', () => {
    assert.equal(config.readOptions({ requestTimeout: '30' }, '1.0.0').requestTimeout, 30);
    assert.equal(config.readOptions({ requestTimeout: '120' }, '1.0.0').requestTimeout, 120);
});

test('readOptions：apiKey 去除首尾空格', () => {
    const opts = config.readOptions({ apiKey: '  sk-abc  ' }, '1.0.0');
    assert.equal(opts.apiKey, 'sk-abc');
});

test('validateConfig：缺少 API Key → secretKey', () => {
    const err = config.validateConfig(baseConfig({ apiKey: '' }));
    assert.ok(err);
    assert.equal(err.type, 'secretKey');
});

test('validateConfig：apiKey 为空白字符串 → secretKey', () => {
    const err = config.validateConfig(baseConfig({ apiKey: '   ' }));
    assert.equal(err.type, 'secretKey');
});

test('validateConfig：Responses 协议模型（gpt/grok/muse）→ param', () => {
    for (const m of ['gpt-5.6-luna', 'grok-4.6', 'muse-spark-1.3-contributor']) {
        const err = config.validateConfig(baseConfig({ model: m }));
        assert.ok(err, m);
        assert.equal(err.type, 'param', m);
    }
});

test('validateConfig：Messages 协议模型（minimax/qwen）→ param', () => {
    for (const m of ['minimax-m3', 'qwen3.8-max']) {
        const err = config.validateConfig(baseConfig({ model: m }));
        assert.equal(err.type, 'param', m);
    }
});

test('validateConfig：Chat Completions 全部 allowlist 模型通过', () => {
    for (const m of config.CHAT_COMPLETIONS_MODELS) {
        const err = config.validateConfig(baseConfig({ model: m }));
        assert.equal(err, null, m);
    }
});

test('validateConfig：disabled 仅保留 DeepSeek V4 Pro，不推断 V4.1 支持', () => {
    assert.equal(config.validateConfig(baseConfig({ reasoningMode: 'disabled', model: 'deepseek-v4.1-flash' })).type, 'param');
    assert.equal(config.validateConfig(baseConfig({ reasoningMode: 'disabled', model: 'deepseek-v4-pro' })), null);
    const err = config.validateConfig(baseConfig({ reasoningMode: 'disabled', model: 'glm-5.3-flash' }));
    assert.ok(err);
    assert.equal(err.type, 'param');
});

test('validateConfig：非 DeepSeek 模型强制 disabled 必须报 param（不得静默忽略）', () => {
    for (const m of config.CHAT_COMPLETIONS_MODELS.filter((x) => !config.isReasoningDisableModel(x))) {
        const err = config.validateConfig(baseConfig({ reasoningMode: 'disabled', model: m }));
        assert.ok(err, m);
        assert.equal(err.type, 'param', m);
    }
});

test('validateConfig：未知 reasoningMode → param', () => {
    const err = config.validateConfig(baseConfig({ reasoningMode: 'turbo' }));
    assert.equal(err.type, 'param');
});

test('validateConfig：未知 stream 值 → param', () => {
    const err = config.validateConfig(baseConfig({ stream: 'auto' }));
    assert.equal(err.type, 'param');
});

test('validateConfig：非法 sessionId → param', () => {
    const err = config.validateConfig(baseConfig(), '短ID');
    assert.ok(err);
    assert.equal(err.type, 'param');
});

test('validateConfig：合法 sessionId 留空均可', () => {
    assert.equal(config.validateConfig(baseConfig(), ''), null);
    assert.equal(config.validateConfig(baseConfig(), 'bob-translate:abc12345'), null);
});

test('isChatCompletionsModel / isReasoningDisableModel', () => {
    assert.equal(config.isChatCompletionsModel('deepseek-v4-flash-vision-exp'), false);
    assert.equal(config.isReasoningDisableModel('deepseek-v4-flash'), false);
    assert.equal(config.isReasoningDisableModel('deepseek-v4.1-flash'), false);
    assert.equal(config.isReasoningDisableModel('deepseek-v4-pro'), true);
    assert.equal(config.isReasoningDisableModel('glm-5.3'), false);
});

test('errors：service error 结构', () => {
    const e = errors.serviceError('api', '测试消息', { code: 1 }, 'https://example.com');
    assert.deepEqual(e, {
        type: 'api',
        message: '测试消息',
        addition: { code: 1 },
        troubleshootingLink: 'https://example.com'
    });
    const e2 = errors.paramError('p');
    assert.deepEqual(e2, { type: 'param', message: 'p' });
});

test('errors：redact 移除 Bearer 与 sk- 密钥样式', () => {
    const out = errors.redact('Authorization: Bearer abc123def456 token=sk-xxxxxxxxxxxx token2=sk-yyy123456789');
    assert.ok(!out.includes('abc123def456'));
    assert.ok(!out.includes('xxxxxxxxxxxx'));
    assert.ok(!out.includes('yyy123456789'));
    assert.ok(out.includes('Bearer ***'));
});

test('errors：redact 保留普通文本', () => {
    assert.equal(errors.redact('访问被拒绝'), '访问被拒绝');
});

test('errors：summarizePayload 截断长摘要并脱敏', () => {
    const longText = 'x'.repeat(500) + ' sk-abcdef1234567890';
    const summary = errors.summarizePayload({ error: { message: longText } });
    assert.ok(summary.length <= 210);
    assert.ok(!summary.includes('sk-abcdef1234567890'));
});

test('errors：summarizePayload 支持字符串与 $data 样式对象', () => {
    assert.equal(errors.summarizePayload('plain'), 'plain');
    const dataLike = { toUTF8: () => 'from data' };
    assert.equal(errors.summarizePayload(dataLike), 'from data');
    assert.equal(errors.summarizePayload(null), '');
});
