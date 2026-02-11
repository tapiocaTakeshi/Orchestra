/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import * as ReactDOM from 'react-dom/client'
import { _registerServices } from './services.js';
import { ClerkProvider } from '@clerk/clerk-react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_bmVhdC1zbmFrZS0zOS5jbGVyay5hY2NvdW50cy5kZXYk'

if (!PUBLISHABLE_KEY) {
	console.warn('Missing Clerk Publishable Key')
}

import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';

export const mountFnGenerator = (Component: (params: any) => React.ReactNode) => (rootElement: HTMLElement, accessor: ServicesAccessor, props?: any) => {
	if (typeof document === 'undefined') {
		console.error('index.tsx error: document was undefined')
		return
	}

	const disposables = _registerServices(accessor)

	const root = ReactDOM.createRoot(rootElement)

	const rerender = (props?: any) => {
		const content = <Component {...props} />

		if (PUBLISHABLE_KEY) {
			root.render(
				<ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
					{content}
				</ClerkProvider>
			);
		} else {
			root.render(content);
		}
	}
	const dispose = () => {
		root.unmount();
		disposables.forEach(d => d.dispose());
	}

	rerender(props)

	const returnVal = {
		rerender,
		dispose,
	}
	return returnVal
}
