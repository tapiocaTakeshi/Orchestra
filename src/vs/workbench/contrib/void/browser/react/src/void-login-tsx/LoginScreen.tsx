/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { useIsDark } from '../util/services.js';
import { X } from 'lucide-react';

export const LoginScreen = ({ onClose }: { onClose: () => void }) => {
	const isDark = useIsDark();
	const { sessionId } = useAuth();

	// If already signed in, we can close the screen
	React.useEffect(() => {
		if (sessionId) {
			onClose();
		}
	}, [sessionId, onClose]);

	const [isSigningUp, setIsSigningUp] = React.useState(false);

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000] p-4">
				<div className="bg-void-bg-1 border border-void-border-1 rounded-xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col items-center p-8 gap-6 animate-in fade-in zoom-in duration-300">

					<button
						onClick={onClose}
						className="absolute top-4 right-4 text-void-fg-3 hover:text-void-fg-1 p-1 rounded-md transition-colors"
					>
						<X size={20} />
					</button>

					<div className="text-center flex flex-col gap-2">
						<h1 className="text-2xl font-bold bg-gradient-to-r from-[#0e70c0] to-blue-400 bg-clip-text text-transparent">
							Welcome to Orchestra
						</h1>
						<p className="text-sm text-void-fg-3">
							Sign in to sync your projects and access shared AI configurations.
						</p>
					</div>

					<div className="w-full flex justify-center">
						{isSigningUp ? (
							<SignUp
								appearance={{
									elements: {
										card: "bg-transparent shadow-none border-none p-0",
										headerTitle: "hidden",
										headerSubtitle: "hidden",
										socialButtonsBlockButton: "bg-void-bg-2 border border-void-border-2 text-void-fg-1 hover:bg-void-bg-3",
										formButtonPrimary: "bg-[#0e70c0] hover:bg-[#1177cb] text-sm",
										footerActionText: "text-void-fg-3",
										footerActionLink: "text-[#0e70c0] hover:text-[#1177cb]",
										formFieldLabel: "text-void-fg-2",
										formFieldInput: "bg-void-bg-2 border-void-border-2 text-void-fg-1",
										identityPreviewText: "text-void-fg-1",
										identityPreviewEditButtonIcon: "text-void-fg-3",
									}
								}}
							/>
						) : (
							<SignIn
								appearance={{
									elements: {
										card: "bg-transparent shadow-none border-none p-0",
										headerTitle: "hidden",
										headerSubtitle: "hidden",
										socialButtonsBlockButton: "bg-void-bg-2 border border-void-border-2 text-void-fg-1 hover:bg-void-bg-3",
										formButtonPrimary: "bg-[#0e70c0] hover:bg-[#1177cb] text-sm",
										footerActionText: "text-void-fg-3",
										footerActionLink: "text-[#0e70c0] hover:text-[#1177cb]",
										formFieldLabel: "text-void-fg-2",
										formFieldInput: "bg-void-bg-2 border-void-border-2 text-void-fg-1",
										identityPreviewText: "text-void-fg-1",
										identityPreviewEditButtonIcon: "text-void-fg-3",
									}
								}}
							/>
						)}
					</div>

					<div className="text-xs text-void-fg-3 mt-2">
						{isSigningUp ? (
							<>Already have an account? <button onClick={() => setIsSigningUp(false)} className="text-[#0e70c0] font-medium hover:underline">Sign In</button></>
						) : (
							<>New to Orchestra? <button onClick={() => setIsSigningUp(true)} className="text-[#0e70c0] font-medium hover:underline">Create an account</button></>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
