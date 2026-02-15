/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect } from 'react';
import * as ReactDOM from 'react-dom/client'
import { _registerServices, useAccessor, useSettingsState } from './services.js';
import { ClerkProvider, useUser, useAuth } from '@clerk/clerk-react';

import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';

const CLERK_PUBLISHABLE_KEY = (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY || 'pk_live_Y2xlcmsuaGUtcm8uanAk';

// Syncs Clerk auth state to the internal ClerkService
const ClerkAuthSync = () => {
	const { isLoaded, isSignedIn, user } = useUser();
	const { sessionId } = useAuth();
	const accessor = useAccessor();
	const clerkService = accessor.get('IClerkService');
	const settingsService = accessor.get('IVoidSettingsService');

	useEffect(() => {
		if (!isLoaded) return;

		if (isSignedIn && user) {
			const clerkUser = {
				id: user.id,
				fullName: user.fullName,
				primaryEmailAddress: user.primaryEmailAddress?.emailAddress || null,
				imageUrl: user.imageUrl,
				username: user.username,
			};
			clerkService.setAuthState(clerkUser, sessionId || null);
		} else {
			// Don't auto-clear if user was previously set (could be a loading flicker)
			// Only clear if explicitly signed out
		}
	}, [isLoaded, isSignedIn, user, sessionId, clerkService, settingsService]);

	return null;
};

export const mountFnGenerator = (Component: (params: any) => React.ReactNode) => (rootElement: HTMLElement, accessor: ServicesAccessor, props?: any) => {
	if (typeof document === 'undefined') {
		console.error('index.tsx error: document was undefined')
		return
	}

	const disposables = _registerServices(accessor)

	const root = ReactDOM.createRoot(rootElement)

	const rerender = (props?: any) => {
		root.render(
			<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
				<ClerkAuthSync />
				<Component {...props} />
			</ClerkProvider>
		);
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
