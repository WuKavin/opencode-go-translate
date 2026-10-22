'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
    createSignal,
    createFileStore,
    createFileStoreBrokenWrite,
    createData,
    createLog,
    createScriptedHttp,
    installEnv,
    clearEnv,
    translateOnce
} = require('./helpers/mock-bob.js');

function defaultOption(overrides) {
    return {
        apiKey: 'sk-live-test-key-9876543210abcdef',
        model: 'deepseek-v4.1-flash',
        reasoningMode: 'model_default',
        stream: 'enabled',
        requestTimeout: '60',
        sessionId: '',
        ...overrides
    };
}

function setup(optionOverrides, httpHandler, fileStore) {
    const option = defaultOption(optionOverrides);
    const log = createLog();
    const http = createScriptedHttp(httpHandler || (() => {}));
    const file = fileStore || createFileStore();
    installEnv({ option, http, file, log });
    return { option, log, http, file };
}

const QUERY = { text: 'hello world', from: 'auto', to: 'zh-Hans', detectFrom: 'en', detectTo: 'zh-Hans' };

function sseChunks(deltas, finishReason) {
    const chunks = deltas.map((c) => `data: {"choices":[{"index":0,"delta":{"content":${JSON.stringify(c)}},"finish_reason":null}]}\n\n`);
    if (finishReason) {
        chunks.push(`data: {"choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}]}\n\n`);
    }
    chunks.push('data: [DONE]\n\n');
    return chunks;
}

function deliverStream(opts, chunks) {
    for (const c of chunks) {
        opts.streamHandler({ text: c, rawData: { toUTF8: () => c } });
    }
    opts.handler({ response: { statusCode: 200 } });
}

test('translate：未配置 API Key → secretKey，且不发起 HTTP 请求', async () => {
    const env = setup({ apiKey: '' });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'secretKey');
    assert.equal(env.http.calls.length, 0);
    clearEnv();
});

test('translate / pluginValidate：旧 Flash 提示迁移，不请求 API、不自动回放', async () => {
    const env = setup({ model: 'deepseek-v4-flash' });
    try {
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'param');
        assert.match(result.error.message, /V4\.1 Flash/);
        let validation;
        require('../src/main.js').pluginValidate((value) => { validation = value; });
        assert.equal(validation.result, false);
        assert.equal(validation.error.type, 'param');
        assert.equal(env.http.calls.length, 0);
    } finally {
        clearEnv();
    }
});

test('translate：V4.1 disabled 明确拒绝，不能发出未经确认参数', async () => {
    const env = setup({ reasoningMode: 'disabled' });
    try {
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'param');
        assert.match(result.error.message, /模型默认行为/);
        assert.equal(env.http.calls.length, 0);
    } finally {
        clearEnv();
    }
});

for (const model of ['deepseek-v4.1-flash', 'mimo-v2.6-flash', 'mimo-v2.6-pro', 'step-5-preview']) {
    for (const stream of ['enabled', 'disabled']) {
        test('translate：更新模型与新端点 ' + model + ' / ' + stream, async () => {
            const env = setup({ model, stream }, (opts, isStream) => {
                assert.equal(opts.url, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
                assert.equal(opts.body.model, model);
                assert.equal(opts.body.stream, stream === 'enabled');
                assert.ok(!('reasoning_effort' in opts.body));
                if (isStream) deliverStream(opts, sseChunks(['译文'], 'stop'));
                else opts.handler({ data: { choices: [{ message: { content: '译文' } }] }, response: { statusCode: 200 } });
            });
            try {
                const result = await translateOnce(QUERY);
                assert.deepEqual(result.result.toParagraphs, ['译文']);
                assert.equal(env.http.calls.length, 1);
            } finally {
                clearEnv();
            }
        });
    }
}

test('translate：disabled + 非 DeepSeek 模型 → param', async () => {
    setup({ model: 'glm-5.3-flash', reasoningMode: 'disabled' });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'param');
    assert.ok(result.error.message.includes('DeepSeek'));
    clearEnv();
});

test('translate：自定义 sessionId 非法 → param', async () => {
    setup({ sessionId: '非法 ID!' });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'param');
    clearEnv();
});

test('translate：同语种原样返回，不调用 API，不隐式润色', async () => {
    const env = setup();
    const result = await translateOnce({
        text: '原样文本 with **markdown**',
        from: 'zh-Hans',
        to: 'zh-Hans',
        detectFrom: 'zh-Hans',
        detectTo: 'zh-Hans'
    });
    assert.deepEqual(result.result, {
        from: 'zh-Hans',
        to: 'zh-Hans',
        toParagraphs: ['原样文本 with **markdown**']
    });
    assert.equal(env.http.calls.length, 0);
    clearEnv();
});

test('translate：auto 语言解析，结果 from/to 使用 Bob 语言代码', async () => {
    const seen = [];
    setup({}, (opts) => {
        seen.push(opts);
        deliverStream(opts, sseChunks(['译文'], 'stop'));
    });

    const result = await translateOnce({ text: 'hello', from: 'auto', to: 'auto', detectFrom: 'en', detectTo: 'zh-Hans' });
    assert.equal(result.result.from, 'en');
    assert.equal(result.result.to, 'zh-Hans');
    assert.ok(seen[0].body.messages[1].content.includes('Source language: English'));
    assert.ok(seen[0].body.messages[1].content.includes('Target language: Simplified Chinese'));
    clearEnv();
});

test('translate：非流式成功，reasoning_content 不混入', async () => {
    const seen = [];
    setup({ stream: 'disabled' }, (opts) => {
        seen.push(opts);
        opts.handler({
            data: {
                choices: [
                    { message: { role: 'assistant', content: '你好，世界', reasoning_content: 'thinking...' } }
                ]
            },
            response: { statusCode: 200 }
        });
    });

    const result = await translateOnce({ text: 'hello world', from: 'en', to: 'zh-Hans' });
    assert.deepEqual(result.result.toParagraphs, ['你好，世界']);
    assert.ok(!JSON.stringify(result).includes('thinking...'));

    const call = seen[0];
    assert.equal(call.body.stream, false);
    assert.equal(call.header.Accept, 'application/json');
    clearEnv();
});

// P2 回归：非流式请求也必须把 cancelSignal 传给 $http.request，取消时终止底层请求
test('translate：非流式请求携带 cancelSignal（与流式一致）', async () => {
    const signal = createSignal();
    const seen = [];
    setup({ stream: 'disabled' }, (opts) => {
        seen.push(opts);
        opts.handler({
            data: { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
            response: { statusCode: 200 }
        });
    });

    await translateOnce({ ...QUERY, cancelSignal: signal });
    assert.equal(seen[0].cancelSignal, signal);
    clearEnv();
});

test('translate：流式成功，onStream 累计文本，最终结果完整', async () => {
    const streams = [];
    setup({}, (opts, isStream) => {
        assert.equal(isStream, true);
        deliverStream(opts, sseChunks(['你好', '，世', '界'], 'stop'));
    });

    const result = await translateOnce(QUERY, {
        onStream: (r) => streams.push(r.result.toParagraphs[0])
    });
    assert.deepEqual(streams, ['你好', '你好，世', '你好，世界']);
    assert.deepEqual(result.result.toParagraphs, ['你好，世界']);
    assert.equal(result.result.from, 'en');
    assert.equal(result.result.to, 'zh-Hans');
    clearEnv();
});

test('translate：SSE 单帧 JSON 跨多个 chunk 不丢字', async () => {
    setup({}, (opts) => {
        const part1 = 'data: {"choices":[{"index":0,"delta":{"content":"你';
        const part2 = '好"}}],"finish_reason":null}\n\ndata: [DONE]\n\n';
        opts.streamHandler({ text: part1, rawData: { toUTF8: () => part1 } });
        opts.streamHandler({ text: part2, rawData: { toUTF8: () => part2 } });
        opts.handler({ response: { statusCode: 200 } });
    });

    const result = await translateOnce(QUERY);
    assert.deepEqual(result.result.toParagraphs, ['你好']);
    clearEnv();
});

test('translate：流式请求 headers 正确（session 稳定、UA 正确）', async () => {
    const seen = [];
    setup({}, (opts) => {
        seen.push(opts);
        deliverStream(opts, sseChunks(['x'], 'stop'));
    });

    await translateOnce(QUERY);
    await translateOnce(QUERY);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].header['x-opencode-session'], seen[1].header['x-opencode-session']);
    assert.match(seen[0].header['x-opencode-session'], /^[A-Za-z0-9._:-]{8,128}$/);
    assert.equal(seen[0].header['User-Agent'], 'Bob-OpenCode-Go-Translate/' + require('../src/info.json').version + ' (Bob Plugin; macOS)');
    assert.equal(seen[0].header.Authorization, 'Bearer ' + defaultOption().apiKey);
    assert.equal(seen[0].header.Accept, 'text/event-stream');
    assert.equal(seen[0].url, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
    clearEnv();
});

test('translate：session 持久化到沙盒且跨进程复用', async () => {
    const file = createFileStore();
    const data = createData();

    // 第一次翻译：生成 session 并写入沙盒
    const seen1 = [];
    const log1 = createLog();
    installEnv({
        option: defaultOption(),
        http: createScriptedHttp((opts) => {
            seen1.push(opts);
            deliverStream(opts, sseChunks(['a'], 'stop'));
        }),
        file,
        log: log1
    });
    global.$data = data;
    await translateOnce(QUERY);
    clearEnv();
    assert.ok(seen1[0].header['x-opencode-session']);

    // 模拟 Bob 重启：全新进程，读同一沙盒
    const seen2 = [];
    installEnv({
        option: defaultOption(),
        http: createScriptedHttp((opts) => {
            seen2.push(opts);
            deliverStream(opts, sseChunks(['b'], 'stop'));
        }),
        file,
        log: createLog()
    });
    global.$data = data;
    await translateOnce(QUERY);
    clearEnv();

    assert.equal(seen2[0].header['x-opencode-session'], seen1[0].header['x-opencode-session']);
});

test('translate：沙盒写入失败仍正常翻译（内存 fallback）', async () => {
    const file = createFileStoreBrokenWrite();
    setup({}, (opts) => deliverStream(opts, sseChunks(['ok'], 'stop')), file);
    const result = await translateOnce(QUERY);
    assert.deepEqual(result.result.toParagraphs, ['ok']);
    clearEnv();
});

test('translate：finish_reason length → api 错误提示截断', async () => {
    setup({}, (opts) => deliverStream(opts, sseChunks(['部分译'], 'length')));
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    assert.ok(result.error.message.includes('截断'));
    clearEnv();
});

test('translate：finish_reason content_filter → api 错误', async () => {
    setup({}, (opts) => deliverStream(opts, sseChunks(['x'], 'content_filter')));
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    clearEnv();
});

test('translate：HTTP 2xx 但无完成标志 → api 错误', async () => {
    setup({}, (opts) => {
        opts.streamHandler({ text: 'data: {"choices":[{"delta":{"content":"部分"}}]}\n\n', rawData: { toUTF8: () => '' } });
        opts.handler({ response: { statusCode: 200 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    assert.ok(result.error.message.includes('完成标志'));
    clearEnv();
});

test('translate：流内 error → api 错误', async () => {
    setup({}, (opts) => {
        deliverStream(opts, [
            'data: {"error":{"message":"upstream failure for key Bearer abcdef123456"}}\n\n'
        ]);
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    assert.ok(!result.error.message.includes('abcdef123456'));
    clearEnv();
});

test('translate：EOF 半帧 → api 错误', async () => {
    setup({}, (opts) => {
        opts.streamHandler({ text: 'data: {"choices":[{"de', rawData: { toUTF8: () => '' } });
        opts.handler({ response: { statusCode: 200 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api'); // 无法解析的半帧或异常中断均须返回 api 错误
    clearEnv();
});

test('translate：SSE JSON 解析失败帧 → api 错误', async () => {
    setup({}, (opts) => {
        deliverStream(opts, ['data: not-json\n\n', 'data: [DONE]\n\n']);
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    clearEnv();
});

test('translate：空译文（无内容直接 [DONE]）→ api 错误', async () => {
    setup({}, (opts) => deliverStream(opts, ['data: [DONE]\n\n']));
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    clearEnv();
});

test('translate：401 → secretKey', async () => {
    setup({ stream: 'disabled' }, (opts) => {
        opts.handler({ data: { error: { message: 'unauthorized' } }, response: { statusCode: 401 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'secretKey');
    clearEnv();
});

test('translate：429 → network + 额度提示', async () => {
    setup({ stream: 'disabled' }, (opts) => {
        opts.handler({ data: { error: { message: 'rate limited' } }, response: { statusCode: 429 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'network');
    assert.ok(/额度|限流|频繁/.test(result.error.message));
    clearEnv();
});

test('translate：500 → network', async () => {
    setup({ stream: 'disabled' }, (opts) => {
        opts.handler({ data: 'Internal Server Error', response: { statusCode: 500 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'network');
    clearEnv();
});

test('translate：网络层错误（超时/DNS）→ network', async () => {
    setup({ stream: 'disabled' }, (opts) => {
        opts.handler({ error: { message: 'The request timed out.' } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'network');
    clearEnv();
});

test('translate：非流式响应 JSON 但结构异常 → api', async () => {
    setup({ stream: 'disabled' }, (opts) => {
        opts.handler({ data: { unexpected: true }, response: { statusCode: 200 } });
    });
    const result = await translateOnce(QUERY);
    assert.equal(result.error.type, 'api');
    clearEnv();
});

test('translate：取消后不回调 onCompletion，也不再有 onStream', async () => {
    const signal = createSignal();
    let streamCalls = 0;
    setup({}, (opts) => {
        // 首包后模拟用户取消，然后继续来数据并回调 handler
        opts.streamHandler({ text: sseChunks(['第一部分'])[0], rawData: { toUTF8: () => '' } });
        signal.send();
        opts.streamHandler({ text: sseChunks(['第二部分'])[0], rawData: { toUTF8: () => '' } });
        opts.handler({ response: { statusCode: 200 } });
    });

    let completionCalls = 0;
    const q = {
        ...QUERY,
        cancelSignal: signal,
        onStream: () => {
            streamCalls += 1;
        },
        onCompletion: () => {
            completionCalls += 1;
        }
    };
    require('../src/main.js').translate(q, () => {});
    await new Promise((r) => setTimeout(r, 50)); // 等待所有回调竞态落定

    assert.equal(completionCalls, 0); // 取消后不回调 onCompletion
    assert.equal(streamCalls, 1); // 取消后的数据未触发 onStream
    assert.equal(signal.subscriberCount(), 0); // disposable 已释放
    clearEnv();
});

test('translate：once guard —— handler 多次到达只终结一次', async () => {
    let completions = 0;
    const p = new Promise((resolve) => {
        setup({ stream: 'disabled' }, (opts) => {
            const resp = {
                data: { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
                response: { statusCode: 200 }
            };
            opts.handler(resp);
            opts.handler(resp); // 重复回调
            resolve();
        });
    });
    const q = { ...QUERY, onCompletion: () => completions++ };
    require('../src/main.js').translate(q, () => {});
    await p;
    // 等待一个 tick 让潜在重复回调执行
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(completions, 1);
    clearEnv();
});

test('translate：请求体携带模型与会话，且默认不发送未确认字段', async () => {
    const seen = [];
    setup({ model: 'kimi-k3' }, (opts) => {
        seen.push(opts);
        deliverStream(opts, sseChunks(['好'], 'stop'));
    });
    await translateOnce(QUERY);
    const body = seen[0].body;
    assert.equal(body.model, 'kimi-k3');
    assert.equal(body.stream, true);
    assert.ok(!('reasoning_effort' in body));
    for (const key of ['temperature', 'top_p', 'max_tokens']) {
        assert.ok(!(key in body), key);
    }
    assert.equal(body.messages[0].role, 'system');
    assert.ok(body.messages[1].content.includes('hello world'));
    clearEnv();
});

test('translate：disabled 模式请求体含 reasoning_effort none（仅 DeepSeek V4）', async () => {
    const seen = [];
    setup({ model: 'deepseek-v4-pro', reasoningMode: 'disabled' }, (opts) => {
        seen.push(opts);
        deliverStream(opts, sseChunks(['好'], 'stop'));
    });
    await translateOnce(QUERY);
    assert.equal(seen[0].body.reasoning_effort, 'none');
    clearEnv();
});

test('translate：API Key 不进入日志', async () => {
    const env = setup({ stream: 'disabled' }, (opts) => {
        opts.handler({
            data: { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
            response: { statusCode: 200 }
        });
    });
    await translateOnce(QUERY);
    // 失败场景
    global.$http = createScriptedHttp((opts) => {
        opts.handler({ data: 'oops', response: { statusCode: 503 } });
    });
    await translateOnce(QUERY);
    const allLogs = env.log.lines.join('\n');
    assert.ok(!allLogs.includes(defaultOption().apiKey));
    assert.ok(!allLogs.includes('sk-live-test-key'));
    clearEnv();
});

test('translate：日志只含 session 短指纹，不含完整 session ID', async () => {
    const env = setup({}, (opts) => deliverStream(opts, sseChunks(['好'], 'stop')));
    await translateOnce(QUERY);
    const logs = env.log.lines.join('\n');
    const sessionMatch = logs.match(/session=([a-z0-9]+)/);
    assert.ok(sessionMatch, '日志应包含 session 短指纹');
    assert.ok(sessionMatch[1].length < 12);
    assert.ok(!logs.includes('bob-translate:'));
    clearEnv();
});

test('translate：文本空 → param', async () => {
    setup();
    const result = await translateOnce({ text: '', from: 'en', to: 'zh-Hans' });
    assert.equal(result.error.type, 'param');
    clearEnv();
});

test('pluginTimeoutInterval：requestTimeout + 10', () => {
    const { createLog, installEnv } = require('./helpers/mock-bob.js');
    installEnv({ option: defaultOption({ requestTimeout: '120' }), http: createScriptedHttp(() => {}) });
    assert.equal(require('../src/main.js').pluginTimeoutInterval(), 130);
    installEnv({ option: defaultOption({ requestTimeout: 'bogus' }), http: createScriptedHttp(() => {}) });
    assert.equal(require('../src/main.js').pluginTimeoutInterval(), 70);
    clearEnv();
});

test('pluginValidate：缺 Key → result false + secretKey，不发起请求', async () => {
    let called = 0;
    const http = createScriptedHttp(() => called++);
    installEnv({ option: defaultOption({ apiKey: '' }), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.result, false);
    assert.equal(res.error.type, 'secretKey');
    assert.equal(called, 0);
    clearEnv();
});

test('pluginValidate：两阶段通过（/models + 最小 Chat 鉴权请求）', async () => {
    const seen = [];
    const http = createScriptedHttp((opts) => {
        seen.push(opts);
        if (opts.method === 'GET') {
            opts.handler({
                data: { object: 'list', data: [{ id: 'deepseek-v4.1-flash' }, { id: 'glm-5.3' }] },
                response: { statusCode: 200 }
            });
        } else {
            opts.handler({
                data: { choices: [{ message: { role: 'assistant', content: 'OK' } }] },
                response: { statusCode: 200 }
            });
        }
    });
    installEnv({ option: defaultOption(), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.result, true);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].method, 'GET');
    assert.equal(seen[0].url, 'https://opencode.ai/inference/go/v1/models');
    assert.equal(seen[1].method, 'POST');
    assert.equal(seen[1].url, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
    assert.equal(seen[1].body.model, 'deepseek-v4.1-flash');
    assert.equal(seen[1].body.stream, false);
    assert.ok(!('max_tokens' in seen[1].body));
    assert.equal(seen[1].header['x-opencode-session'], seen[0].header['x-opencode-session']);
    clearEnv();
});

// P1 回归：/models 为公开端点（假 Key 也返回 200），假 Key 必须在第二阶段 Chat 请求被 401 拒绝
test('pluginValidate：假 Key —— /models 通过但 Chat 401 → secretKey', async () => {
    const http = createScriptedHttp((opts) => {
        if (opts.method === 'GET') {
            opts.handler({
                data: { object: 'list', data: [{ id: 'deepseek-v4.1-flash' }] },
                response: { statusCode: 200 }
            });
        } else {
            opts.handler({
                data: { error: { message: 'invalid api key' } },
                response: { statusCode: 401 }
            });
        }
    });
    installEnv({ option: defaultOption(), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.result, false);
    assert.equal(res.error.type, 'secretKey');
    clearEnv();
});

test('pluginValidate：模型不在列表 → param', async () => {
    const http = createScriptedHttp((opts) => {
        opts.handler({
            data: { object: 'list', data: [{ id: 'glm-5.3' }] },
            response: { statusCode: 200 }
        });
    });
    installEnv({ option: defaultOption(), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.result, false);
    assert.equal(res.error.type, 'param');
    clearEnv();
});

test('pluginValidate：响应非 list → api', async () => {
    const http = createScriptedHttp((opts) => {
        opts.handler({ data: { hello: 1 }, response: { statusCode: 200 } });
    });
    installEnv({ option: defaultOption(), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.error.type, 'api');
    clearEnv();
});

test('pluginValidate：401 → secretKey', async () => {
    const http = createScriptedHttp((opts) => {
        opts.handler({ data: {}, response: { statusCode: 401 } });
    });
    installEnv({ option: defaultOption(), http });
    let res;
    require('../src/main.js').pluginValidate((r) => (res = r));
    assert.equal(res.error.type, 'secretKey');
    clearEnv();
});
