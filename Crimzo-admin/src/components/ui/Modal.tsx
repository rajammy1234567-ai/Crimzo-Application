import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
    footer?: React.ReactNode;
}

const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className={cn(
                'relative w-full bg-dark-card border border-dark-border rounded-2xl shadow-2xl animate-fade-in',
                sizeMap[size]
            )}>
                <div className="flex items-start justify-between p-6 border-b border-dark-border">
                    <div>
                        <h2 className="text-xl font-bold text-white">{title}</h2>
                        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6">{children}</div>
                {footer && (
                    <div className="flex items-center justify-end gap-3 p-6 border-t border-dark-border bg-dark-bg/50 rounded-b-2xl">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}