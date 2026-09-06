'use strict';

const test = require('node:test');
const assert = require('node:assert');
const languages = require('../src/lib/languages.js');

test('supportLanguages：包含 auto 与主流语言代码，均为 Bob 官方代码', () => {
    const list = languages.supportLanguages();
    assert.equal(list[0], 'auto');
    for (const code of ['zh-Hans', 'zh-Hant', 'yue', 'wyw', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'it', 'ru', 'pt', 'nl', 'pl', 'ar', 'tr', 'th', 'vi', 'id', 'he', 'hi']) {
        assert.ok(list.includes(code), code);
    }
    // 不得自行发明语言代码
    assert.ok(!list.includes('zh-CN'));
    assert.ok(!list.includes('en-US'));
    assert.ok(!list.includes('zh'));
});

test('isSupported：不支持的代码返回 false', () => {
    assert.equal(languages.isSupported('xx-YY'), false);
    assert.equal(languages.isSupported('auto'), false);
});

test('resolveLanguages：from/to 非 auto 时直接使用', () => {
    const r = languages.resolveLanguages({ from: 'en', to: 'zh-Hans', detectFrom: 'ja', detectTo: 'ko' });
    assert.equal(r.source, 'en');
    assert.equal(r.target, 'zh-Hans');
});

test('resolveLanguages：auto 时使用 detectFrom/detectTo', () => {
    const r = languages.resolveLanguages({ from: 'auto', to: 'auto', detectFrom: 'en', detectTo: 'zh-Hans' });
    assert.equal(r.source, 'en');
    assert.equal(r.target, 'zh-Hans');
    assert.ok(r.source !== 'auto' && r.target !== 'auto');
});

test('resolveLanguages：detectFrom/detectTo 缺失或仍为 auto → unsupportedLanguage', () => {
    const r1 = languages.resolveLanguages({ from: 'auto', to: 'zh-Hans', detectTo: 'zh-Hans' });
    assert.ok(r1.error);
    assert.equal(r1.error.type, 'unsupportedLanguage');
    const r2 = languages.resolveLanguages({ from: 'en', to: 'auto', detectFrom: 'en' });
    assert.ok(r2.error);
    assert.equal(r2.error.type, 'unsupportedLanguage');
});

test('resolveLanguages：不支持的代码 → unsupportedLanguage', () => {
    const r = languages.resolveLanguages({ from: 'xx-YY', to: 'zh-Hans' });
    assert.equal(r.error.type, 'unsupportedLanguage');
});

test('languageName：使用可读名称，缺失时回退代码', () => {
    assert.equal(languages.languageName('zh-Hans'), 'Simplified Chinese');
    assert.equal(languages.languageName('en'), 'English');
    assert.equal(languages.languageName('wyw'), 'Classical Chinese');
});

test('同语种判定：source === target', () => {
    const r = languages.resolveLanguages({ from: 'zh-Hans', to: 'zh-Hans' });
    assert.equal(r.source, r.target);
});
