12 件のファイルが見つかりました（キーワード: 既存, ui, コード調査）。

### `.claude/worktrees/funny-aryabhata/.eslint-plugin-local/code-no-test-async-suite.ts`
```ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';

function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
	return node.type === 'CallExpression';
}

function isFunctionExpression(node: TSESTree.Node): node is TSESTree.FunctionExpression {
	return node.type.includes('FunctionExpression');
}

export = new class NoAsyncSuite implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function hasAsyncSuite(node: any) {
			if (isCallExpression(node) && node.arguments.length >= 2 && isFunctionExpression(node.arguments[1]) && node.arguments[1].async) {
				return context.report({
					node: node as any,
					message: 'suite factory function should never be async'
				});
			}
		}

		return {
			['CallExpression[callee.name=/suite$/][arguments]']: hasAsyncSuite,
		};
	}
};

```

### `.claude/worktrees/funny-aryabhata/VOID_CODEBASE_GUIDE.md`
```md
# Void Codebase Guide

The Void codebase is not as intimidating as it seems!

Most of Void's code lives in the folder `src/vs/workbench/contrib/void/`.

The purpose of this document is to explain how Void's codebase works. If you want build instructions instead, see [Contributing](https://github.com/voideditor/void/blob/main/HOW_TO_CONTRIBUTE.md).









## Void Codebase Guide

### VSCode Rundown
Here's a VSCode rundown if you're just getting started with Void. You can also see Microsoft's [wiki](https://github.com/microsoft/vscode/wiki/Source-Code-Organization) for some pictures. VSCode is an Electron app. Electron runs two processes: a **main** process (for internals) and a **browser** process (browser means HTML in general, not just "web browser").
<p align="center" >
<img src="https://github.com/user-attachments/assets/eef80306-2bfe-4cac-ba15-6156f65ab3bb" alt="Credit - https://github.com/microsoft/vscode/wiki/Source-Code-Organization" width="700px">
</p>

- Code in a  `browser/` folder always lives on the browser process, and it can use `window` and other browser items.
- Code in an `electron-main/` folder always lives on the main process, and it can import `node_modules`.
- Code in `common/` can be used by either process, but doesn't get any special imports.
- The browser environment is not allowed to import `node_modules`. We came up with two workarounds:
  1. Bundle the raw node_module code to the browser - we're doing this for React.
  2. Implement the code on `electron-main/` and set up a channel between main/browser - we're doing this for sendLLMMessage.




### Terminology

Here's some terminology you might want to know about when working inside VSCode:
- An **Editor** is the thing that you type your code in. If you have 10 tabs open, that's just one editor! Editors contain tabs (or "models").
- A **Model** is an internal representation of a file's contents. It's shared between editors (for example, if you press `Cmd+\` to make a new editor, then the model of a file like `A.ts` is shared between them. Two editors, one model. That's how changes sync.).
- Each model has a **URI** it represents, like `/Users/.../my_file.txt`. (A URI or "resource" is generally just a path).
- The **Workbench** is the wrapper that contains all the editors, the terminal, the file system tree, etc.
- Usually you use the `ITextModel` type for models and the `ICodeEditor` type for editors. There aren't that many other types.
<p align="center" >
<img src="https://github.com/user-attachments/assets/6521c228-dc96-4cf5-a673-6b9ca78b9b06" alt="Credit - https://code.visualstudio.com/docs/getstarted/userinterface" width="400px">
</p>



- VSCode is organized into "**Services**". A service is just a class that mounts a single time (in computer science theory this is called a "singleton"). You can register services with `registerSingleton` so that you can easily use them in any constructor with `@<Service>`. See _dummyContrib for an example we put together on how to register them. The registration is the same every time.

- "**Actions**" are functions you register on VSCode so that either you or the user can call them later. They're also called "**Commands**".
	- You can run actions as a user by pressing Cmd+Shift+P (opens the command pallete), or you can run them internally by using the commandService to call them by ID. We use actions to register keybinding listeners like Cmd+L, Cmd+K, etc. The nice thing about actions is the user can change the keybindings.


### Internal LLM Message Pipeline

Here's a picture of all the dependencies that are relevent between the time you first send a message through Void's sidebar, and the time a request is sent to your provider.
Sending LLM messages from the main process avoids CSP issues with local providers and lets us use node_modules more easily.


<div align="center">
	<img width="100%" src="https://github.com/user-attachments/assets/9cf54dbb-82c4-4488-97a2-bd8dea890b50">
</div>



**Notes:** `modelCapabilities` is an important file that must be updated when new models come out!


### Apply

Void has two types of Apply: **Fast Apply** (uses Search/Replace, see below), and **Slow Apply** (rewrites whole file).

When you click Apply and Fast Apply is enabled, we prompt the LLM to output Search/Replace block(s) like this:
```
<<<<<<< ORIGINAL
// original code goes here
=======
// replaced code goes here
>>>>>>> UPDATED
```
This is what allows Void to quickly apply code even on 1000-line files. It's the same as asking the LLM to press Ctrl+F and enter in a search/replace query.

### Apply Inner Workings

The `editCodeService` file runs Apply. The same exact code is also used when the LLM calls the Edit tool, and when you submit Cmd+K. Just different versions of Fast/Slow Apply mode.

Here is some important terminology:
- A **DiffZone** is a {startLine, endLine} region of text where we compute and show red/green areas, or **Diffs**. Wh

... [中略 53508 文字省略] ...

ild.js`
```js
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'renderer-out');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'index.ts'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);

```

### `.claude/worktrees/funny-aryabhata/extensions/simple-browser/esbuild-preview.js`
```js
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'p
... (truncated)
```

```
