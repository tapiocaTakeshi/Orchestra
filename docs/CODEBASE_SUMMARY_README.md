# Codebase Summarizer

`scripts/summarize_codebase.py` walks the project tree and produces a Markdown
report (`CODEBASE_SUMMARY.md` by default) covering:

1. Overview (file count, total lines, total size)
2. Languages breakdown (by extension)
3. Directory tree (configurable depth)
4. Key project files detected at the root (README, package.json, pyproject.toml, etc.)
5. Dependencies (`package.json`, `requirements*.txt`, `pyproject.toml`)
6. Top-20 largest files by line count
7. First 40 lines of the README

## Usage

