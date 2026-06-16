interface LoadingStateProps {
    message?: string;
    rows?: number;
}

export function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-crimzo/30 border-t-crimzo rounded-full animate-spin" />
            <p className="text-sm text-gray-500">{message}</p>
        </div>
    );
}

export function TableSkeleton({ rows = 5 }: LoadingStateProps) {
    return (
        <div className="space-y-3 p-4">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                    <div className="h-10 bg-white/5 rounded-lg flex-1" />
                    <div className="h-10 bg-white/5 rounded-lg w-24" />
                    <div className="h-10 bg-white/5 rounded-lg w-20" />
                    <div className="h-10 bg-white/5 rounded-lg w-32" />
                </div>
            ))}
        </div>
    );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-dark-card border border-dark-border rounded-2xl p-5 animate-pulse">
                    <div className="h-32 bg-white/5 rounded-xl mb-4" />
                    <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
            ))}
        </div>
    );
}