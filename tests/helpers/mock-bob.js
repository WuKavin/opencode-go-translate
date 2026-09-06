'use strict';

/**
 * 测试辅助：在 Node 中模拟 Bob 插件运行环境。
 * 仅用于测试，不会进入 .bobplugin 包。
 */

const http = require('node:http');

function createSignal() {
    const subs = [];
    return {
        subscribe(fn) {
            subs.push(fn);
            return {
                dispose() {
                    const i = subs.indexOf(fn);
                    if (i >= 0) subs.splice(i, 1);
                }
            };
        },
        send(data) {
            subs.slice().forEach((fn) => fn(data));
        },
        subscriberCount() {
            return subs.length;
        }
    };
}

function createFileStore(initial) {
    const files = new Map(Object.entries(initial || {}));
    return {
        exists(p) {
            return files.has(p);
        },
        read(p) {
            const s = files.get(p);
            return s === undefined ? null : { toUTF8: () => s };
        },
        write(obj) {
            files.set(obj.path, obj.data.toUTF8());
            return true;
        },
        delete(p) {
            return files.delete(p);
        },
        readRaw(p) {
            return files.get(p);
        }
    };
}

function createFileStoreBrokenWrite(initial) {
    const store = createFileStore(initial);
    return {
        exists: store.exists,
        read: store.read,
        delete: store.delete,
        readRaw: store.readRaw,
        write() {
            return false;
        }
    };
}

function createData() {
    return {
        fromUTF8: (s) => ({ toUTF8: () => s, length: Buffer.byteLength(s, 'utf8') })
    };
}

function createLog() {
    const lines = [];
    return {
        lines,
        info(msg) {
            lines.push(String(msg));
        },
        warn(msg) {
            lines.push(String(msg));
        },
        error(msg) {
            lines.push(String(msg));
        }
    };
}

/**
 * 脚本化 $http：handler(opts, isStream) 由测试自行调用 opts.handler / opts.streamHandler。
 */
function createScriptedHttp(handler) {
    const calls = [];
    return {
        calls,
        request(opts) {
            calls.push({ ...opts, isStream: false });
            handler(opts, false);
        },
        streamRequest(opts) {
            calls.push({ ...opts, isStream: true });
            handler(opts, true);
        }
    };
}

/**
 * 基于 Node 真实网络栈的 $http 实现，用于 Mock Server 集成测试。
 * - 将发往 https://opencode.ai 的请求改写到本地 mock server；
 * - capture 记录插件实际发出的 method/url/header/body；
 * - 支持 streamHandler 与 cancelSignal。
 */
function createTransportHttp({ targetBase, capture }) {
    function forward(opts, isStream) {
        if (capture) {
            capture(opts);
        }
        const u = new URL(opts.url);
        let pathWithQuery = u.pathname + u.search;
        let finalBase = targetBase;
        if (opts.rewriteQuery) {
            const extra = new URLSearchParams(opts.rewriteQuery);
            pathWithQuery += (pathWithQuery.includes('?') ? '&' : '?') + extra.toString();
        }
        const target = finalBase ? finalBase + pathWithQuery : opts.url;
        const targetUrl = new URL(target);
        const transport = targetUrl.protocol === 'https:' ? require('node:https') : http;

        let bodyStr;
        if (opts.body !== undefined && opts.body !== null) {
            bodyStr = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
        }

        const req = transport.request(
            {
                method: opts.method || 'GET',
                hostname: targetUrl.hostname,
                port: targetUrl.port,
                path: targetUrl.pathname + targetUrl.search,
                headers: opts.header || {},
                agent: false // 测试环境禁用 keep-alive，保证 server.close() 能立即完成
            },
            (res) => {
                if (isStream) {
                    res.on('data', (chunk) => {
                        const text = chunk.toString('utf8');
                        if (opts.streamHandler) {
                            opts.streamHandler({ text, rawData: { toUTF8: () => text } });
                        }
                    });
                    res.on('end', () => {
                        if (opts.handler) {
                            opts.handler({ response: { statusCode: res.statusCode, headers: res.headers } });
                        }
                    });
                    res.on('error', (err) => {
                        if (opts.handler) {
                            opts.handler({ error: { message: err.message } });
                        }
                    });
                } else {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        const text = Buffer.concat(chunks).toString('utf8');
                        let data = text;
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            /* 保持 string */
                        }
                        if (opts.handler) {
                            opts.handler({
                                data,
                                rawData: { toUTF8: () => text },
                                response: { statusCode: res.statusCode, headers: res.headers }
                            });
                        }
                    });
                    res.on('error', (err) => {
                        if (opts.handler) {
                            opts.handler({ error: { message: err.message } });
                        }
                    });
                }
            }
        );

        req.on('error', (err) => {
            if (opts.handler) {
                opts.handler({ error: { message: err.message } });
            }
        });

        if (opts.cancelSignal && typeof opts.cancelSignal.subscribe === 'function') {
            opts.cancelSignal.subscribe(() => {
                req.destroy(new Error('canceled'));
            });
        }

        if (bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    }

    return {
        request(opts) {
            forward(opts, false);
        },
        streamRequest(opts) {
            forward(opts, true);
        }
    };
}

function installEnv({ option, http, file, log }) {
    global.$option = option;
    global.$info = { version: '1.0.0' };
    global.$log = log || createLog();
    global.$http = http;
    global.$file = file;
    global.$data = createData();
}

function clearEnv() {
    delete global.$option;
    delete global.$info;
    delete global.$log;
    delete global.$http;
    delete global.$file;
    delete global.$data;
}

function translateOnce(query, hooks) {
    return new Promise((resolve) => {
        const q = {
            text: query.text,
            from: query.from,
            to: query.to,
            detectFrom: query.detectFrom || query.from,
            detectTo: query.detectTo || query.to,
            cancelSignal: query.cancelSignal,
            onStream: (hooks && hooks.onStream) || (() => {}),
            onCompletion: resolve
        };
        require('../../src/main.js').translate(q, () => {});
    });
}

module.exports = {
    createSignal,
    createFileStore,
    createFileStoreBrokenWrite,
    createData,
    createLog,
    createScriptedHttp,
    createTransportHttp,
    installEnv,
    clearEnv,
    translateOnce
};
