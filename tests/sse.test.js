'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createSSEParser } = require('../src/lib/sse.js');

function framesData(frames) {
    return frames.map((f) => f.data);
}

function feedAll(parser, chunks) {
    const out = [];
    for (const c of chunks) {
        out.push(...parser.feed(c));
    }
    return out;
}

test('SSE：单事件单 data 行（LF）', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"a":1}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}']);
    assert.deepEqual(p.end(), { frames: [], incomplete: false });
});

test('SSE：CRLF 行结束符', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"a":1}\r\n\r\ndata: {"b":2}\r\n\r\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}', '{"b":2}']);
});

test('SSE：LF 与 CRLF 混合', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"a":1}\r\ndata: {"b":2}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}\n{"b":2}']);
});

test('SSE：一个 JSON 跨多个 chunk', () => {
    const p = createSSEParser();
    const chunks = ['data: {"choices":[{"del', 'ta":{"content":"你"}}]}', '\n\ndata: {"x":1}\n\n'];
    const frames = feedAll(p, chunks);
    assert.deepEqual(framesData(frames), ['{"choices":[{"delta":{"content":"你"}}]}', '{"x":1}']);
});

test('SSE：任意 chunk 边界（逐字符）', () => {
    const p = createSSEParser();
    const source = 'data: {"a":1}\n\ndata: [DONE]\n\n';
    const frames = feedAll(p, source.split(''));
    assert.deepEqual(framesData(frames), ['{"a":1}', '[DONE]']);
    assert.deepEqual(p.end(), { frames: [], incomplete: false });
});

test('SSE：随机 chunk 切分结果一致（fuzz）', () => {
    const source =
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n' +
        ': ping\n' +
        'event: add\n' +
        'data: {"choices":[{"delta":{"content":"B"}}]}\n' +
        'data: {"choices":[{"delta":{"content":"C"}}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

    const expected = [
        '{"choices":[{"delta":{"content":"A"}}]}',
        '{"choices":[{"delta":{"content":"B"}}]}\n{"choices":[{"delta":{"content":"C"}}]}',
        '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '[DONE]'
    ];

    for (let trial = 0; trial < 50; trial++) {
        const p = createSSEParser();
        const chunks = [];
        let i = 0;
        while (i < source.length) {
            const size = 1 + Math.floor(Math.random() * 7);
            chunks.push(source.slice(i, i + size));
            i += size;
        }
        const frames = feedAll(p, chunks);
        const tail = p.end();
        const all = frames.concat(tail.frames);
        assert.deepEqual(framesData(all), expected, `trial=${trial}`);
        assert.equal(tail.incomplete, false);
    }
});

test('SSE：注释行被忽略且不影响分帧', () => {
    const p = createSSEParser();
    const frames = feedAll(p, [': keep-alive\n\n', ': ping\ndata: {"a":1}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}']);
});

test('SSE：event 字段解析；无 data 的帧不输出', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['event: add\n\nevent: patch\ndata: {"a":1}\n\n']);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].event, 'patch');
    assert.equal(frames[0].data, '{"a":1}');
});

test('SSE：单帧多个 data 行以 \\n 连接', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: line1\ndata: line2\n\n']);
    assert.deepEqual(framesData(frames), ['line1\nline2']);
});

test('SSE：data: 后无空格也兼容', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data:{"a":1}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}']);
});

test('SSE：多空行不产生空帧', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"a":1}\n\n\n\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}']);
});

test('SSE：BOM 只在首个 chunk 处理', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['\uFEFFdata: {"a":1}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}']);
});

test('SSE：\\r 结尾跨 chunk 不误分帧', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"a":1}\r', '\n\ndata: {"b":1}\n\n']);
    assert.deepEqual(framesData(frames), ['{"a":1}', '{"b":1}']);
});

test('SSE：EOF 完整帧无空行结尾 → dispatch 且不算半帧', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: [DONE]\n']);
    assert.deepEqual(frames, []);
    const tail = p.end();
    assert.deepEqual(framesData(tail.frames), ['[DONE]']);
    assert.equal(tail.incomplete, false);
});

test('SSE：EOF 半帧（JSON 被截断）→ incomplete 标记', () => {
    const p = createSSEParser();
    const frames = feedAll(p, ['data: {"choices":[{"de']);
    assert.deepEqual(frames, []);
    const tail = p.end();
    assert.equal(tail.incomplete, true);
    assert.deepEqual(framesData(tail.frames), ['{"choices":[{"de']);
});

test('SSE：EOF 时残留缓冲区为空 → incomplete false', () => {
    const p = createSSEParser();
    feedAll(p, ['data: {"a":1}\n\n']);
    const tail = p.end();
    assert.deepEqual(tail, { frames: [], incomplete: false });
});

test('SSE：流式聊天响应端到端样例（OpenAI 格式）', () => {
    const p = createSSEParser();
    const lines = [
        'data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
        '',
        'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}',
        '',
        'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"，世界"},"finish_reason":null}]}',
        '',
        'data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        ''
    ];
    const source = lines.map((l) => l + '\n').join('\n');
    const frames = feedAll(p, [source]);
    const contents = [];
    let finishReason = null;
    let done = false;
    for (const f of frames) {
        if (f.data === '[DONE]') {
            done = true;
            continue;
        }
        const obj = JSON.parse(f.data);
        if (obj.choices && obj.choices[0]) {
            const d = obj.choices[0].delta;
            if (d && typeof d.content === 'string') contents.push(d.content);
            if (obj.choices[0].finish_reason) finishReason = obj.choices[0].finish_reason;
        }
    }
    assert.equal(contents.join(''), '你好，世界');
    assert.equal(finishReason, 'stop');
    assert.equal(done, true);
    assert.deepEqual(p.end(), { frames: [], incomplete: false });
});
