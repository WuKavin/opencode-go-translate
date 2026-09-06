/**
 * 稳定 Session ID 的生成、校验与持久化。
 *
 * 策略（RDP 第 5 节）：
 * - 用户在设置中填写了合法 sessionId 时，优先使用用户值；
 * - 留空时，读取 $sandbox/opencode-go-session-id.txt 复用；
 * - 不存在时生成 "bob-translate:<随机ID>" 并写入沙盒；
 * - 沙盒写入失败时退化为当前进程内存复用，仍然发送 Header。
 *
 * 该 ID 仅用于 x-opencode-session，不含用户名、设备名、API Key 或原文，
 * 不作为鉴权凭据，不代表对话连续性，不保证缓存命中。
 */

var errors = require('./errors.js');

var SESSION_FILE_PATH = '$sandbox/opencode-go-session-id.txt';
var SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

var memorySessionId = null;

/**
 * 将 Bob 的 $file / $data 包装为可注入的简单文件适配器。
 * 所有操作吞掉异常并返回安全值，持久化失败不会影响翻译主流程。
 */
function createFileAdapter(file, data) {
    return {
        exists: function (path) {
            try {
                return !!file.exists(path);
            } catch (e) {
                return false;
            }
        },
        readText: function (path) {
            try {
                if (!file.exists(path)) {
                    return null;
                }
                var d = file.read(path);
                if (!d || typeof d.toUTF8 !== 'function') {
                    return null;
                }
                var s = d.toUTF8();
                return typeof s === 'string' ? s : null;
            } catch (e) {
                return null;
            }
        },
        writeText: function (path, text) {
            try {
                return !!file.write({ data: data.fromUTF8(text), path: path });
            } catch (e) {
                return false;
            }
        }
    };
}

function isValidSessionId(id) {
    if (typeof id !== 'string') {
        return false;
    }
    return SESSION_ID_PATTERN.test(id);
}

function randomToken() {
    var s = '';
    while (s.length < 8) {
        s += Math.random().toString(36).slice(2);
    }
    return s.slice(0, 8);
}

/**
 * 格式：bob-translate:<随机ID>
 */
function generateSessionId() {
    var token = randomToken() + randomToken() + randomToken() + randomToken() + Date.now().toString(36);
    return ('bob-translate:' + token).slice(0, 128);
}

/**
 * 校验用户在设置中填写的 sessionId。
 * 留空返回 null（表示不校验），非法返回 param 错误。
 */
function validateUserSessionId(raw) {
    if (typeof raw !== 'string' || raw.length === 0) {
        return null;
    }
    if (!isValidSessionId(raw.trim())) {
        return errors.paramError(
            '自定义 Session ID 无效：仅允许字母、数字和 . _ : -，长度 8–128。留空可自动生成。'
        );
    }
    return null;
}

/**
 * 解析本次请求使用的 sessionId。
 * 返回 { sessionId } 或 { error }。
 */
function resolveSessionId(rawUserSessionId, adapter) {
    var raw = typeof rawUserSessionId === 'string' ? rawUserSessionId.trim() : '';

    if (raw.length > 0) {
        if (!isValidSessionId(raw)) {
            return {
                error: errors.paramError(
                    '自定义 Session ID 无效：仅允许字母、数字和 . _ : -，长度 8–128。留空可自动生成。'
                )
            };
        }
        return { sessionId: raw };
    }

    if (adapter) {
        var saved = adapter.readText(SESSION_FILE_PATH);
        if (saved) {
            var trimmed = saved.trim();
            if (isValidSessionId(trimmed)) {
                return { sessionId: trimmed };
            }
        }
        var fresh = generateSessionId();
        if (adapter.writeText(SESSION_FILE_PATH, fresh)) {
            return { sessionId: fresh };
        }
    }

    if (!memorySessionId) {
        memorySessionId = generateSessionId();
    }
    return { sessionId: memorySessionId };
}

/**
 * 生成不可逆短指纹，仅用于诊断日志（不得记录完整 session ID）。
 */
function fingerprint(sessionId) {
    if (typeof sessionId !== 'string') {
        return '';
    }
    var hash = 5381;
    for (var i = 0; i < sessionId.length; i++) {
        hash = ((hash << 5) + hash + sessionId.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

module.exports = {
    SESSION_FILE_PATH: SESSION_FILE_PATH,
    SESSION_ID_PATTERN: SESSION_ID_PATTERN,
    createFileAdapter: createFileAdapter,
    isValidSessionId: isValidSessionId,
    generateSessionId: generateSessionId,
    validateUserSessionId: validateUserSessionId,
    resolveSessionId: resolveSessionId,
    fingerprint: fingerprint
};
