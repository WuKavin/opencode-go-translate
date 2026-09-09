/**
 * OpenCode Go Translate —— Bob 文本翻译插件入口
 *
 * 运行环境：Bob 内置 JavaScriptCore（不是 Node.js / 浏览器）。
 * 仅使用 Bob 提供的 $http / $option / $file / $data / $info / $signal API。
 * minBobVersion = 1.8.0（使用 query.onStream / query.cancelSignal / $http.streamRequest）。
 *
 * 合规提示（RDP 第 16 节）：
 * - 仅限 API Key 持有人本机使用，不提供公共代理或共享 Key；
 * - 不伪装成 OpenCode CLI，User-Agent 明确标识插件身份；
 * - 每次请求携带 x-opencode-session 以支持 prompt caching。
 */

var config = require('./lib/config.js');
var errors = require('./lib/errors.js');
var languages = require('./lib/languages.js');
var request = require('./lib/request.js');
var session = require('./lib/session.js');
var sse = require('./lib/sse.js');

/**
 * 插件版本号与 info.json 保持一致（User-Agent 要求）。
 */
function pluginVersion() {
    try {
        if (typeof $info !== 'undefined' && $info && $info.version) {
            return String($info.version);
        }
    } catch (e) {}
    return '0.0.0';
}

/**
 * 构造可注入的沙盒文件适配器；环境不可用时返回 null（session 将退化为内存复用）。
 */
function bobFileAdapter() {
    try {
        if (typeof $file !== 'undefined' && typeof $data !== 'undefined') {
            return session.createFileAdapter($file, $data);
        }
    } catch (e) {}
    return null;
}

function safeLog(message) {
    try {
        if (typeof $log !== 'undefined' && $log && typeof $log.info === 'function') {
            $log.info(message);
        }
    } catch (e) {}
}

/**
 * Bob 环境对象安全读取（Node 测试环境或异常环境下不抛 ReferenceError）。
 */
function bobOption() {
    try {
        return $option;
    } catch (e) {
        return undefined;
    }
}

function bobHttp() {
    try {
        return $http;
    } catch (e) {
        return undefined;
    }
}

function supportLanguages() {
    return languages.supportLanguages();
}

/**
 * Bob 整体超时 = requestTimeout + 10 秒，避免 Bob 先于 HTTP 回调超时。
 * 允许范围 30–300 秒。
 */
function pluginTimeoutInterval() {
    try {
        var option = bobOption();
        var t = option ? parseInt(option.requestTimeout, 10) : NaN;
        if (t === 30 || t === 60 || t === 120) {
            return t + 10;
        }
    } catch (e) {}
    return config.DEFAULTS.requestTimeout + 10;
}

/**
 * translate 入口。
 * 所有成功 / 错误 / 超时 / 取消路径都经过统一的 once guard，
 * 保证 onCompletion 最多被调用一次；取消后不再回调任何内容。
 */
function translate(query, completion) {
    var st = {
        finished: false,
        cancelled: false,
        disposable: null
    };

    function dispose() {
        if (st.disposable) {
            try {
                st.disposable.dispose();
            } catch (e) {}
            st.disposable = null;
        }
    }

    function finish(payload) {
        if (st.finished) {
            return;
        }
        st.finished = true;
        dispose();
        if (st.cancelled) {
            return;
        }
        if (query && typeof query.onCompletion === 'function') {
            query.onCompletion(payload);
        }
    }

    // 订阅取消信号：取消后停止 onStream、不再 onCompletion、忽略后续 HTTP 回调
    if (query && query.cancelSignal && typeof query.cancelSignal.subscribe === 'function') {
        try {
            st.disposable = query.cancelSignal.subscribe(function () {
                if (st.finished) {
                    return;
                }
                st.cancelled = true;
                st.finished = true;
                dispose();
            });
        } catch (e) {
            st.disposable = null;
        }
    }

    try {
        startTranslation(query, st, finish);
    } catch (e) {
        finish({ error: errors.unknownError('插件内部错误：' + errors.safeErrorMessage(e)) });
    }
}

function startTranslation(query, st, finish) {
    if (!query || typeof query.text !== 'string' || query.text.length === 0) {
        finish({ error: errors.paramError('没有需要翻译的文本。') });
        return;
    }

    var opts = config.readOptions(bobOption(), pluginVersion());

    var cfgError = config.validateConfig(opts, opts.sessionId);
    if (cfgError) {
        finish({ error: cfgError });
        return;
    }

    var resolved = languages.resolveLanguages(query);
    if (resolved.error) {
        finish({ error: resolved.error });
        return;
    }

    // 同语种：默认原样返回，不调用 API，不隐式润色
    if (resolved.source === resolved.target) {
        finish({
            result: {
                from: resolved.source,
                to: resolved.target,
                toParagraphs: [query.text]
            }
        });
        return;
    }

    var sessionResult = session.resolveSessionId(opts.sessionId, bobFileAdapter());
    if (sessionResult.error) {
        finish({ error: sessionResult.error });
        return;
    }
    var sessionId = sessionResult.sessionId;

    var body = request.buildRequestBody(
        opts.model,
        languages.languageName(resolved.source),
        languages.languageName(resolved.target),
        query.text,
        opts.stream,
        opts.reasoningMode
    );

    var accept = opts.stream === 'enabled' ? 'text/event-stream' : 'application/json';
    var headers = request.buildHeaders(opts.apiKey, sessionId, opts.pluginVersion, accept);

    safeLog('OpenCode Go translate start: model=' + opts.model +
        ' stream=' + (opts.stream === 'enabled' ? '1' : '0') +
        ' session=' + session.fingerprint(sessionId));

    var http = bobHttp();
    if (!http || typeof http.request !== 'function' || typeof http.streamRequest !== 'function') {
        finish({ error: errors.unknownError('Bob 网络接口不可用。') });
        return;
    }

    if (opts.stream === 'enabled') {
        doStreamRequest(query, st, finish, opts, headers, body, resolved, http);
    } else {
        doNonStreamRequest(query, st, finish, opts, headers, body, resolved, http);
    }
}

function statusOf(resp) {
    return resp && resp.response && typeof resp.response.statusCode === 'number'
        ? resp.response.statusCode
        : 0;
}

function doNonStreamRequest(query, st, finish, opts, headers, body, resolved, http) {
    http.request({
        method: 'POST',
        url: request.CHAT_COMPLETIONS_URL,
        header: headers,
        body: body,
        timeout: opts.requestTimeout,
        cancelSignal: query ? query.cancelSignal : undefined, // 与流式路径保持一致：取消时终止底层请求
        handler: function (resp) {
            if (st.finished) {
                return; // 已取消或已终结
            }
            if (resp && resp.error) {
                finish({
                    error: errors.networkError(
                        '网络请求失败：' + errors.redact(resp.error.message || '')
                    )
                });
                return;
            }
            var status = statusOf(resp);
            if (status < 200 || status >= 300) {
                finish({
                    error: request.mapHttpError(status, errors.summarizePayload(resp ? resp.data : null))
                });
                return;
            }
            var parsed = request.parseNonStreamResponse(resp.data);
            if (parsed.error) {
                finish({ error: parsed.error });
                return;
            }
            finish({
                result: {
                    from: resolved.source,
                    to: resolved.target,
                    toParagraphs: [parsed.text]
                }
            });
        }
    });
}

function doStreamRequest(query, st, finish, opts, headers, body, resolved, http) {
    var parser = sse.createSSEParser();
    var accumulated = '';
    var seenDone = false;
    var finishReason = null;
    var streamError = null;

    function emitStream() {
        if (st.finished || streamError) {
            return;
        }
        try {
            query.onStream({
                result: {
                    from: resolved.source,
                    to: resolved.target,
                    toParagraphs: [accumulated]
                }
            });
        } catch (e) {}
    }

    function handleFrame(frame) {
        var data = frame.data;
        if (data === '[DONE]') {
            seenDone = true;
            return null;
        }
        var payload;
        try {
            payload = JSON.parse(data);
        } catch (e) {
            return errors.apiError('流式响应包含无法解析的数据。');
        }
        if (payload && payload.error) {
            var detail = payload.error.message ? String(payload.error.message) : '未知服务错误';
            return errors.apiError('服务返回错误：' + errors.redact(detail).replace(/\s+/g, ' '));
        }
        var choices = payload && payload.choices ? payload.choices : null;
        if (!choices || Object.prototype.toString.call(choices) !== '[object Array]' || choices.length === 0) {
            return null; // usage 等附加帧，忽略
        }
        var choice = choices[0];
        if (!choice) {
            return null;
        }
        if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
            finishReason = choice.finish_reason;
        }
        var delta = choice.delta;
        if (delta) {
            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
                finishReason = delta.finish_reason;
            }
            // 只取 delta.content；reasoning_content 等字段一律忽略，不显示为译文
            if (typeof delta.content === 'string' && delta.content.length > 0) {
                accumulated += delta.content;
                emitStream();
            }
        }
        return null;
    }

    http.streamRequest({
        method: 'POST',
        url: request.CHAT_COMPLETIONS_URL,
        header: headers,
        body: body,
        timeout: opts.requestTimeout,
        cancelSignal: query.cancelSignal,
        streamHandler: function (streamData) {
            if (st.finished || streamError) {
                return;
            }
            var text = streamData && typeof streamData.text === 'string' ? streamData.text : null;
            if (!text) {
                return;
            }
            var frames;
            try {
                frames = parser.feed(text);
            } catch (e) {
                streamError = errors.apiError('流式数据解析失败：' + errors.safeErrorMessage(e));
                return;
            }
            for (var i = 0; i < frames.length; i++) {
                var err = handleFrame(frames[i]);
                if (err) {
                    streamError = err;
                    return;
                }
            }
        },
        handler: function (resp) {
            if (st.finished) {
                return; // 已取消或已终结
            }
            if (streamError) {
                finish({ error: streamError });
                return;
            }
            if (resp && resp.error) {
                finish({
                    error: errors.networkError(
                        '网络请求失败：' + errors.redact(resp.error.message || '')
                    )
                });
                return;
            }
            var status = statusOf(resp);
            if (status < 200 || status >= 300) {
                finish({
                    error: request.mapHttpError(status, errors.summarizePayload(resp ? resp.data : null))
                });
                return;
            }

            // EOF：处理残留缓冲区（可能包含最后一帧）
            var tail = parser.end();
            for (var i = 0; i < tail.frames.length; i++) {
                var err = handleFrame(tail.frames[i]);
                if (err) {
                    finish({ error: err });
                    return;
                }
            }
            if (tail.incomplete) {
                finish({ error: errors.apiError('响应流异常中断，译文不完整。') });
                return;
            }
            if (!seenDone && !finishReason) {
                finish({ error: errors.apiError('流式响应未包含完成标志。') });
                return;
            }
            if (finishReason === 'length') {
                finish({ error: errors.apiError('译文可能因长度限制被截断，请尝试缩短原文或分段翻译。') });
                return;
            }
            if (finishReason && finishReason !== 'stop') {
                finish({ error: errors.apiError('翻译被提前终止（' + finishReason + '）。') });
                return;
            }
            if (accumulated.length === 0) {
                finish({ error: errors.apiError('未获取到译文。') });
                return;
            }
            finish({
                result: {
                    from: resolved.source,
                    to: resolved.target,
                    toParagraphs: [accumulated]
                }
            });
        }
    });
}

/**
 * 插件验证（Bob 偏好设置中的“验证”按钮）。
 * 两阶段验证：
 *   阶段一 GET /models —— 仅作模型存在性与协议检查（该端点当前不校验 API Key，
 *   带无效 Key 也会返回 200，实测 2026-09-09），不能用于确认鉴权；
 *   阶段二 POST /chat/completions —— 发送最小真实请求确认 API Key 与模型访问权限，
 *   该请求会消耗少量额度（不附加 max_tokens 等未确认字段，响应内容不参与判定）。
 * 验证顺序：API Key → 模型 allowlist → sessionId 格式 → disabled 组合 → /models 检查 → Chat 请求鉴权检查。
 * 注意：/models 返回模型存在不代表该模型支持 Chat Completions，transport 仍以静态映射为准。
 */
function pluginValidate(completion) {
    var opts = config.readOptions(bobOption(), pluginVersion());

    function fail(error) {
        completion({
            result: false,
            error: error
        });
    }

    var cfgError = config.validateConfig(opts, opts.sessionId);
    if (cfgError) {
        fail(cfgError);
        return;
    }

    var sessionResult = session.resolveSessionId(opts.sessionId, bobFileAdapter());
    if (sessionResult.error) {
        fail(sessionResult.error);
        return;
    }

    var http = bobHttp();
    if (!http || typeof http.request !== 'function') {
        fail(errors.unknownError('Bob 网络接口不可用。'));
        return;
    }

    var headers = request.buildHeaders(
        opts.apiKey,
        sessionResult.sessionId,
        opts.pluginVersion,
        'application/json'
    );

    // 阶段一：模型存在性与协议检查（不做鉴权判定）
    http.request({
        method: 'GET',
        url: request.MODELS_URL,
        header: headers,
        timeout: opts.requestTimeout,
        handler: function (resp) {
            if (resp && resp.error) {
                fail(errors.networkError('网络请求失败：' + errors.redact(resp.error.message || '')));
                return;
            }
            var status = statusOf(resp);
            if (status !== 200) {
                fail(request.mapHttpError(status, errors.summarizePayload(resp ? resp.data : null)));
                return;
            }
            var data = resp.data;
            if (
                !data ||
                typeof data !== 'object' ||
                data.object !== 'list' ||
                !data.data ||
                Object.prototype.toString.call(data.data) !== '[object Array]'
            ) {
                fail(errors.apiError('模型列表响应格式异常。'));
                return;
            }
            var found = false;
            for (var i = 0; i < data.data.length; i++) {
                if (data.data[i] && data.data[i].id === opts.model) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                fail(errors.paramError(
                    '所选模型「' + opts.model + '」不在服务端模型列表中。OpenCode Go 模型可能已变化，请更新插件或更换模型。'
                ));
                return;
            }
            validateKeyWithChatRequest(http, opts, sessionResult.sessionId, fail, completion);
        }
    });
}

/**
 * 阶段二：最小 Chat Completions 请求验证 API Key（假 Key 在此才会被 401 拒绝）。
 */
function validateKeyWithChatRequest(http, opts, sessionId, fail, completion) {
    http.request({
        method: 'POST',
        url: request.CHAT_COMPLETIONS_URL,
        header: request.buildHeaders(
            opts.apiKey,
            sessionId,
            opts.pluginVersion,
            'application/json'
        ),
        body: request.buildValidateRequestBody(opts.model),
        timeout: opts.requestTimeout,
        handler: function (resp) {
            if (resp && resp.error) {
                fail(errors.networkError('网络请求失败：' + errors.redact(resp.error.message || '')));
                return;
            }
            var status = statusOf(resp);
            if (status < 200 || status >= 300) {
                fail(request.mapHttpError(status, errors.summarizePayload(resp ? resp.data : null)));
                return;
            }
            completion({ result: true });
        }
    });
}

module.exports = {
    supportLanguages: supportLanguages,
    translate: translate,
    pluginValidate: pluginValidate,
    pluginTimeoutInterval: pluginTimeoutInterval
};
