/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Slash commands of the IDE chat (as in OpenAI Codex): typing "/" in the chat box lists them.
 * They are handled by chatThreadService.addUserMessageAndStreamResponse, not sent to the model as is.
 */

export type ChatSlashCommand = {
	/** Including the slash, e.g. "/compact". */
	name: string
	description: string
}

export const CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
	{ name: '/compact', description: 'ここまでの会話を要約して、コンテキストを空ける' },
	{ name: '/init', description: 'このリポジトリ用の AGENTS.md (エージェント向けの手引き) を作る' },
	{ name: '/remote-control', description: 'このチャットを Orchestra Mobile と同期する' },
]

/**
 * Commands matching what is typed so far ("/", "/co" ...). Only while the box holds a single word
 * starting with "/"; null otherwise (no popup).
 */
export const matchSlashCommands = (text: string): ChatSlashCommand[] | null => {
	const t = text.trim()
	if (!/^\/[\w-]*$/.test(t) || text.includes('\n')) { return null }
	const q = t.toLowerCase()
	const hits = CHAT_SLASH_COMMANDS.filter(c => c.name.startsWith(q))
	return hits.length ? hits : null
}

export const isInitCommand = (text: string): boolean => /^\/init\s*$/i.test(text.trim())

/** What /init asks the agent to do (adapted from Codex's prompt_for_init_command.md). */
export const INIT_COMMAND_PROMPT = `Generate a file named AGENTS.md at the root of the workspace that serves as a contributor guide for coding agents and people working on this repository.
Before writing, check whether AGENTS.md already exists there. If it does, do not overwrite it: tell me what you would add instead.
Explore the repository first (structure, package/build files, test setup, linters, CI config, recent git history) so every statement is specific to this project.

Document requirements:
- Title it "Repository Guidelines" and use Markdown headings.
- Keep it concise (200-400 words), direct and specific to this repository, with examples (commands, paths, naming patterns).
- Write it in the language I use with you.

Recommended sections (omit what does not apply, add what matters):
- Project structure & module organization: where source, tests and assets live.
- Build, test and development commands: the key commands and what each does.
- Coding style & naming conventions: indentation, formatting and lint tools, naming patterns.
- Testing guidelines: frameworks, how to run tests, naming conventions.
- Commit & pull request guidelines: conventions seen in the git history.
- Optionally: security & configuration tips, architecture overview, agent-specific instructions.`
