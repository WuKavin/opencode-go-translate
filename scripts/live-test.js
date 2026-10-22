'use strict';

// 显式运行才发送付费请求；Key 仅从环境变量读取，不输出原文、译文或服务端错误正文。
const fs = require('node:fs');
const path = require('node:path');
const info = require('../src/info.json');
const models = require('../src/lib/models.js');
const request = require('../src/lib/request.js');
const { generateSessionId } = require('../src/lib/session.js');
const { createSSEParser } = require('../src/lib/sse.js');

function observePayload(payload, record) {
    const choice = payload && payload.choices && payload.choices[0];
    if (!choice) return '';
    const message = choice.delta || choice.message || {};
    for (const key of ['reasoning_content', 'reasoning', 'reasoning_delta']) {
        if (message[key]) record.reasoningObserved = true;
    }
    if (choice.finish_reason) record.finishReason = choice.finish_reason;
    const text = request.extractMessageContent(message.content);
    return typeof text === 'string' ? text : '';
}

async function observeOnce(apiKey, sessionId, stream, reasoningMode = 'model_default', send = fetch) {
    const startedAt = Date.now();
    const record = {
        stream, reasoningMode, httpStatus: null, ttftMs: null,
        totalMs: null, reasoningObserved: false, finishReason: null,
        doneMarker: false, nonEmptyTranslation: false, normalCompletion: false, error: null
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let text = '';
    try {
        const response = await send(models.chatUrl, {
            method: 'POST',
            headers: request.buildHeaders(apiKey, sessionId, info.version, stream ? 'text/event-stream' : 'application/json'),
            body: JSON.stringify(request.buildRequestBody(models.defaultModel, 'English', 'Simplified Chinese',
                'The quick brown fox jumps over the lazy dog.\n\nIt costs $20 to renew the license.',
                stream ? 'enabled' : 'disabled', reasoningMode)),
            redirect: 'error', signal: controller.signal
        });
        record.httpStatus = response.status;
        if (!response.ok) {
            record.error = 'http';
            await response.body.cancel();
        } else if (!stream) {
            const payload = await response.json();
            const parsed = request.parseNonStreamResponse(payload);
            observePayload(payload, record);
            if (parsed.error) record.error = 'api';
            else text = parsed.text;
            // 非流式首 token 时间不可从完整 HTTP 响应测得，保持 null。
            record.normalCompletion = record.finishReason === 'stop';
        } else {
            const parser = createSSEParser();
            const decoder = new TextDecoder('utf-8', { fatal: true });
            function frames(events) {
                for (const frame of events) {
                    if (frame.data === '[DONE]') record.doneMarker = true;
                    else {
                        const payload = JSON.parse(frame.data);
                        if (payload.error) throw new Error('api');
                        const delta = observePayload(payload, record);
                        if (delta && record.ttftMs === null) record.ttftMs = Date.now() - startedAt;
                        text += delta;
                    }
                }
            }
            for await (const chunk of response.body) frames(parser.feed(decoder.decode(chunk, { stream: true })));
            frames(parser.feed(decoder.decode()));
            const tail = parser.end();
            frames(tail.frames);
            record.normalCompletion = !tail.incomplete &&
                (!record.finishReason || record.finishReason === 'stop') &&
                (record.doneMarker || record.finishReason === 'stop');
            if (!record.normalCompletion) record.error = 'incomplete';
        }
        record.nonEmptyTranslation = text.trim().length > 0;
        if (!record.error && !record.nonEmptyTranslation) record.error = 'empty';
    } catch (error) {
        record.error = controller.signal.aborted ? 'timeout' : 'network-or-response';
    } finally {
        clearTimeout(timeout);
        record.totalMs = Date.now() - startedAt;
    }
    return record;
}

function scenarios(ab) {
    return ab
        ? [{ stream: true, reasoningMode: 'model_default', runs: 1 }, { stream: true, reasoningMode: 'disabled', runs: 1 }]
        : [{ stream: true, reasoningMode: 'model_default', runs: 5 }, { stream: false, reasoningMode: 'model_default', runs: 5 }];
}

async function main() {
    const apiKey = (process.env.OPENCODE_GO_API_KEY || '').trim();
    if (!apiKey) {
        console.error('未检测到 OPENCODE_GO_API_KEY，未发送任何请求。请在本地安全配置环境变量后运行 npm run live:test。');
        process.exitCode = 1;
        return;
    }
    const rows = [];
    const sessionId = generateSessionId();
    const ab = process.argv.includes('--ab');
    console.log('付费 API 测试：' + models.defaultModel + (ab ? '，流式 model_default / disabled 各 1 次（共 2 次）。' : '，model_default，流式/非流式各 5 次。'));
    console.log('disabled 仅是实验性请求，不保证生效或提速；此测试不替代 Bob 实机验收。');
    for (const scenario of scenarios(ab)) {
        for (let run = 1; run <= scenario.runs; run++) {
            const record = await observeOnce(apiKey, sessionId, scenario.stream, scenario.reasoningMode);
            rows.push({ run, ...record });
            console.log(JSON.stringify({ run, ...record }));
            await new Promise((resolve) => setTimeout(resolve, 1200));
        }
    }
    const output = path.join(__dirname, '..', 'dist', ab ? 'live-ab-results.json' : 'live-test-results.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({
        timestamp: new Date().toISOString(), version: info.version, model: models.defaultModel,
        endpoint: models.chatUrl, quality: '译文完整性与质量仍需人工验收；非空不代表语义完整。', results: rows
    }, null, 2));
    console.log('脱敏结果已写入：' + output);
    console.log('未观测到 reasoning 字段不代表服务端完全关闭内部思考。');
    if (rows.some((row) => row.error || !row.normalCompletion)) process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
    console.error('Live Test 执行失败，未输出敏感错误详情。');
    process.exitCode = 1;
});

module.exports = { observePayload, observeOnce, scenarios };
