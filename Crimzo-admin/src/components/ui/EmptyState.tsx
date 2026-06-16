import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-dark-border flex items-center justify-center mb-4">
                <Icon size={24} className="text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
            {description && <p className="text-sm text-gray-500 max-w-sm">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}