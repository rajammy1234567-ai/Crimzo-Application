import { cn } from '../../lib/utils';

interface Tab {
    id: string;
    label: string;
    count?: number;
}

interface TabsProps {
    tabs: Tab[];
    active: string;
    onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
    return (
        <div className="overflow-x-auto custom-scrollbar">
            <div className="flex min-w-max bg-dark-bg border border-dark-border rounded-xl p-1 gap-1">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        active === tab.id
                            ? 'bg-crimzo text-white shadow-sm'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                >
                    {tab.label}
                    {tab.count !== undefined && (
                        <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full',
                            active === tab.id ? 'bg-white/20' : 'bg-white/10'
                        )}>
                            {tab.count}
                        </span>
                    )}
                </button>
            ))}
            </div>
        </div>
    );
}