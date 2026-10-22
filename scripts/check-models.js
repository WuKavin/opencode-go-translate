'use strict';

// 仅 GET 公开资料，不读取 Key、不调用推理、不改写菜单。上游差异必须人工复核协议。
const models = require('../src/lib/models.js');
const info = require('../src/info.json');
const pkg = require('../package.json');
const snapshot = require('../tests/fixtures/go-models-2026-10-22.json');

function checkLocal(metadata = info) {
    const option = metadata.options.find((entry) => entry.identifier === 'model');
    if (!option || JSON.stringify(option.menuValues) !== JSON.stringify(models.menuValues)) {
        throw new Error('info.json 模型菜单与 models.js 不一致，请更新菜单后再打包。');
    }
    if (option.defaultValue !== models.defaultModel || metadata.version !== pkg.version) {
        throw new Error('默认模型或插件版本不同步。');
    }
    if (new Set(models.ids).size !== models.ids.length || !models.ids.includes(models.defaultModel)) {
        throw new Error('模型目录存在重复 ID 或默认模型不在目录内。');
    }
}

function parseGoChatModels(markdown) {
    const ids = [];
    for (const line of markdown.split('\n')) {
        const cells = line.split('|').map((cell) => cell.trim().replace(/`/g, ''));
        if (cells[3] === models.chatUrl && /^[a-z0-9.-]+$/.test(cells[2])) ids.push(cells[2]);
    }
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
        throw new Error('官方 Go endpoint 表无法解析或含重复模型；需人工检查文档/端点变更。');
    }
    return ids;
}

function compareUpstream(payload, documentedChatIds) {
    if (!payload || payload.object !== 'list' || !Array.isArray(payload.data) ||
        payload.data.length === 0 || payload.data.some((model) => !model || typeof model.id !== 'string')) {
        throw new Error('线上模型列表格式异常。');
    }
    const live = payload.data.map((model) => model.id);
    const difference = (left, right) => left.filter((id) => !right.includes(id));
    const changes = {
        menuMissingOnline: difference(models.ids, live),
        menuWithoutChatMapping: difference(models.ids, documentedChatIds),
        upstreamAdded: difference(live, snapshot.observedIds),
        upstreamRemoved: difference(snapshot.observedIds, live),
        chatMappingAdded: difference(documentedChatIds, snapshot.documentedChatIds),
        chatMappingRemoved: difference(snapshot.documentedChatIds, documentedChatIds)
    };
    return { changes, changed: Object.values(changes).some((list) => list.length > 0) };
}

async function readPublic(url, accept) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(url, {
            headers: {
                Accept: accept,
                'User-Agent': 'Bob-OpenCode-Go-Translate-ModelCheck/' + info.version
            },
            signal: controller.signal,
            redirect: 'error'
        });
        if (!response.ok) throw new Error('公开资料请求失败：HTTP ' + response.status);
        return accept === 'application/json' ? await response.json() : await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    checkLocal();
    if (process.argv.includes('--local')) {
        console.log('模型菜单、默认值与版本一致：' + models.ids.length + ' 个模型。');
        return;
    }
    const [payload, markdown] = await Promise.all([
        readPublic(models.modelsUrl, 'application/json'),
        readPublic(snapshot.docsUrl, 'text/markdown')
    ]);
    const result = compareUpstream(payload, parseGoChatModels(markdown));
    console.log('只读核对结果（非官方完整模型目录；不代表 Key 鉴权或真实翻译成功）：');
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), menuCount: models.ids.length, ...result }, null, 2));
    if (result.changed) {
        console.error('检测到上游变化，请人工核对协议及菜单；未自动修改任何文件。');
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch(() => {
        console.error('模型检查失败（网络、响应格式或目录一致性异常），请检查公开端点与文档。');
        process.exitCode = 1;
    });
}

module.exports = { checkLocal, parseGoChatModels, compareUpstream };
