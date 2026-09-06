/**
 * 在 macOS 系统 JavaScriptCore（与 Bob 同源）中解析检查插件 JS 源码。
 * 通过 JXA（osascript -l JavaScript）运行；new Function 仅做语法解析，不执行代码。
 *
 * 用法：osascript -l JavaScript scripts/jsc-syntax-check.js file1.js file2.js ...
 */
ObjC.import('Foundation');

function run(argv) {
    if (!argv || argv.length === 0) {
        throw new Error('用法：osascript -l JavaScript scripts/jsc-syntax-check.js file1.js file2.js ...');
    }
    var checked = 0;
    for (var i = 0; i < argv.length; i++) {
        var path = argv[i];
        var content = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, $());
        if (content.isNil()) {
            throw new Error('无法读取文件：' + path);
        }
        var source = ObjC.unwrap(content);
        try {
            // 仅解析语法，不执行
            new Function(source);
            checked += 1;
        } catch (e) {
            throw new Error('JavaScriptCore 语法检查失败 [' + path + ']：' + e.message);
        }
    }
    return 'JavaScriptCore 语法检查通过（共 ' + checked + ' 个文件）';
}
