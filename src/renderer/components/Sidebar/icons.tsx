import React from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const SendIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 12l16-8-6 16-2-7-8-1z" />
  </svg>
);

export const StopIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const SparkleIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 4v6M12 14v6M4 12h6M14 12h6" />
  </svg>
);

export const ChevronIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const TrashIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export const CopyIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const RetryIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const DotIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
  </svg>
);
