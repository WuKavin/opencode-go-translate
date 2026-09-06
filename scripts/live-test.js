'use strict';

/**
 * Live Test（RDP 17.3）：
 * - 仅从环境变量 OPENCODE_GO_API_KEY 读取 Key，禁止写入源码或仓库；
 * - 使用 deepseek-v4-flash 测试 reasoningMode=disabled / model_default × 流式 / 非流式，各 5 次；
 * - 记录 HTTP 状态、TTFT、总时长、是否出现 reasoning_content、译文是否完整、完成标志；
 * - 结果只描述观测，不据此宣称服务端完全关闭内部思考。
 *
 * 运行：OPENCODE_GO_API_KEY=sk-xxx npm run live:test
 */

const fs = require('node:fs');
const path = require('node:path');
const { createFileStore, createLog, createTransportHttp, installEnv, clearEnv, translateOnce } = require('../tests/helpers/mock-bob.js');

const API_KEY = process.env.OPENCODE_GO_API_KEY;
const MODEL = 'deepseek-v4-flash';
const RUNS_PER_SCENARIO = 5;

if (!API_KEY) {
    console.error('未检测到环境变量 OPENCODE_GO_API_KEY，跳过 Live Test。');
    console.error('用法：OPENCODE_GO_API_KEY=sk-xxx npm run live:test');
    process.exit(1);
}

// 直连真实 API：targetBase 为 null 时 createTransportHttp 不改写 URL
const transport = createTransportHttp({ targetBase: null, capture: () => {} });
const log = createLog();
installEnv({
    option: {
        apiKey: API_KEY,
        model: MODEL,
        reasoningMode: 'model_default',
        stream: 'enabled',
        requestTimeout: '120',
        sessionId: ''
    },
    http: transport,
    file: createFileStore(),
    log
});

const QUERY = {
    text: 'The quick brown fox jumps over the lazy dog.\n\nIt costs $20 to renew the license.',
    from: 'auto',
    to: 'zh-Hans',
    detectFrom: 'en',
    detectTo: 'zh-Hans'
};

function observeOnce(stream) {
    return new Promise((resolve) => {
        const record = { ttftMs: null, reasoningSeen: false, streamChars: 0, done: false };
        const startedAt = Date.now();
        const q = {
            ...QUERY,
            onStream: (r) => {
                if (record.ttftMs === null) {
                    record.ttftMs = Date.now() - startedAt;
                }
                record.streamChars = r.result.toParagraphs[0].length;
            },
            onCompletion: (payload) => {
                record.totalMs = Date.now() - startedAt;
                record.done = true;
                record.payload = payload;
                resolve(record);
            }
        };
        if (!stream) {
            record.streamChars = undefined;
        }
        const rawStream = global.$option.stream;
        global.$option.stream = stream ? 'enabled' : 'disabled';
        require('../src/main.js').translate(q, () => {});
        global.$option.stream = rawStream;
    });
}

function assess(record) {
    const p = record.payload || {};
    if (p.error) {
        return { status: 'error', type: p.error.type, message: p.error.message.slice(0, 120), complete: false };
    }
    const text = p.result ? p.result.toParagraphs[0] : '';
    return {
        status: 'ok',
        from: p.result.from,
        to: p.result.to,
        chars: text.length,
        complete: text.includes('狐狸') || text.length > 0, // 观测口径：译文非空
        payloadJson: JSON.stringify(p)
    };
}

async function runScenario(name, stream, reasoningMode) {
    const rows = [];
    for (let i = 1; i <= RUNS_PER_SCENARIO; i++) {
        global.$option.reasoningMode = reasoningMode;
        const record = await observeOnce(stream);
        const a = assess(record);
        const payloadJson = a.payloadJson || '';
        const row = {
            scenario: name,
            run: i,
            httpOrCallback: record.done ? 'completed' : 'no-callback',
            ttftMs: stream ? record.ttftMs : '-',
            totalMs: record.totalMs,
            outcome: a.status,
            errorType: a.type || '',
            reasoningSeen: payloadJson.includes('reasoning_content') || record.reasoningSeen,
            complete: a.complete ? 'yes' : 'no',
            note: a.message || ''
        };
        rows.push(row);
        console.log(
            `[${name}] #${i} total=${row.totalMs}ms ttft=${row.ttftMs} outcome=${row.outcome}` +
            ` reasoning_content=${row.reasoningSeen} complete=${row.complete}` +
            (row.note ? ` note=${row.note}` : '')
        );
        await new Promise((r) => setTimeout(r, 1200)); // 请求间隔，避免瞬时高流量
    }
    return rows;
}

(async () => {
    console.log(`Live Test 开始：model=${MODEL}，每个场景 ${RUNS_PER_SCENARIO} 次`);
    const all = [];
    all.push(...await runScenario('stream+model_default', true, 'model_default'));
    all.push(...await runScenario('stream+disabled', true, 'disabled'));
    all.push(...await runScenario('nonstream+model_default', false, 'model_default'));
    all.push(...await runScenario('nonstream+disabled', false, 'disabled'));
    clearEnv();

    const summary = {
        model: MODEL,
        timestamp: new Date().toISOString(),
        runsPerScenario: RUNS_PER_SCENARIO,
        results: all.map(({ payloadJson, ...rest }) => rest)
    };
    const distDir = path.join(__dirname, '..', 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    const outFile = path.join(distDir, 'live-test-results.json');
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

    const okCount = all.filter((r) => r.outcome === 'ok').length;
    const reasoningCount = all.filter((r) => r.reasoningSeen).length;
    console.log(`\n汇总：${okCount}/${all.length} 成功；出现 reasoning_content 的请求：${reasoningCount}/${all.length}`);
    console.log(`已写入脱敏结果：${outFile}`);
    console.log('注意：以上仅为观测结果，不据此宣称服务端完全关闭内部思考。');
    process.exit(0);
})();
