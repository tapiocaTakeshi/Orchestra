/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// A Skill is a folder containing a SKILL.md file with YAML frontmatter (name, description)
// followed by a Markdown body. The body is only given to the model when it decides to use
// the skill (based on the name/description shown to it up front), keeping unused skills
// out of the context window.

export type Skill = {
	slug: string, // sanitized folder name, used to build the tool name
	title: string, // human-readable name, from frontmatter `name:` (falls back to slug)
	description: string, // frontmatter `description:`, shown to the model so it knows when to use this skill
	content: string, // markdown body (after frontmatter), given to the model when it uses the skill
	status: 'success' | 'error',
	error?: string,
}

export interface SkillOfName {
	[slug: string]: Skill;
}
