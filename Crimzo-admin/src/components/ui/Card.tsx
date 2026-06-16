import { cn } from '../../lib/utils';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
    return (
        <div className={cn(
            'bg-dark-card border border-dark-border rounded-2xl shadow-sm',
            padding && 'p-6',
            className
        )}>
            {children}
        </div>
    );
}

interface CardHeaderProps {
    title: string;
    description?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}

export function CardHeader({ title, description, action, icon }: CardHeaderProps) {
    return (
        <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
                {icon && (
                    <div className="p-2 rounded-xl bg-crimzo/10 text-crimzo shrink-0">
                        {icon}
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
                </div>
            </div>
            {action}
        </div>
    );
}