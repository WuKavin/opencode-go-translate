'use strict';

/**
 * Mock 集成测试：本地 HTTP Server + Node 传输层模拟的 $http。
 * 验证插件实际发出的请求（Header/Accept/UA/session）与各 HTTP 异常场景。
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
    createSignal,
    createFileStore,
    createLog,
    createTransportHttp,
    installEnv,
    clearEnv,
    translateOnce
} = require('./helpers/mock-bob.js');

const OPENCODE_HOST_PLACEHOLDER = 'https://opencode.ai';

function createMockServer() {
    const requests = [];
    let scenario = 'ok-stream';
    let delayFirstChunkMs = 0;

    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const bodyRaw = Buffer.concat(chunks).toString('utf8');
            let bodyJson = null;
            try {
                bodyJson = JSON.parse(bodyRaw);
            } catch (e) {
                /* ignore */
            }
            requests.push({
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: bodyJson,
                bodyRaw
            });

            if (req.method === 'GET' && req.url.includes('/v1/models')) {
                if (scenario === '401') {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify({
                        object: 'list',
                        data: [{ id: 'deepseek-v4-flash' }, { id: 'glm-5.3-flash' }]
                    })
                );
                return;
            }

            switch (scenario) {
                case '401':
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
                    break;
                case '403':
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'forbidden' } }));
                    break;
                case '429':
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'rate limited' } }));
                    break;
                case '500':
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                    break;
                case 'bad-json':
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<html>not json</html>');
                    break;
                case 'ok-json':
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            choices: [{ message: { role: 'assistant', content: '你好，世界（非流式）' } }]
                        })
                    );
                    break;
                case 'incomplete-sse':
                    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                    res.write('data: {"choices":[{"delta":{"content":"部分译"}}]}\n\n');
                    res.end('data: {"choices":[{"de'); // 半帧 EOF
                    break;
                case 'delayed-stream':
                case 'ok-stream':
                default: {
                    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                    const parts = [
                        'data: {"choices":[{"index":0,"delta":{"content":"你好"}}]}\n\n',
                        'data: {"choices":[{"index":0,"delta":{"content":"，世界"}}]}\n\n',
                        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
                        'data: [DONE]\n\n'
                    ];
                    const writeParts = (i) => {
                        if (i >= parts.length) {
                            res.end();
                            return;
                        }
                        if (i === 0 && delayFirstChunkMs > 0) {
                            setTimeout(() => {
                                res.write(parts[0]);
                                writeParts(1);
                            }, delayFirstChunkMs);
                        } else {
                            res.write(parts[i]);
                            writeParts(i + 1);
                        }
                    };
                    writeParts(0);
                    break;
                }
            }
        });
    });

    return {
        server,
        requests,
        setScenario(s) {
            scenario = s;
        },
        setDelayFirstChunk(ms) {
            delayFirstChunkMs = ms;
        },
        listen() {
            return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        },
        close() {
            return new Promise((resolve) => server.close(resolve));
        },
        base() {
            return 'http://127.0.0.1:' + server.address().port;
        }
    };
}

async function withMock(fn) {
    const mock = createMockServer();
    await mock.listen();
    const capture = [];
    const transport = createTransportHttp({
        targetBase: mock.base(),
        capture: (info) => capture.push(info)
    });
    const log = createLog();
    installEnv({
        option: {
            apiKey: 'sk-mock-integration-key-1234567890',
            model: 'deepseek-v4-flash',
            reasoningMode: 'model_default',
            stream: 'enabled',
            requestTimeout: '60',
            sessionId: ''
        },
        http: transport,
        file: createFileStore(),
        log
    });
    try {
        await fn({ mock, capture, log });
    } finally {
        clearEnv();
        await mock.close();
    }
}

const QUERY = { text: 'hello world', from: 'auto', to: 'zh-Hans', detectFrom: 'en', detectTo: 'zh-Hans' };

test('Mock 集成：流式请求携带 Authorization / x-opencode-session / User-Agent / Accept', async () => {
    await withMock(async ({ mock, capture }) => {
        const result = await translateOnce(QUERY);
        assert.ok(result.result, JSON.stringify(result));
        assert.deepEqual(result.result.toParagraphs, ['你好，世界']);

        const sent = capture[0];
        assert.equal(sent.method, 'POST');
        assert.equal(sent.url, 'https://opencode.ai/zen/go/v1/chat/completions');
        assert.equal(sent.header.Authorization, 'Bearer sk-mock-integration-key-1234567890');
        assert.match(sent.header['x-opencode-session'], /^[A-Za-z0-9._:-]{8,128}$/);
        assert.equal(sent.header['User-Agent'], 'Bob-OpenCode-Go-Translate/1.0.0 (Bob Plugin; macOS)');
        assert.equal(sent.header.Accept, 'text/event-stream');
        assert.equal(sent.header['Content-Type'], 'application/json');

        const received = mock.requests[0];
        assert.equal(received.headers.authorization, 'Bearer sk-mock-integration-key-1234567890');
        assert.equal(received.headers['x-opencode-session'], sent.header['x-opencode-session']);
        assert.equal(received.headers['user-agent'], sent.header['User-Agent']);
        assert.equal(received.headers.accept, 'text/event-stream');
        assert.equal(received.body.model, 'deepseek-v4-flash');
        assert.equal(received.body.stream, true);
    });
});

test('Mock 集成：非流式请求 Accept 为 application/json', async () => {
    await withMock(async ({ mock, capture }) => {
        mock.setScenario('ok-json');
        const option = global.$option;
        option.stream = 'disabled';
        const result = await translateOnce(QUERY);
        assert.ok(result.result, JSON.stringify(result));
        assert.ok(result.result.toParagraphs[0].includes('非流式'));
        assert.equal(capture[0].header.Accept, 'application/json');
        assert.equal(mock.requests[0].headers.accept, 'application/json');
        assert.equal(mock.requests[0].body.stream, false);
    });
});

test('Mock 集成：连续请求 session ID 保持稳定', async () => {
    await withMock(async ({ capture }) => {
        await translateOnce(QUERY);
        await translateOnce(QUERY);
        assert.equal(capture.length, 2);
        assert.equal(capture[0].header['x-opencode-session'], capture[1].header['x-opencode-session']);
    });
});

test('Mock 集成：HTTP 401 → secretKey', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('401');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'secretKey');
    });
});

test('Mock 集成：HTTP 403 → network，仅提示访问被拒绝', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('403');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'network');
        assert.ok(result.error.message.includes('访问被拒绝'));
    });
});

test('Mock 集成：HTTP 429 → network + 额度提示', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('429');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'network');
        assert.ok(/额度|限流|频繁/.test(result.error.message));
    });
});

test('Mock 集成：HTTP 500 → network', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('500');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'network');
        assert.ok(result.error.message.includes('500'));
    });
});

test('Mock 集成：200 非 JSON 响应 → api', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('bad-json');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'api');
    });
});

test('Mock 集成：不完整 SSE（半帧 EOF）→ api', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('incomplete-sse');
        const result = await translateOnce(QUERY);
        assert.equal(result.error.type, 'api');
    });
});

test('Mock 集成：延迟首包不丢数据', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('delayed-stream');
        mock.setDelayFirstChunk(300);
        const result = await translateOnce(QUERY);
        assert.ok(result.result, JSON.stringify(result));
        assert.deepEqual(result.result.toParagraphs, ['你好，世界']);
    });
});

test('Mock 集成：取消后无后续回调，服务端只收到一次请求', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('delayed-stream');
        mock.setDelayFirstChunk(400);
        const signal = createSignal();
        let completionCalls = 0;
        let streamCalls = 0;

        const done = new Promise((resolve) => {
            const q = {
                ...QUERY,
                cancelSignal: signal,
                onStream: () => {
                    streamCalls += 1;
                },
                onCompletion: (payload) => {
                    completionCalls += 1;
                    resolve(payload);
                }
            };
            require('../src/main.js').translate(q, () => {});
        });

        setTimeout(() => signal.send(), 100);
        const payload = await Promise.race([
            done,
            new Promise((r) => setTimeout(() => r('NO-CALLBACK'), 2000))
        ]);

        assert.equal(payload, 'NO-CALLBACK'); // 取消后不回调 onCompletion
        assert.equal(completionCalls, 0);
        await new Promise((r) => setTimeout(r, 200));
        assert.equal(mock.requests.length, 1); // 无自动重试
        assert.equal(streamCalls, 0); // 400ms 延迟首包，取消发生在首包之前
    });
});

test('Mock 集成：pluginValidate 通过并携带相同鉴权头', async () => {
    await withMock(async ({ mock, capture }) => {
        let result;
        require('../src/main.js').pluginValidate((r) => (result = r));
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(result.result, true, JSON.stringify(result));
        const sent = capture[0];
        assert.equal(sent.method, 'GET');
        assert.equal(sent.url, 'https://opencode.ai/zen/go/v1/models');
        assert.ok(sent.header.Authorization.startsWith('Bearer '));
        assert.ok(sent.header['x-opencode-session']);
        assert.ok(sent.header['User-Agent'].includes('Bob-OpenCode-Go-Translate'));
        assert.equal(mock.requests[0].url, '/zen/go/v1/models');
    });
});

test('Mock 集成：验证 401 → secretKey', async () => {
    await withMock(async ({ mock }) => {
        mock.setScenario('401');
        let result;
        require('../src/main.js').pluginValidate((r) => (result = r));
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(result.result, false);
        assert.equal(result.error.type, 'secretKey');
    });
});
