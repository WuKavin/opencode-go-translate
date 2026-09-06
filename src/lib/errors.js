/**
 * service error 构造与敏感信息脱敏。
 * Bob service error 结构：{ type, message, addition?, troubleshootingLink? }
 */

function serviceError(type, message, addition, troubleshootingLink) {
    var err = { type: type, message: message };
    if (addition !== undefined && addition !== null) {
        err.addition = addition;
    }
    if (troubleshootingLink) {
        err.troubleshootingLink = troubleshootingLink;
    }
    return err;
}

function paramError(message, addition) {
    return serviceError('param', message, addition);
}

function secretKeyError(message, addition) {
    return serviceError('secretKey', message, addition);
}

function unsupportedLanguageError(message) {
    return serviceError('unsupportedLanguage', message);
}

function networkError(message, addition) {
    return serviceError('network', message, addition);
}

function apiError(message, addition) {
    return serviceError('api', message, addition);
}

function unknownError(message, addition) {
    return serviceError('unknown', message, addition);
}

/**
 * 移除字符串中疑似密钥的内容，避免错误信息泄密。
 */
function redact(text) {
    if (typeof text !== 'string') {
        return '';
    }
    return text
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
        .replace(/sk-[A-Za-z0-9._~+/=-]{8,}/g, 'sk-***');
}

/**
 * 将任意错误对象转成安全的短描述，绝不包含密钥。
 */
function safeErrorMessage(e) {
    var msg = e && e.message ? String(e.message) : String(e);
    msg = redact(msg).replace(/\s+/g, ' ').trim();
    if (msg.length > 120) {
        msg = msg.slice(0, 120) + '…';
    }
    return msg;
}

/**
 * 从服务端响应数据提取脱敏摘要（仅用于错误展示与日志）。
 */
function summarizePayload(data) {
    var s = null;
    if (data && typeof data === 'object' && typeof data.toUTF8 === 'function') {
        try {
            s = data.toUTF8();
        } catch (e) {
            s = null;
        }
    } else if (data && typeof data === 'object') {
        if (data.error && data.error.message) {
            s = String(data.error.message);
        } else {
            try {
                s = JSON.stringify(data);
            } catch (e) {
                s = null;
            }
        }
    } else if (typeof data === 'string') {
        s = data;
    }
    if (typeof s !== 'string' || s.length === 0) {
        return '';
    }
    s = redact(s).replace(/\s+/g, ' ').trim();
    if (s.length > 200) {
        s = s.slice(0, 200) + '…';
    }
    return s;
}

module.exports = {
    serviceError: serviceError,
    paramError: paramError,
    secretKeyError: secretKeyError,
    unsupportedLanguageError: unsupportedLanguageError,
    networkError: networkError,
    apiError: apiError,
    unknownError: unknownError,
    redact: redact,
    safeErrorMessage: safeErrorMessage,
    summarizePayload: summarizePayload
};
