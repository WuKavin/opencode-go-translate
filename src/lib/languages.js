/**
 * Bob 官方语言代码与可读名称映射。
 * 语言代码来源：https://bobtranslate.com/plugin/addition/language.html
 * 仅收录主流大模型能够合理处理的文本语言，不自行发明语言代码。
 */

var LANGUAGE_NAMES = {
    'zh-Hans': 'Simplified Chinese',
    'zh-Hant': 'Traditional Chinese',
    'yue': 'Cantonese',
    'wyw': 'Classical Chinese',
    'en': 'English',
    'ja': 'Japanese',
    'ko': 'Korean',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'ru': 'Russian',
    'pt': 'Portuguese',
    'pt-pt': 'Portuguese (Portugal)',
    'pt-br': 'Portuguese (Brazil)',
    'nl': 'Dutch',
    'pl': 'Polish',
    'cs': 'Czech',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'hr': 'Croatian',
    'bs': 'Bosnian',
    'sr': 'Serbian',
    'sr-Latn': 'Serbian (Latin)',
    'mk': 'Macedonian',
    'bg': 'Bulgarian',
    'ro': 'Romanian',
    'hu': 'Hungarian',
    'el': 'Greek',
    'sv': 'Swedish',
    'nb': 'Norwegian (Bokmål)',
    'da': 'Danish',
    'fi': 'Finnish',
    'is': 'Icelandic',
    'et': 'Estonian',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'ga': 'Irish',
    'cy': 'Welsh',
    'ca': 'Catalan',
    'gl': 'Galician',
    'eu': 'Basque',
    'ar': 'Arabic',
    'he': 'Hebrew',
    'fa': 'Persian',
    'tr': 'Turkish',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'id': 'Indonesian',
    'ms': 'Malay',
    'tl': 'Tagalog',
    'fil': 'Filipino',
    'km': 'Khmer',
    'lo': 'Lao',
    'my': 'Burmese',
    'si': 'Sinhala',
    'hi': 'Hindi',
    'bn': 'Bengali',
    'ur': 'Urdu',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'ne': 'Nepali',
    'sw': 'Swahili',
    'am': 'Amharic',
    'af': 'Afrikaans',
    'sq': 'Albanian',
    'be': 'Belarusian',
    'uk': 'Ukrainian',
    'ka': 'Georgian',
    'hy': 'Armenian',
    'az': 'Azerbaijani',
    'kk': 'Kazakh',
    'uz': 'Uzbek',
    'mn': 'Mongolian',
    'la': 'Latin',
    'eo': 'Esperanto'
};

var errors = require('./errors.js');

function isSupported(code) {
    return Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, code);
}

function supportLanguages() {
    var list = ['auto'];
    for (var code in LANGUAGE_NAMES) {
        if (Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, code)) {
            list.push(code);
        }
    }
    return list;
}

/**
 * 可读语言名称；缺少映射时回退为 Bob 语言代码。
 */
function languageName(code) {
    if (isSupported(code) && LANGUAGE_NAMES[code]) {
        return LANGUAGE_NAMES[code];
    }
    return code;
}

/**
 * 按 RDP 规则解析最终 source / target：
 *   source = query.from === 'auto' ? query.detectFrom : query.from
 *   target = query.to === 'auto' ? query.detectTo : query.to
 * 最终两者均不得为 auto，且必须是受支持语言。
 */
function resolveLanguages(query) {
    var q = query || {};
    var source = q.from === 'auto' ? q.detectFrom : q.from;
    var target = q.to === 'auto' ? q.detectTo : q.to;

    if (!source || source === 'auto') {
        return { error: errors.unsupportedLanguageError('无法确定源语言。') };
    }
    if (!target || target === 'auto') {
        return { error: errors.unsupportedLanguageError('无法确定目标语言。') };
    }
    if (!isSupported(source)) {
        return { error: errors.unsupportedLanguageError('暂不支持的语言：' + source) };
    }
    if (!isSupported(target)) {
        return { error: errors.unsupportedLanguageError('暂不支持的语言：' + target) };
    }
    return { source: source, target: target };
}

module.exports = {
    isSupported: isSupported,
    supportLanguages: supportLanguages,
    languageName: languageName,
    resolveLanguages: resolveLanguages
};
