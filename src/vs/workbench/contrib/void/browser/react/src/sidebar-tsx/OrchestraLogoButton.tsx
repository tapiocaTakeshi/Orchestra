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
	const logoPath = new URL('../assets/orchestra_nonbackground.png', import.meta.url).href;

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
				<img src={logoPath} alt="Orchestra" className="w-5 h-5 object-contain" />
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
