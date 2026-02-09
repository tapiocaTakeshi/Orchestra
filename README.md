# 🎵 Orchestra

<div align="center">
	<img
		src="./src/vs/workbench/browser/parts/editor/media/slice_of_void.png"
	 	alt="Orchestra"
		width="300"
	 	height="300"
	/>
</div>

**Orchestra** is an AI IDE powered by the [Division API](https://api.division.he-ro.jp).

Send a single prompt, and Orchestra's multi-agent orchestration automatically assigns the optimal AI model for each task — search, planning, coding, and review — delivering a unified result.

## Features

- 🧠 **Division API Integration** — 38+ AI models across 6 providers (Anthropic, Google, OpenAI, Perplexity, xAI, DeepSeek), orchestrated automatically
- 🎭 **Role-Based AI** — Each task gets the best model: Claude for coding, Perplexity for search, Gemini for planning, GPT for review
- ⚡ **Agent Mode** — AI agents that can edit files, run terminal commands, and manage your project
- 🔄 **All Existing IDE Features** — Full VS Code compatibility with extensions, debugging, and git

## Built On

Orchestra is built on [Void Editor](https://github.com/voideditor/void), which is a fork of [VS Code](https://github.com/microsoft/vscode).

## Division API

Orchestra uses the Division API (`https://api.division.he-ro.jp`) for AI orchestration. See [DIVISION-API.md](./DIVISION-API.md) for full documentation.
