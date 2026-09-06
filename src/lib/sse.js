/**
 * SSE（text/event-stream）解析状态机。
 *
 * 支持（RDP 10.1）：
 * - 任意 chunk 边界（一个事件/一行/一个 JSON 可跨多个 chunk）；
 * - LF 与 CRLF 行结束符；
 * - 空行分帧、注释行（: 开头）、event: 字段；
 * - 单帧多个 data: 行（以 \n 连接）；
 * - data: [DONE]；
 * - BOM 处理；
 * - EOF 残留缓冲区（返回 incomplete 标志，由调用方决定报错）。
 *
 * 用法：
 *   var parser = createSSEParser();
 *   var frames = parser.feed(text);     // 返回本次新解析完成的帧数组
 *   var tail = parser.end();            // 流结束时调用，返回 { frames, incomplete }
 * 帧结构：{ data: string, event: string|null }
 */

function stripBOM(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
        return text.slice(1);
    }
    return text;
}

function findLineEnd(s, from, to) {
    for (var i = from; i < to; i++) {
        var ch = s.charAt(i);
        if (ch === '\n') {
            return { index: i, length: 1 };
        }
        if (ch === '\r') {
            if (i + 1 < s.length && s.charAt(i + 1) === '\n') {
                return { index: i, length: 2 };
            }
            return { index: i, length: 1 };
        }
    }
    return null;
}

/**
 * 解析单行，更新 pending 帧。
 */
function processLine(line, pending) {
    if (line === '') {
        // 空行：分帧
        if (pending.dataLines.length > 0) {
            var frame = { data: pending.dataLines.join('\n'), event: pending.eventName };
            pending.dataLines = [];
            pending.eventName = null;
            return frame;
        }
        pending.eventName = null;
        return null;
    }
    if (line.charAt(0) === ':') {
        // 注释行，忽略
        return null;
    }
    var colon = line.indexOf(':');
    var field = colon < 0 ? line : line.slice(0, colon);
    var value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.charAt(0) === ' ') {
        value = value.slice(1);
    }
    if (field === 'data') {
        pending.dataLines.push(value);
    } else if (field === 'event') {
        pending.eventName = value;
    }
    // id / retry / 其他字段忽略
    return null;
}

function createSSEParser() {
    var buffer = '';
    var pending = { dataLines: [], eventName: null };
    var firstFeed = true;

    function consumeLines(safeLength, out) {
        var pos = 0;
        while (true) {
            var le = findLineEnd(buffer, pos, safeLength);
            if (!le) {
                break;
            }
            var line = buffer.slice(pos, le.index);
            pos = le.index + le.length;
            var frame = processLine(line, pending);
            if (frame) {
                out.push(frame);
            }
        }
        buffer = buffer.slice(pos);
    }

    return {
        /**
         * 喂入一段流文本，返回本次解析完成的帧数组。
         */
        feed: function (text) {
            if (typeof text !== 'string' || text.length === 0) {
                return [];
            }
            if (firstFeed) {
                text = stripBOM(text);
                firstFeed = false;
                if (text.length === 0) {
                    return [];
                }
            }
            buffer += text;

            var out = [];
            // 若缓冲区以 \r 结尾，暂不消费（\r\n 可能跨 chunk）
            var safeLength = buffer.length;
            if (buffer.charAt(buffer.length - 1) === '\r') {
                safeLength -= 1;
            }
            consumeLines(safeLength, out);
            return out;
        },

        /**
         * 流结束时调用。
         * - 剩余缓冲（无行结束符）按最后一行处理并 dispatch；
         * - incomplete = true 表示存在没有行结束符就被截断的残行（半帧风险），
         *   调用方应按 RDP 返回 api 错误。
         */
        end: function () {
            var out = [];
            var incomplete = false;

            if (buffer.length > 0) {
                // 无行结束符的残行：视为被截断
                incomplete = true;
                var rest = buffer;
                buffer = '';
                var frame = processLine(rest, pending);
                if (frame) {
                    out.push(frame);
                }
            }

            // 残余 pending（最后一帧未以空行结束）也 dispatch
            if (pending.dataLines.length > 0) {
                var lastFrame = { data: pending.dataLines.join('\n'), event: pending.eventName };
                pending.dataLines = [];
                pending.eventName = null;
                out.push(lastFrame);
            } else if (pending.eventName !== null) {
                pending.eventName = null;
            }

            return { frames: out, incomplete: incomplete };
        }
    };
}

module.exports = {
    createSSEParser: createSSEParser
};
