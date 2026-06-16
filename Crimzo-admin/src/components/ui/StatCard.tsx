import { cn, formatNumber } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: number;
    icon: LucideIcon;
    colorClass: string;
    subtitle?: string;
    trend?: { value: number; label: string };
    onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, colorClass, subtitle, trend, onClick }: StatCardProps) {
    return (
        <div
            className={cn(
                'bg-dark-card border border-dark-border rounded-2xl p-5 flex flex-col gap-4 transition-all',
                onClick && 'cursor-pointer hover:border-crimzo/30 hover:shadow-lg hover:shadow-crimzo/5'
            )}
            onClick={onClick}
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
                    {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
                </div>
                <div className={cn('p-2.5 rounded-xl', colorClass)}>
                    <Icon size={20} />
                </div>
            </div>
            <div>
                <p className="text-3xl font-bold text-white tabular-nums">{formatNumber(value)}</p>
                {trend && (
                    <p className="text-xs text-gray-500 mt-1">
                        <span className="text-emerald-400 font-medium">+{trend.value}</span> {trend.label}
                    </p>
                )}
            </div>
        </div>
    );
}