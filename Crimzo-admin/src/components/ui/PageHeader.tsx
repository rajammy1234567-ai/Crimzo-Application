import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Breadcrumb {
    label: string;
    to?: string;
}

interface PageHeaderProps {
    title: string;
    description?: string;
    breadcrumbs?: Breadcrumb[];
    action?: React.ReactNode;
    stats?: { label: string; value: string | number; color?: string }[];
}

export function PageHeader({ title, description, breadcrumbs, action, stats }: PageHeaderProps) {
    return (
        <div className="mb-8">
            {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && <ChevronRight size={14} />}
                            {crumb.to ? (
                                <Link to={crumb.to} className="hover:text-crimzo transition-colors">
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className="text-gray-400">{crumb.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">{title}</h1>
                    {description && <p className="text-gray-500 mt-1 text-sm max-w-2xl">{description}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {stats && stats.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-5">
                    {stats.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border rounded-xl">
                            <span className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</span>
                            <span className={`text-sm font-bold ${s.color || 'text-white'}`}>{s.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}