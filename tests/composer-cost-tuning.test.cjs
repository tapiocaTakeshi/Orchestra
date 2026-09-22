const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync(path.resolve(__dirname, '../src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/AutoRouting.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require: name => name === 'react' ? React : { fetchDivisionProfile: async () => ({ isPaid: true }) }, console });
const props = { endpoint: 'https://example.test', accessToken: '', refreshToken: '', onChange() {} };
test('composer uses the existing prompt and compact controls cannot submit chat', () => {
 const html = renderToStaticMarkup(React.createElement(exportsObject.AutoRouting, { ...props, prompt: 'Build a chart', compact: true }));
 assert.ok(html.includes('入力中のプロンプト'));
 assert.ok(!html.includes('<textarea'));
 assert.ok(!html.includes('リクエスト履歴・実際の料金'));
 const buttons = html.match(/<button\b[^>]*>/g) || [];
 assert.ok(buttons.length >= 4);
 assert.ok(buttons.every(tag => tag.includes('type="button"')));
});
test('settings keeps its own prompt and history view', () => {
 const html = renderToStaticMarkup(React.createElement(exportsObject.AutoRouting, props));
 assert.ok(html.includes('<textarea'));
 assert.ok(html.includes('リクエスト履歴・実際の料金'));
});
