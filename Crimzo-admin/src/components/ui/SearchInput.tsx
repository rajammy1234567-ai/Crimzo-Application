import { Search, X } from 'lucide-react';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onSearch?: () => void;
    placeholder?: string;
    className?: string;
}

export function SearchInput({ value, onChange, onSearch, placeholder = 'Search...', className }: SearchInputProps) {
    return (
        <div className={`relative ${className || ''}`}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch?.()}
                placeholder={placeholder}
                className="w-full pl-9 pr-9 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-crimzo/50 transition-colors"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}