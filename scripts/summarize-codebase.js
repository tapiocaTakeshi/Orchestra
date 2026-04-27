#!/usr/bin/env node
/**
 * Codebase Summarizer
 *
 * ワークスペースを走査し、言語別の行数・ファイル数・主要ディレクトリ構造・
 * package.json / pyproject.toml / Cargo.toml などのメタ情報を集計して
 * CODEBASE_SUMMARY.md を生成します。
 *
 * 使い方:
 *   node scripts/summarize-codebase.js [rootDir] [outputFile]
 *   既定値: rootDir = ".", outputFile = "CODEBASE_SUMMARY.md"
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'CODEBASE_SUMMARY.md');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.cache', '.turbo', '.parcel-cache', '__pycache__',
  '.venv', 'venv', 'env', '.idea', '.vscode', 'target', '.gradle',
  '.mypy_cache', '.pytest_cache', '.tox', '.eggs', 'vendor',
]);

const EXT_LANG = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript (TSX)',
  '.js': 'JavaScript', '.jsx': 'JavaScript (JSX)', '.mjs': 'JavaScript',
  '.cjs': 'JavaScript', '.py': 'Python', '.rb': 'Ruby', '.go': 'Go',
  '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.c': 'C', '.h': 'C/C++ Header', '.cpp': 'C++', '.cc': 'C++',
  '.cs': 'C#', '.php': 'PHP', '.scala': 'Scala', '.sh': 'Shell',
  '.bash': 'Shell', '.zsh': 'Shell', '.lua': 'Lua', '.r': 'R',
  '.vue': 'Vue', '.svelte': 'Svelte', '.html': 'HTML', '.css': 'CSS',
  '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.md': 'Markdown', '.sql': 'SQL', '.dart': 'Dart', '.ex': 'Elixir',
  '.exs': 'Elixir', '.elm': 'Elm', '.clj': 'Clojure',
};

/** @type {Record<string, {files: number, lines: number, bytes: number}>} */
const stats = {};
let totalFiles = 0;
let totalLines = 0;
let totalBytes = 0;
const topDirs = {};

function countLines(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    let lines = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) lines++;
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) lines++;
    return { lines, bytes: buf.length };
  } catch {
    return { lines: 0, bytes: 0 };
  }
}

function walk(dir, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.github') {
      // hidden を一律除外（.github のみ例外）
      if (!['.env.example', '.gitignore', '.eslintrc', '.prettierrc'].includes(ent.name)) {
        continue;
      }
    }
    if (IGNORE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (depth === 0) topDirs[ent.name] = 0;
      walk(full, depth + 1);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      const lang = EXT_LANG[ext];
      if (!lang) continue;
      const { lines, bytes } = countLines(full);
      if (!stats[lang]) stats[lang] = { files: 0, lines: 0, bytes: 0 };
      stats[lang].files += 1;
      stats[lang].lines += lines;
      stats[lang].bytes += bytes;
      totalFiles += 1;
      totalLines += lines;
      totalBytes += bytes;
      // top-level dir attribution
      const rel = path.relative(ROOT, full);
      const seg = rel.split(path.sep)[0];
      if (topDirs[seg] !== undefined) topDirs[seg] += 1;
    }
  }
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function detectMeta() {
  const meta = {};
  const pkg = readJsonSafe(path.join(ROOT, 'package.json'));
  if (pkg) {
    meta.node = {
      name: pkg.name, version: pkg.version, description: pkg.description,
      scripts: Object.keys(pkg.scripts || {}),
      deps: Object.keys(pkg.dependencies || {}),
      devDeps: Object.keys(pkg.devDependencies || {}),
    };
  }
  const py = readTextSafe(path.join(ROOT, 'pyproject.toml'));
  if (py) meta.python = py.split('\n').slice(0, 40).join('\n');
  const cargo = readTextSafe(path.join(ROOT, 'Cargo.toml'));
  if (cargo) meta.rust = cargo.split('\n').slice(0, 40).join('\n');
  const gomod = readTextSafe(path.join(ROOT, 'go.mod'));
  if (gomod) meta.go = gomod.split('\n').slice(0, 20).join('\n');
  const readme = readTextSafe(path.join(ROOT, 'README.md'))
              || readTextSafe(path.join(ROOT, 'readme.md'));
  if (readme) meta.readme = readme.split('\n').slice(0, 30).join('\n');
  return meta;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function buildMarkdown(meta) {
  const lines = [];
  lines.push('# Codebase Summary');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(`_Root: \`${ROOT}\`_`);
  lines.push('');
  lines.push('## 📊 Overview');
  lines.push('');
  lines.push(`- **Total files analyzed:** ${totalFiles.toLocaleString()}`);
  lines.push(`- **Total lines of code:** ${totalLines.toLocaleString()}`);
  lines.push(`- **Total size:** ${fmtBytes(totalBytes)}`);
  lines.push('');

  lines.push('## 🧬 Languages');
  lines.push('');
  lines.push('| Language | Files | Lines | Size |');
  lines.push('|---|---:|---:|---:|');
  const sorted = Object.entries(stats).sort((a, b) => b[1].lines - a[1].lines);
  for (const [lang, s] of sorted) {
    lines.push(`| ${lang} | ${s.files} | ${s.lines.toLocaleString()} | ${fmtBytes(s.bytes)} |`);
  }
  lines.push('');

  lines.push('## 📁 Top-level directories (by file count)');
  lines.push('');
  const dirs = Object.entries(topDirs).sort((a, b) => b[1] - a[1]);
  if (dirs.length === 0) {
    lines.push('_No subdirectories detected._');
  } else {
    for (const [d, n] of dirs) lines.push(`- \`${d}/\` — ${n} files`);
  }
  lines.push('');

  if (meta.node) {
    lines.push('## 📦 Node.js project (package.json)');
    lines.push('');
    lines.push(`- **Name:** ${meta.node.name || '_unnamed_'}`);
    if (meta.node.version) lines.push(`- **Version:** ${meta.node.version}`);
    if (meta.node.description) lines.push(`- **Description:** ${meta.node.description}`);
    if (meta.node.scripts.length) {
      lines.push(`- **Scripts:** ${meta.node.scripts.map(s => `\`${s}\``).join(', ')}`);
    }
    if (meta.node.deps.length) {
      lines.push('');
      lines.push('<details><summary>Dependencies</summary>');
      lines.push('');
      lines.push(meta.node.deps.map(d => `- ${d}`).join('\n'));
      lines.push('');
      lines.push('</details>');
    }
    if (meta.node.devDeps.length) {
      lines.push('');
      lines.push('<details><summary>Dev dependencies</summary>');
      lines.push('');
      lines.push(meta.node.devDeps.map(d => `- ${d}`).join('\n'));
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
  }
  if (meta.python) {
    lines.push('## 🐍 Python project (pyproject.toml head)');
    lines.push('');
    lines.push('