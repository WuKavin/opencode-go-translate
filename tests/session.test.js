'use strict';

const test = require('node:test');
const assert = require('node:assert');
const session = require('../src/lib/session.js');

test('isValidSessionId：合法格式', () => {
    assert.equal(session.isValidSessionId('bob-translate:abc12345'), true);
    assert.equal(session.isValidSessionId('abcdef12'), true);
    assert.equal(session.isValidSessionId('a'.repeat(128)), true);
    assert.equal(session.isValidSessionId('abc_123:def-456.789'), true);
});

test('isValidSessionId：非法格式', () => {
    assert.equal(session.isValidSessionId('short'), false); // <8
    assert.equal(session.isValidSessionId('a'.repeat(129)), false); // >128
    assert.equal(session.isValidSessionId('包含 空格'), false);
    assert.equal(session.isValidSessionId('abc/def'), false);
    assert.equal(session.isValidSessionId('abc@def'), false);
    assert.equal(session.isValidSessionId(123), false);
    assert.equal(session.isValidSessionId(null), false);
});

test('generateSessionId：bob-translate 前缀且合法', () => {
    const id = session.generateSessionId();
    assert.ok(id.startsWith('bob-translate:'));
    assert.equal(session.isValidSessionId(id), true);
    const id2 = session.generateSessionId();
    assert.notEqual(id, id2);
});

test('validateUserSessionId：留空不校验', () => {
    assert.equal(session.validateUserSessionId(''), null);
    assert.equal(session.validateUserSessionId(undefined), null);
});

test('validateUserSessionId：非法返回 param 错误', () => {
    const err = session.validateUserSessionId('bad id!');
    assert.ok(err);
    assert.equal(err.type, 'param');
    assert.equal(session.validateUserSessionId('valid_id_123'), null);
});

test('resolveSessionId：用户填写合法值优先使用且不写沙盒', () => {
    const store = session.createFileAdapter(require('../tests/helpers/mock-bob.js').createFileStore(), null);
    const r = session.resolveSessionId('user-set-id-01', store);
    assert.equal(r.sessionId, 'user-set-id-01');
    assert.equal(r.error, undefined);
});

test('resolveSessionId：用户填写非法值返回错误', () => {
    const r = session.resolveSessionId('不合法!!', null);
    assert.ok(r.error);
    assert.equal(r.error.type, 'param');
});

test('resolveSessionId：沙盒已有合法值时复用', () => {
    const adapter = session.createFileAdapter(
        require('../tests/helpers/mock-bob.js').createFileStore({
            [session.SESSION_FILE_PATH]: 'bob-translate:persisted01'
        }),
        require('../tests/helpers/mock-bob.js').createData()
    );
    const r1 = session.resolveSessionId('', adapter);
    assert.equal(r1.sessionId, 'bob-translate:persisted01');
    const r2 = session.resolveSessionId('', adapter);
    assert.equal(r2.sessionId, 'bob-translate:persisted01');
});

test('resolveSessionId：沙盒为空时生成并持久化', () => {
    const store = require('../tests/helpers/mock-bob.js').createFileStore();
    const adapter = session.createFileAdapter(store, require('../tests/helpers/mock-bob.js').createData());
    const r1 = session.resolveSessionId('', adapter);
    assert.ok(session.isValidSessionId(r1.sessionId));
    // 模拟 Bob 重启：全新 adapter 读同一沙盒
    const adapter2 = session.createFileAdapter(store, require('../tests/helpers/mock-bob.js').createData());
    const r2 = session.resolveSessionId('', adapter2);
    assert.equal(r2.sessionId, r1.sessionId);
    assert.equal(store.readRaw(session.SESSION_FILE_PATH), r1.sessionId);
});

test('resolveSessionId：沙盒写入失败退化为内存复用，仍返回合法 ID', () => {
    const adapter = session.createFileAdapter(
        require('../tests/helpers/mock-bob.js').createFileStoreBrokenWrite(),
        require('../tests/helpers/mock-bob.js').createData()
    );
    const r1 = session.resolveSessionId('', adapter);
    const r2 = session.resolveSessionId('', adapter);
    assert.ok(session.isValidSessionId(r1.sessionId));
    assert.equal(r2.sessionId, r1.sessionId);
});

test('resolveSessionId：沙盒内容损坏时重新生成', () => {
    const store = require('../tests/helpers/mock-bob.js').createFileStore({
        [session.SESSION_FILE_PATH]: '### broken ###'
    });
    const adapter = session.createFileAdapter(store, require('../tests/helpers/mock-bob.js').createData());
    const r = session.resolveSessionId('', adapter);
    assert.ok(session.isValidSessionId(r.sessionId));
    assert.notEqual(r.sessionId, '### broken ###');
});

test('resolveSessionId：adapter 不可用时仍返回合法 ID', () => {
    const r1 = session.resolveSessionId('', null);
    const r2 = session.resolveSessionId('', null);
    assert.ok(session.isValidSessionId(r1.sessionId));
    assert.equal(r2.sessionId, r1.sessionId);
});

test('resolveSessionId：session ID 不含用户名/设备名/API Key 样式内容', () => {
    const id = session.generateSessionId();
    assert.ok(id.startsWith('bob-translate:'));
    assert.ok(!id.includes(process.env.USER || ''));
    assert.ok(!id.toLowerCase().includes('sk-'));
});

test('fingerprint：短指纹不可逆且稳定', () => {
    const id = 'bob-translate:test-fingerprint';
    const f1 = session.fingerprint(id);
    const f2 = session.fingerprint(id);
    assert.equal(f1, f2);
    assert.ok(f1.length > 0 && f1.length < 12);
    assert.ok(!id.includes(f1));
    assert.equal(session.fingerprint(null), '');
});
