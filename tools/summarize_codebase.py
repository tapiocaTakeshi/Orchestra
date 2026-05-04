#!/usr/bin/env python3
"""
summarize_codebase.py

Walk the current workspace and emit a human-readable summary of the codebase
to stdout and to CODEBASE_SUMMARY.md.

Usage:
    python tools/summarize_codebase.py [root]
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

# --- Configuration ---------------------------------------------------------

IGNORE_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "venv", ".venv", "env", ".env",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "dist", "build", "out", ".next", ".nuxt", ".turbo",
    "target", ".gradle", ".idea", ".vscode",
    "coverage", ".cache",
}

IGNORE_FILE_SUFFIXES = {
    ".lock", ".min.js", ".min.css", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".pdf", ".zip", ".gz", ".tar", ".7z",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp3", ".mp4", ".mov", ".wav",
}

LANG_BY_EXT = {
    ".py": "Python", ".pyi": "Python",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java", ".kt": "Kotlin", ".scala": "Scala",
    ".c": "C", ".h": "C",
    ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".hpp": "C++", ".hh": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".swift": "Swift",
    ".m": "Objective-C", ".mm": "Objective-C++",
    ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
    ".ps1": "PowerShell",
    ".sql": "SQL",
    ".html": "HTML", ".htm": "HTML",
    ".css": "CSS", ".scss": "SCSS", ".sass": "Sass", ".less": "Less",
    ".vue": "Vue", ".svelte": "Svelte",
    ".md": "Markdown", ".mdx": "Markdown",
    ".yml": "YAML", ".yaml": "YAML",
    ".json": "JSON", ".jsonc": "JSON",
    ".toml": "TOML",
    ".xml": "XML",
    ".dockerfile": "Dockerfile",
    ".tf": "Terraform",
}

META_FILES = [
    "README.md", "README.rst", "README.txt", "README",
    "package.json", "pnpm-workspace.yaml", "lerna.json",
    "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile",
    "Cargo.toml", "go.mod", "Gemfile", "composer.json",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "Makefile", "CMakeLists.txt",
    "tsconfig.json", "next.config.js", "next.config.mjs",
    "vite.config.ts", "vite.config.js",
    ".github/workflows",
    "LICENSE", "LICENSE.md",
]

MAX_TREE_ENTRIES_PER_DIR = 40
MAX_TREE_DEPTH = 4


# --- Helpers ---------------------------------------------------------------

def is_ignored_dir(name: str) -> bool:
    return name in IGNORE_DIRS or (name.startswith(".") and name not in {".github"})

def is_ignored_file(path: Path) -> bool:
    name = path.name
    if name.startswith("."):
        # Allow common dotfiles we care about
        if name not in {".gitignore", ".dockerignore", ".env.example"}:
            return True
    suffix = "".join(path.suffixes[-2:]).lower() if path.suffixes else ""
    if path.suffix.lower() in IGNORE_FILE_SUFFIXES:
        return True
    if suffix in IGNORE_FILE_SUFFIXES:
        return True
    return False

def detect_language(path: Path) -> str | None:
    if path.name.lower() == "dockerfile":
        return "Dockerfile"
    if path.name.lower() == "makefile":
        return "Makefile"
    return LANG_BY_EXT.get(path.suffix.lower())

def safe_count_lines(path: Path) -> int:
    try:
        with path.open("rb") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0

def walk(root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not is_ignored_dir(d))
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            if not is_ignored_file(p):
                yield p


# --- Analysis --------------------------------------------------------------

def analyze(root: Path) -> dict:
    file_count = 0
    total_bytes = 0
    by_lang_files: Counter[str] = Counter()
    by_lang_lines: Counter[str] = Counter()
    by_ext: Counter[str] = Counter()
    largest: list[tuple[int, Path]] = []

    for p in walk(root):
        try:
            size = p.stat().st_size
        except OSError:
            continue
        file_count += 1
        total_bytes += size
        ext = p.suffix.lower() or "(none)"
        by_ext[ext] += 1
        lang = detect_language(p)
        if lang:
            lines = safe_count_lines(p)
            by_lang_files[lang] += 1
            by_lang_lines[lang] += lines
        largest.append((size, p))

    largest.sort(reverse=True)
    largest = largest[:10]

    meta_present = []
    for m in META_FILES:
        candidate = root / m
        if candidate.exists():
            meta_present.append(m)

    return {
        "root": str(root),
        "file_count": file_count,
        "total_bytes": total_bytes,
        "by_lang_files": dict(by_lang_files.most_common()),
        "by_lang_lines": dict(by_lang_lines.most_common()),
        "by_ext": dict(by_ext.most_common(20)),
        "largest": [(s, str(p.relative_to(root))) for s, p in largest],
        "meta_present": meta_present,
    }


def render_tree(root: Path, max_depth: int = MAX_TREE_DEPTH) -> str:
    lines: list[str] = [root.name + "/"]

    def _walk(dir_path: Path, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = [e for e in dir_path.iterdir()
                       if not (e.is_dir() and is_ignored_dir(e.name))
                       and not (e.is_file() and is_ignored_file(e))]
        except OSError:
            return
        entries.sort(key=lambda e: (e.is_file(), e.name.lower()))
        if len(entries) > MAX_TREE_ENTRIES_PER_DIR:
            shown = entries[:MAX_TREE_ENTRIES_PER_DIR]
            truncated = len(entries) - len(shown)
        else:
            shown = entries
            truncated = 0

        for i, entry in enumerate(shown):
            last = (i == len(shown) - 1) and truncated == 0
            connector = "└── " if last else "├── "
            label = entry.name + ("/" if entry.is_dir() else "")
            lines.append(prefix + connector + label)
            if entry.is_dir():
                extension = "    " if last else "│   "
                _walk(entry, prefix + extension, depth + 1)
        if truncated:
            lines.append(prefix + f"└── … (+{truncated} more)")

    _walk(root, "", 1)
    return "\n".join(lines)


def read_head(path: Path, n: int = 30) -> str:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            return "".join([next(fh, "") for _ in range(n)]).rstrip()
    except OSError:
        return ""


def summarize_meta(root: Path, meta_present: list[str]) -> str:
    chunks: list[str] = []
    if "README.md" in meta_present or "README" in meta_present or "README.rst" in meta_present:
        for cand in ("README.md", "README.rst", "README.txt", "README"):
            p = root / cand
            if p.exists():
                chunks.append(f"### {cand} (head)\n\n