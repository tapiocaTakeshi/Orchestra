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
