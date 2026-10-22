'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { observePayload, observeOnce, scenarios } = require('../scripts/live-test.js');

test('Live Test：无 Key 时立即失败，不尝试付费请求', () => {
    const result = spawnSync(process.execPath, ['scripts/live-test.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, OPENCODE_GO_API_KEY: '' },
        encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /未发送任何请求/);
});

test('Live Test：观测原始响应的 reasoning 与完成标志，不把 reasoning 拼入译文', () => {
    const record = { reasoningObserved: false, finishReason: null };
    const text = observePayload({ choices: [{
        delta: { content: '译文', reasoning_content: '不输出或落盘的模拟推理' }, finish_reason: 'stop'
    }] }, record);
    assert.equal(text, '译文');
    assert.equal(record.reasoningObserved, true);
    assert.equal(record.finishReason, 'stop');
    assert.ok(!JSON.stringify(record).includes('模拟推理'));
});

test('Live Test：非流式数组文本与 length 完成原因如实记录', () => {
    const record = { reasoningObserved: false };
    assert.equal(observePayload({ choices: [{
        message: { content: [{ type: 'text', text: '部分译文' }] }, finish_reason: 'length'
    }] }, record), '部分译文');
    assert.equal(record.finishReason, 'length');
    assert.equal(record.reasoningObserved, false);
});

test('Live Test：usage 帧不伪造译文或完成标志', () => {
    const record = { reasoningObserved: false, finishReason: null };
    assert.equal(observePayload({ choices: [] }, record), '');
    assert.equal(record.finishReason, null);
});

test('Live Test：A/B 明确限定两次流式请求，默认测试仍为 10 次', () => {
    assert.deepEqual(scenarios(true), [
        { stream: true, reasoningMode: 'model_default', runs: 1 },
        { stream: true, reasoningMode: 'disabled', runs: 1 }
    ]);
    assert.equal(scenarios(false).reduce((sum, entry) => sum + entry.runs, 0), 10);
});

test('Live Test：两种参数都传给同一固定端点，未隐藏实际 reasoning 观测', async () => {
    for (const mode of ['model_default', 'disabled']) {
        let calls = 0;
        const record = await observeOnce('test-placeholder', 'bob-test:12345678', false, mode, async (url, opts) => {
            calls += 1;
            assert.equal(url, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
            const body = JSON.parse(opts.body);
            assert.equal('reasoning_effort' in body, mode === 'disabled');
            if (mode === 'disabled') assert.equal(body.reasoning_effort, 'none');
            assert.ok(!('thinking' in body));
            return new Response(JSON.stringify({ choices: [{ message: {
                content: '译文', reasoning_content: '模拟推理'
            }, finish_reason: 'stop' }] }), { status: 200 });
        });
        assert.equal(calls, 1);
        assert.equal(record.reasoningMode, mode);
        assert.equal(record.httpStatus, 200);
        assert.equal(record.reasoningObserved, true);
        assert.equal(record.nonEmptyTranslation, true);
        assert.equal(record.normalCompletion, true);
        assert.equal(record.ttftMs, null);
        assert.ok(!JSON.stringify(record).includes('模拟推理'));
        assert.ok(!JSON.stringify(record).includes('test-placeholder'));
    }
});

test('Live Test：实验参数 400 不重试、不伪造完成状态', async () => {
    let calls = 0;
    const record = await observeOnce('test-placeholder', 'bob-test:12345678', true, 'disabled', async () => {
        calls += 1;
        return new Response('rejected', { status: 400 });
    });
    assert.equal(calls, 1);
    assert.equal(record.httpStatus, 400);
    assert.equal(record.error, 'http');
    assert.equal(record.normalCompletion, false);
});
