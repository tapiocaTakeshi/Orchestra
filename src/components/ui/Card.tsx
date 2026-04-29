import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border border-border rounded bg-background',
        'p-6 sm:p-8',
        'transition-colors duration-200 hover:border-foreground/40',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-lg font-semibold tracking-tight mb-2', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-sm text-muted leading-relaxed', className)}>
      {children}
    </p>
  );
}
