/*---------------------------------------------------------------------------------------------
 *  Launches the local Division API dev server (a sibling `division` checkout, see
 *  DIVISION_API_PATH) as a child process on Orchestra startup, so `npm run dev` in the
 *  Division repo does not need to be run by hand alongside Orchestra.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { existsSync } from 'fs';
import * as http from 'http';
import { join, resolve } from '../../../base/common/path.js';
import { cwd } from '../../../base/common/process.js';

let divisionApiProcess: ChildProcess | undefined;

function resolveDivisionApiRoot(): string | undefined {
	const configured = process.env['DIVISION_API_PATH'];
	const candidate = configured ? resolve(configured) : resolve(cwd(), '..', 'division');

	return existsSync(join(candidate, 'src', 'index.ts')) ? candidate : undefined;
}

function isDivisionApiRunning(port: number): Promise<boolean> {
	return new Promise(resolveResult => {
		const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 800 }, res => {
			res.resume();
			resolveResult(res.statusCode === 200);
		});
		req.on('error', () => resolveResult(false));
		req.on('timeout', () => {
			req.destroy();
			resolveResult(false);
		});
	});
}

/**
 * Fire-and-forget: starts the Division API locally if a sibling checkout is
 * found (override with DIVISION_API_PATH) and nothing is already listening
 * on DIVISION_API_PORT (default 3000).
 */
export async function launchDivisionApiIfAvailable(): Promise<void> {
	const port = Number(process.env['DIVISION_API_PORT']) || 3000;

	if (await isDivisionApiRunning(port)) {
		console.log(`[division-api] already running on port ${port}, skipping local launch`);
		return;
	}

	const divisionRoot = resolveDivisionApiRoot();
	if (!divisionRoot) {
		console.log('[division-api] source not found (set DIVISION_API_PATH or place a sibling "division" checkout next to Orchestra); skipping local launch');
		return;
	}

	console.log(`[division-api] starting local server from ${divisionRoot}`);

	divisionApiProcess = fork(join(divisionRoot, 'src', 'index.ts'), [], {
		cwd: divisionRoot,
		execArgv: ['-r', 'ts-node/register'],
		env: { ...process.env, PORT: String(port) },
		stdio: 'inherit',
	});

	divisionApiProcess.on('exit', (code, signal) => {
		console.log(`[division-api] process exited (code=${code}, signal=${signal})`);
		divisionApiProcess = undefined;
	});

	divisionApiProcess.on('error', err => {
		console.error('[division-api] failed to start:', err);
	});
}

export function stopDivisionApi(): void {
	divisionApiProcess?.kill();
	divisionApiProcess = undefined;
}
