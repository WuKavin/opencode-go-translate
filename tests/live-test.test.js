'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { observePayload } = require('../scripts/live-test.js');

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
