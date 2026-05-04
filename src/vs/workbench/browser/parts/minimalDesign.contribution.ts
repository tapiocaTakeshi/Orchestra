/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Side-effect import: pulls the Minimal Design stylesheet into the workbench bundle.
// The CSS is registered via VS Code's standard CSS loader (esbuild / loader plugin),
// so simply importing the file is enough to apply the design overlay globally.
import '../media/minimal-design.css';

// No runtime contributions are required: this module exists purely so the
// stylesheet participates in the workbench build graph and is shipped with the app.
//
// If at some point a feature flag is desired (e.g. `workbench.experimental.minimalDesign`),
// it can be wired up here by toggling a `data-minimal-design` attribute on
// `document.body` and scoping the CSS selectors accordingly.
