/*--------------------------------------------------------------------------------------
 *  Orchestra Logo Button - Dropdown menu for view switching
 *--------------------------------------------------------------------------------------*/

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Workflow, Wrench, GitBranch, Music } from 'lucide-react';

export type SidebarTab = 'chat' | 'pipeline' | 'builder' | 'thoughts' | 'conductor';

export const tabConfig: { id: SidebarTab; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
	{ id: 'chat', icon: MessageSquare, label: 'Chat' },
	{ id: 'pipeline', icon: Workflow, label: 'Pipeline' },
	{ id: 'builder', icon: Wrench, label: 'Builder' },
	{ id: 'thoughts', icon: GitBranch, label: 'Thoughts' },
	{ id: 'conductor', icon: Music, label: 'Conductor' },
];

export const OrchestraLogoButton = ({ activeTab, onTabChange }: { activeTab: SidebarTab; onTabChange: (tab: SidebarTab) => void }) => {
	const [isOpen, setIsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const logoPath = 'data:image/png;base64,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';

	// Close menu on outside click
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			if (menuRef.current && !menuRef.current.contains(target) && buttonRef.current && !buttonRef.current.contains(target)) {
				setIsOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen]);

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-void-bg-2 transition-colors"
				title="Switch view"
			>
				<img src={logoPath} alt="Orchestra" className="w-6 h-6 object-contain" />
			</button>

			{isOpen && (
				<div
					ref={menuRef}
					className="absolute left-0 top-full mt-1 z-50 min-w-[160px] py-1 bg-void-bg-1 border border-void-border-3 rounded-lg shadow-lg"
				>
					{tabConfig.map(tab => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								onClick={() => {
									onTabChange(tab.id);
									setIsOpen(false);
								}}
								className={`
									w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors
									${isActive
										? 'text-void-fg-1 bg-void-bg-2'
										: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2/60'}
								`}
							>
								<Icon size={14} />
								<span>{tab.label}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};
