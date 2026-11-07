/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Play, X } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { errorDetails } from '../../../../common/sendLLMMessageTypes.js';


export const ErrorDisplay = ({
	message: message_,
	fullError,
	onDismiss,
	showDismiss,
	onContinue,
	continueLabel = '続ける',
}: {
	message: string,
	fullError: Error | null,
	onDismiss: (() => void) | null,
	showDismiss?: boolean,
	/** 「続ける」: 止まったところから再開する */
	onContinue?: () => void,
	continueLabel?: string,
}) => {
	const [isExpanded, setIsExpanded] = useState(false);

	const details = errorDetails(fullError)
	const isExpandable = !!details

	const message = message_ + ''

	return (
		<div className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 overflow-auto text-[12.5px]`}>
			{/* Header */}
			<div className='flex items-start justify-between'>
				<div className='flex gap-3'>
					<AlertCircle className='h-4 w-4 text-red-600 mt-0.5 flex-shrink-0' />
					<div className='flex-1'>
						<h3 className='font-semibold text-red-800'>
							{/* eg Error */}
							Error
						</h3>
						<p className='text-red-700 mt-0.5'>
							{/* eg Something went wrong */}
							{message}
						</p>
						{onContinue && (
							<button
								type='button'
								onClick={onContinue}
								className='mt-1.5 inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[12px] font-medium'
							>
								<Play className='h-3 w-3' />
								{continueLabel}
							</button>
						)}
					</div>
				</div>

				<div className='flex gap-2'>
					{isExpandable && (
						<button className='text-red-600 hover:text-red-800 p-1 rounded'
							onClick={() => setIsExpanded(!isExpanded)}
						>
							{isExpanded ? (
								<ChevronUp className='h-5 w-5' />
							) : (
								<ChevronDown className='h-5 w-5' />
							)}
						</button>
					)}
					{showDismiss && onDismiss && (
						<button className='text-red-600 hover:text-red-800 p-1 rounded'
							onClick={onDismiss}
						>
							<X className='h-5 w-5' />
						</button>
					)}
				</div>
			</div>

			{/* Expandable Details */}
			{isExpanded && details && (
				<div className='mt-4 space-y-3 border-t border-red-200 pt-3 overflow-auto'>
					<div>
						<span className='font-semibold text-red-800'>Full Error: </span>
						<pre className='text-red-700'>{details}</pre>
					</div>
				</div>
			)}
		</div>
	);
};
