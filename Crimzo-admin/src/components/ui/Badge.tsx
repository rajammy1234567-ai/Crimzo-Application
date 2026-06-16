import { cn } from '../../lib/utils';
import type { BadgeVariant } from '../../types';

const variants: Record<BadgeVariant, string> = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    danger: 'bg-red-500/15 text-red-400 border-red-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    neutral: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    live: 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

interface BadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    dot?: boolean;
    className?: string;
}

export function Badge({ children, variant = 'neutral', dot, className }: BadgeProps) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
            variants[variant],
            className
        )}>
            {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
            {children}
        </span>
    );
}