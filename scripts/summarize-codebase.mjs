#!/usr/bin/env node
/**
 * summarize-codebase.mjs
 *
 * Walk the current working directory and emit a Markdown summary of the
 * codebase: language breakdown, directory layout, key manifest files,
 * largest files, and any detected entry points / scripts.
 *
 * Usage:
 *   node scripts/summarize-codebase.mjs            # writes ./CODEBASE_SUMMARY.md
 *   node scripts/summarize-codebase.mjs --stdout   # prints to stdout instead
 *   node scripts/summarize-codebase.mjs --root ../some/dir
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ROOT = path.resolve(getFlag('--root') ?? '.');
const TO_STDOUT = args.includes('--stdout');
const OUT_FILE = path.resolve(getFlag('--out') ?? path.join(ROOT, 'CODEBASE_SUMMARY.md'));

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  'coverage', '.turbo', '.cache', '.parcel-cache', '.vercel', '.svelte-kit',
  '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache',
  'target', '.idea', '.vscode', '.gradle', 'vendor',
]);

const EXT_TO_LANG = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
  '.c': 'C', '.h': 'C/C++ Header', '.cc': 'C++', '.cpp': 'C++', '.hpp': 'C++ Header',
  '.cs': 'C#', '.swift': 'Swift', '.m': 'Objective-C', '.mm': 'Objective-C++',
  '.php': 'PHP', '.lua': 'Lua', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
  '.erl': 'Erlang', '.hs': 'Haskell', '.clj': 'Clojure', '.sh': 'Shell', '.bash': 'Shell',
  '.zsh': 'Shell', '.fish': 'Shell', '.ps1': 'PowerShell',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
  '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
  '.md': 'Markdown', '.mdx': 'MDX', '.sql': 'SQL', '.graphql': 'GraphQL', '.gql': 'GraphQL',
};

const KEY_MANIFESTS = [
  'package.json', 'pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json',
  'tsconfig.json', 'jsconfig.json', 'deno.json', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Gemfile', 'composer.json', 'mix.exs', 'pubspec.yaml',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github/workflows', 'Makefile', 'CMakeLists.txt',
  'README.md', 'README', 'LICENSE', 'LICENSE.md',
];

/** @returns {Promise<{path:string, size:number, ext:string}[]>} */
async function walk(dir) {
  const out = [];
  async function recur(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        await recur(full);
      } else if (e.isFile()) {
        let stat;
        try { stat = await fs.stat(full); } catch { continue; }
        out.push({
          path: path.relative(ROOT, full),
          size: stat.size,
          ext: path.extname(e.name).toLowerCase(),
        });
      }
    }
  }
  await recur(dir);
  return out;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function readSafe(p, max = 4000) {
  try {
    const buf = await fs.readFile(path.join(ROOT, p), 'utf8');
    return buf.length > max ? buf.slice(0, max) + '\n...[truncated]' : buf;
  } catch { return null; }
}

async function detectKeyFiles() {
  const found = [];
  for (const name of KEY_MANIFESTS) {
    try {
      const st = await fs.stat(path.join(ROOT, name));
      found.push({ name, isDir: st.isDirectory() });
    } catch { /* not present */ }
  }
  return found;
}

async function summarizePackageJson() {
  const raw = await readSafe('package.json', 1024 * 50);
  if (!raw) return null;
  try {
    const pkg = JSON.parse(raw);
    return {
      name: pkg.name, version: pkg.version, description: pkg.description,
      scripts: pkg.scripts ?? {},
      deps: Object.keys(pkg.dependencies ?? {}),
      devDeps: Object.keys(pkg.devDependencies ?? {}),
      type: pkg.type, main: pkg.main, module: pkg.module, bin: pkg.bin,
    };
  } catch { return null; }
}

function topDirs(files, depth = 1) {
  const counts = new Map();
  for (const f of files) {
    const parts = f.path.split(path.sep);
    if (parts.length <= depth) continue;
    const key = parts.slice(0, depth).join('/');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function langBreakdown(files) {
  const langs = new Map();
  for (const f of files) {
    const lang = EXT_TO_LANG[f.ext] ?? (f.ext ? `Other (${f.ext})` : 'No extension');
    const cur = langs.get(lang) ?? { files: 0, bytes: 0 };
    cur.files += 1; cur.bytes += f.size;
    langs.set(lang, cur);
  }
  return [...langs.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
}

async function main() {
  const files = await walk(ROOT);
  const totalBytes = files.reduce((a, b) => a + b.size, 0);
  const langs = langBreakdown(files);
  const dirs = topDirs(files, 1);
  const keyFiles = await detectKeyFiles();
  const pkg = await summarizePackageJson();
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 15);

  const lines = [];
  lines.push(`# Codebase Summary`);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(`_Root: \`${ROOT}\`_`);
  lines.push('');
  lines.push(`## Overview`);
  lines.push(`- **Total files (tracked):** ${files.length}`);
  lines.push(`- **Total size:** ${fmtBytes(totalBytes)}`);
  if (pkg?.name) lines.push(`- **Package:** \`${pkg.name}\`${pkg.version ? ` @ ${pkg.version}` : ''}`);
  if (pkg?.description) lines.push(`- **Description:** ${pkg.description}`);
  lines.push('');

  lines.push(`## Language Breakdown`);
  lines.push('| Language | Files | Size |');
  lines.push('|---|---:|---:|');
  for (const [lang, s] of langs.slice(0, 20)) {
    lines.push(`| ${lang} | ${s.files} | ${fmtBytes(s.bytes)} |`);
  }
  lines.push('');

  lines.push(`## Top-Level Directories (by file count)`);
  lines.push('| Directory | Files |');
  lines.push('|---|---:|');
  for (const [d, c] of dirs.slice(0, 20)) lines.push(`| \`${d}/\` | ${c} |`);
  lines.push('');

  if (keyFiles.length) {
    lines.push(`## Key Manifest / Config Files`);
    for (const k of keyFiles) lines.push(`- \`${k.name}${k.isDir ? '/' : ''}\``);
    lines.push('');
  }

  if (pkg) {
    lines.push(`## package.json Highlights`);
    if (pkg.type) lines.push(`- type: \`${pkg.type}\``);
    if (pkg.main) lines.push(`- main: \`${pkg.main}\``);
    if (pkg.module) lines.push(`- module: \`${pkg.module}\``);
    const scriptKeys = Object.keys(pkg.scripts);
    if (scriptKeys.length) {
      lines.push(`- **Scripts (${scriptKeys.length}):**`);
      for (const s of scriptKeys) lines.push(`  - \`npm run ${s}\` → \`${pkg.scripts[s]}\``);
    }
    if (pkg.deps.length) lines.push(`- **dependencies (${pkg.deps.length}):** ${pkg.deps.slice(0, 30).map(d => `\`${d}\``).join(', ')}${pkg.deps.length > 30 ? ', ...' : ''}`);
    if (pkg.devDeps.length) lines.push(`- **devDependencies (${pkg.devDeps.length}):** ${pkg.devDeps.slice(0, 30).map(d => `\`${d}\``).join(', ')}${pkg.devDeps.length > 30 ? ', ...' : ''}`);
    lines.push('');
  }

  lines.push(`## Largest Files`);
  lines.push('| File | Size |');
  lines.push('|---|---:|');
  for (const f of largest) lines.push(`| \`${f.path}\` | ${fmtBytes(f.size)} |`);
  lines.push('');

  const readme = await readSafe('README.md', 2000);
  if (readme) {
    lines.push(`## README.md (excerpt)`);
    lines.push('