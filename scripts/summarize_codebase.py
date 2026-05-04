#!/usr/bin/env python3
"""
summarize_codebase.py
---------------------
ワークスペース直下を走査して、コードベースの概要を Markdown
(CODEBASE_SUMMARY.md) として出力するユーティリティ。

- 言語別ファイル数 / 行数（コード・コメント・空行を簡易区別）
- ディレクトリツリー（深さ制限つき）
- 主要設定ファイル（package.json / pyproject.toml / Cargo.toml 等）の検出
- 大きなファイル TOP N
- TODO / FIXME / XXX マーカーの集計

使い方:
    python3 scripts/summarize_codebase.py [--root .] [--out CODEBASE_SUMMARY.md]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Tuple

# ---- 設定 ---------------------------------------------------------------

# 言語判定用拡張子マップ
EXT_LANG: Dict[str, str] = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".c": "C",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".scala": "Scala",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".fish": "Shell",
    ".lua": "Lua",
    ".pl": "Perl",
    ".r": "R",
    ".dart": "Dart",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".less": "Less",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".md": "Markdown",
    ".rst": "reStructuredText",
    ".sql": "SQL",
    ".graphql": "GraphQL",
    ".gql": "GraphQL",
    ".dockerfile": "Dockerfile",
    ".tf": "Terraform",
}

# 無視するディレクトリ
IGNORE_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "bower_components",
    ".venv", "venv", "env", ".env",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "dist", "build", "out", ".next", ".nuxt", ".turbo", ".cache",
    "target",          # Rust / Java
    "vendor",          # Go / PHP
    ".idea", ".vscode",
    "coverage", ".nyc_output",
    ".gradle",
}

# 無視するファイル名パターン
IGNORE_FILE_RE = re.compile(
    r"(?:^\.DS_Store$|^Thumbs\.db$|\.lock$|\.min\.(?:js|css)$|\.map$|"
    r"\.png$|\.jpe?g$|\.gif$|\.webp$|\.ico$|\.svg$|\.pdf$|"
    r"\.zip$|\.gz$|\.tar$|\.7z$|\.rar$|"
    r"\.mp4$|\.mp3$|\.wav$|\.mov$|"
    r"\.woff2?$|\.ttf$|\.eot$|\.otf$)",
    re.IGNORECASE,
)

# 行コメントマーカー（言語ごと、コメント行カウント用の簡易判定）
LINE_COMMENT: Dict[str, Tuple[str, ...]] = {
    "Python": ("#",),
    "Ruby": ("#",),
    "Shell": ("#",),
    "Perl": ("#",),
    "R": ("#",),
    "YAML": ("#",),
    "TOML": ("#",),
    "Dockerfile": ("#",),
    "Terraform": ("#", "//"),
}
# それ以外の C 系言語は // をコメントとみなす
C_LIKE = {
    "JavaScript", "JavaScript (React)", "TypeScript", "TypeScript (React)",
    "Java", "Kotlin", "Swift", "C", "C++", "C/C++ Header", "C++ Header",
    "C#", "PHP", "Scala", "Go", "Rust", "Dart", "GraphQL", "Vue", "Svelte",
}

CONFIG_FILES = [
    "package.json", "pnpm-workspace.yaml", "yarn.lock", "pnpm-lock.yaml",
    "package-lock.json", "tsconfig.json", "jsconfig.json",
    "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile",
    "Cargo.toml", "go.mod", "Gemfile", "composer.json", "build.gradle",
    "pom.xml", "Makefile", "Dockerfile", "docker-compose.yml",
    ".github/workflows", "README.md", "README.rst", "LICENSE",
]

TODO_RE = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b[: ]?(.*)")

# ---- データクラス -------------------------------------------------------

@dataclass
class LangStat:
    files: int = 0
    code: int = 0
    comments: int = 0
    blanks: int = 0
    bytes_: int = 0

    @property
    def total(self) -> int:
        return self.code + self.comments + self.blanks


@dataclass
class Summary:
    root: Path
    lang_stats: Dict[str, LangStat] = field(default_factory=lambda: defaultdict(LangStat))
    big_files: List[Tuple[Path, int]] = field(default_factory=list)
    todos: List[Tuple[Path, int, str, str]] = field(default_factory=list)
    config_found: List[str] = field(default_factory=list)
    total_files: int = 0
    total_dirs: int = 0


# ---- 解析ロジック -------------------------------------------------------

def detect_language(path: Path) -> str | None:
    name = path.name.lower()
    if name == "dockerfile":
        return "Dockerfile"
    if name == "makefile":
        return "Makefile"
    return EXT_LANG.get(path.suffix.lower())


def is_comment(line: str, lang: str) -> bool:
    s = line.lstrip()
    if not s:
        return False
    markers = LINE_COMMENT.get(lang)
    if markers is None and lang in C_LIKE:
        markers = ("//",)
    if markers is None:
        return False
    return s.startswith(markers)


def count_lines(path: Path, lang: str) -> Tuple[int, int, int, int]:
    """code, comments, blanks, bytes を返す"""
    try:
        data = path.read_bytes()
    except OSError:
        return 0, 0, 0, 0
    bytes_ = len(data)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = data.decode("latin-1")
        except Exception:
            return 0, 0, 0, bytes_
    code = comments = blanks = 0
    for line in text.splitlines():
        if not line.strip():
            blanks += 1
        elif is_comment(line, lang):
            comments += 1
        else:
            code += 1
    return code, comments, blanks, bytes_


def scan_todos(path: Path, lang: str) -> List[Tuple[int, str, str]]:
    found: List[Tuple[int, str, str]] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f, 1):
                m = TODO_RE.search(line)
                if m:
                    found.append((i, m.group(1), m.group(2).strip()[:120]))
                if i > 5000:  # 巨大ファイルは打ち切り
                    break
    except OSError:
        pass
    return found


def walk(root: Path) -> Summary:
    summary = Summary(root=root)
    for dirpath, dirnames, filenames in os.walk(root):
        # 無視ディレクトリを除外（in-place 編集が os.walk の流儀）
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        summary.total_dirs += 1
        for fn in filenames:
            if IGNORE_FILE_RE.search(fn):
                continue
            full = Path(dirpath) / fn
            if full.is_symlink():
                continue
            summary.total_files += 1
            lang = detect_language(full)
            if lang is None:
                continue
            code, comments, blanks, bytes_ = count_lines(full, lang)
            stat = summary.lang_stats[lang]
            stat.files += 1
            stat.code += code
            stat.comments += comments
            stat.blanks += blanks
            stat.bytes_ += bytes_
            summary.big_files.append((full, code + comments + blanks))
            for ln, kind, msg in scan_todos(full, lang):
                summary.todos.append((full, ln, kind, msg))

    # 設定ファイル検出
    for cf in CONFIG_FILES:
        p = root / cf
        if p.exists():
            summary.config_found.append(cf)

    summary.big_files.sort(key=lambda x: x[1], reverse=True)
    summary.big_files = summary.big_files[:15]
    return summary


# ---- ツリー描画 ---------------------------------------------------------

def render_tree(root: Path, max_depth: int = 2, max_entries: int = 40) -> str:
    lines: List[str] = [f"{root.name or root}/"]

    def _walk(dir_: Path, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(
                [e for e in dir_.iterdir()
                 if e.name not in IGNORE_DIRS and not e.name.startswith(".")],
                key=lambda p: (p.is_file(), p.name.lower()),
            )
        except OSError:
            return
        if len(entries) > max_entries:
            entries = entries[:max_entries] + [Path("...(truncated)")]
        for i, e in enumerate(entries):
            connector = "└── " if i == len(entries) - 1 else "├── "
            if e.name == "...(truncated)":
                lines.append(f"{prefix}{connector}...")
                continue
            suffix = "/" if e.is_dir() else ""
            lines.append(f"{prefix}{connector}{e.name}{suffix}")
            if e.is_dir():
                ext = "    " if i == len(entries) - 1 else "│   "
                _walk(e, prefix + ext, depth + 1)

    _walk(root, "", 1)
    return "\n".join(lines)


# ---- レポート出力 -------------------------------------------------------

def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}" if unit != "B" else f"{n}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def render_markdown(s: Summary) -> str:
    out: List[str] = []
    out.append(f"# Codebase Summary\n")
    out.append(f"- Root: `{s.root.resolve()}`")
    out.append(f"- Scanned files: **{s.total_files}** in **{s.total_dirs}** directories")
    out.append(f"- Recognized source files: **{sum(v.files for v in s.lang_stats.values())}**\n")

    # 言語別統計
    out.append("## Language breakdown\n")
    out.append("| Language | Files | Code | Comments | Blanks | Total | Size |")
    out.append("|---|---:|---:|---:|---:|---:|---:|")
    rows = sorted(s.lang_stats.items(), key=lambda kv: kv[1].code, reverse=True)
    for lang, st in rows:
        out.append(
            f"| {lang} | {st.files} | {st.code} | {st.comments} | {st.blanks} "
            f"| {st.total} | {human_bytes(st.bytes_)} |"
        )
    if not rows:
        out.append("| _(no recognized source files)_ |  |  |  |  |  |  |")

    # ディレクトリツリー
    out.append("\n## Directory tree (depth ≤ 2)\n")
    out.append("