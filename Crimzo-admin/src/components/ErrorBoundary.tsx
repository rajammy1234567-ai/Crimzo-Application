import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, message: error.message };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Admin panel render error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[40vh] flex flex-col items-center justify-center text-center px-6">
                    <p className="text-red-400 font-semibold mb-2">Something went wrong on this page</p>
                    <p className="text-sm text-gray-500 max-w-md mb-4">
                        {this.state.message || 'An unexpected error occurred while rendering.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.assign('/dashboard')}
                        className="px-4 py-2 rounded-xl bg-crimzo text-white text-sm font-medium hover:opacity-90"
                    >
                        Back to Dashboard
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}