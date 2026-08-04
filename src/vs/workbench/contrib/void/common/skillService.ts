/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { InternalToolInfo } from './prompt/prompts.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { SkillUserStateOfName } from './voidSettingsTypes.js';
import { RawMCPToolCall } from './mcpServiceTypes.js';
import { Skill, SkillOfName } from './skillServiceTypes.js';

type SkillServiceState = {
	skillOfName: SkillOfName,
	error: string | undefined, // global scanning error
}

export interface ISkillService {
	readonly _serviceBrand: undefined;
	revealSkillsFolder(): Promise<void>;
	toggleSkillIsOn(skillName: string, isOn: boolean): Promise<void>;

	readonly state: SkillServiceState; // NOT persisted
	onDidChangeState: Event<void>;

	// only enabled skills are exposed as tools to the model
	getSkillTools(): InternalToolInfo[] | undefined;
	callSkillTool(toolName: string): RawMCPToolCall;
}

export const ISkillService = createDecorator<ISkillService>('skillService');


const SKILLS_FOLDER_NAME = 'skills';
const SKILL_FILE_NAME = 'SKILL.md';
export const SKILL_TOOL_NAME_PREFIX = 'skill_';

const README_FILE_NAME = 'README.md';
const README_CONTENT = `\
# Skills

Each subfolder here that contains a \`SKILL.md\` file is a Skill: a reusable set of \
instructions the AI agent can load into context when it decides it's relevant.

## Format

\`\`\`
skills/
  my-skill/
    SKILL.md
\`\`\`

\`SKILL.md\` must start with YAML frontmatter giving a name and description, followed by \
the actual instructions as Markdown:

\`\`\`markdown
---
name: My Skill
description: What this skill does and when the agent should use it.
---

# My Skill

Step-by-step instructions, reference material, or examples go here. This entire file is \
given to the agent as context whenever it decides to use the skill.
\`\`\`

The \`description\` is shown to the agent up front (like a tool description), so make it \
specific about when the skill applies. The rest of the file is only loaded when the agent \
actually uses the skill, so it won't take up context otherwise.

Skills can be turned on/off from Orchestra's Settings page.
`;

const SAMPLE_SKILL_FOLDER_NAME = 'example-skill';
const SAMPLE_SKILL_CONTENT = `---
name: Example Skill
description: An example skill. Replace this description with one that tells the agent exactly when to use this skill, then edit the instructions below (or delete this folder).
---

# Example Skill

Write step-by-step instructions, reference material, or examples here. This entire file
is given to the agent as context whenever it decides to use this skill.
`;


const slugify = (name: string): string => {
	const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
	return slug || 'skill'
}

const parseSkillFile = (slug: string, raw: string): Skill => {
	const frontmatterMatch = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/)
	if (!frontmatterMatch) {
		return { slug, title: slug, description: '', content: raw.trim(), status: 'error', error: `SKILL.md must start with YAML frontmatter, e.g.:\n---\nname: My Skill\ndescription: ...\n---` }
	}
	const [, frontmatter, body] = frontmatterMatch

	const fields: { [key: string]: string } = {}
	for (const line of frontmatter.split(/\r?\n/)) {
		const m = line.match(/^([a-zA-Z0-9_-]+):[ \t]*(.*)$/)
		if (m) fields[m[1].trim().toLowerCase()] = m[2].trim().replace(/^['"]|['"]$/g, '')
	}

	const title = fields['name'] || slug
	const description = fields['description'] || ''
	const content = body.trim()

	if (!description) {
		return { slug, title, description, content, status: 'error', error: `SKILL.md frontmatter is missing a "description" field.` }
	}

	return { slug, title, description, content, status: 'success' }
}


class SkillService extends Disposable implements ISkillService {
	_serviceBrand: undefined;

	state: SkillServiceState = {
		skillOfName: {},
		error: undefined,
	}

	private readonly _onDidChangeState = new Emitter<void>();
	public readonly onDidChangeState = this._onDidChangeState.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IEditorService private readonly editorService: IEditorService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
		this._initialize();
	}

	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState;

			const skillsFolderUri = await this._getSkillsFolderUri();
			const folderExists = await this.fileService.exists(skillsFolderUri);
			if (!folderExists) {
				await this._createSkillsFolderWithSample(skillsFolderUri);
			}

			this._register(this.fileService.watch(skillsFolderUri, { recursive: true, excludes: [] }));
			this._register(this.fileService.onDidFilesChange(async e => {
				if (!e.affects(skillsFolderUri)) return
				await this._refreshSkills();
			}));

			await this._refreshSkills();
		} catch (error) {
			console.error('Error initializing SkillService:', error);
		}
	}

	private async _createSkillsFolderWithSample(skillsFolderUri: URI): Promise<void> {
		await this.fileService.createFolder(skillsFolderUri);
		await this.fileService.writeFile(URI.joinPath(skillsFolderUri, README_FILE_NAME), VSBuffer.fromString(README_CONTENT));
		await this.fileService.createFolder(URI.joinPath(skillsFolderUri, SAMPLE_SKILL_FOLDER_NAME));
		await this.fileService.writeFile(URI.joinPath(skillsFolderUri, SAMPLE_SKILL_FOLDER_NAME, SKILL_FILE_NAME), VSBuffer.fromString(SAMPLE_SKILL_CONTENT));
	}

	private async _getSkillsFolderUri(): Promise<URI> {
		const appName = this.productService.dataFolderName
		const userHome = await this.pathService.userHome();
		return URI.joinPath(userHome, appName, SKILLS_FOLDER_NAME);
	}

	public async revealSkillsFolder(): Promise<void> {
		try {
			const skillsFolderUri = await this._getSkillsFolderUri();
			const readmeUri = URI.joinPath(skillsFolderUri, README_FILE_NAME);
			await this.editorService.openEditor({
				resource: readmeUri,
				options: {
					pinned: true,
					revealIfOpened: true,
				}
			});
		} catch (error) {
			console.error('Error opening skills folder:', error);
		}
	}

	private async _refreshSkills(): Promise<void> {
		let newSkillOfName: SkillOfName = {}
		try {
			const skillsFolderUri = await this._getSkillsFolderUri();
			const stat = await this.fileService.resolve(skillsFolderUri);
			const subfolders = (stat.children ?? []).filter(c => c.isDirectory);

			const usedSlugs = new Set<string>();
			for (const folder of subfolders) {
				const skillFileUri = URI.joinPath(folder.resource, SKILL_FILE_NAME);
				if (!(await this.fileService.exists(skillFileUri))) continue

				let slug = slugify(folder.name);
				while (usedSlugs.has(slug)) slug = `${slug}_`
				usedSlugs.add(slug)

				try {
					const fileContent = await this.fileService.readFile(skillFileUri);
					newSkillOfName[slug] = parseSkillFile(slug, fileContent.value.toString());
				} catch (error) {
					newSkillOfName[slug] = { slug, title: folder.name, description: '', content: '', status: 'error', error: `Error reading ${SKILL_FILE_NAME}: ${error}` }
				}
			}

			this._setHasError(undefined)
		} catch (error) {
			this._setHasError(`Error scanning skills folder: ${error}`)
			return
		}

		// carry over isOn state for newly-discovered / removed skills
		const oldSlugs = Object.keys(this.state.skillOfName)
		const newSlugs = Object.keys(newSkillOfName)
		const addedSlugs = newSlugs.filter(s => !oldSlugs.includes(s))
		const removedSlugs = oldSlugs.filter(s => !newSlugs.includes(s))

		const addedUserStateOfName: SkillUserStateOfName = {}
		for (const slug of addedSlugs) addedUserStateOfName[slug] = { isOn: true }
		await this.voidSettingsService.addSkillUserStateOfNames(addedUserStateOfName);
		await this.voidSettingsService.removeSkillUserStateOfNames(removedSlugs);

		this.state = { ...this.state, skillOfName: newSkillOfName }
		this._onDidChangeState.fire();
	}

	private readonly _setHasError = (errMsg: string | undefined) => {
		this.state = { ...this.state, error: errMsg }
		this._onDidChangeState.fire();
	}

	public async toggleSkillIsOn(skillName: string, isOn: boolean): Promise<void> {
		await this.voidSettingsService.setSkillState(skillName, { isOn });
		this._onDidChangeState.fire();
	}

	public getSkillTools(): InternalToolInfo[] | undefined {
		const { skillUserStateOfName } = this.voidSettingsService.state
		const tools: InternalToolInfo[] = []
		for (const slug in this.state.skillOfName) {
			const skill = this.state.skillOfName[slug]
			if (skill.status !== 'success') continue
			if (skillUserStateOfName[slug]?.isOn === false) continue
			tools.push({
				name: `${SKILL_TOOL_NAME_PREFIX}${slug}`,
				description: `Use the "${skill.title}" skill: ${skill.description}`,
				params: {},
				mcpServerName: skill.title, // reused purely for display (e.g. "Called <skill title>")
			})
		}
		if (tools.length === 0) return undefined
		return tools
	}

	public callSkillTool(toolName: string): RawMCPToolCall {
		const slug = toolName.startsWith(SKILL_TOOL_NAME_PREFIX) ? toolName.slice(SKILL_TOOL_NAME_PREFIX.length) : toolName
		const skill = this.state.skillOfName[slug]
		if (!skill || skill.status !== 'success') {
			return { toolName, event: 'error', text: `Skill "${slug}" was not found.` }
		}
		return { toolName, event: 'text', text: skill.content }
	}
}

registerSingleton(ISkillService, SkillService, InstantiationType.Eager);
