import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Block Clash ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-[#070B14] text-[#F1F5F9]">
          <div className="w-full max-w-md rounded-2xl border border-[#233252] bg-[#0F172A] p-6 text-center space-y-4">
            <h1 className="font-display text-2xl font-bold">Connection Interrupted</h1>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              Something went wrong while syncing the arena. Reload to return cleanly to the main
              menu.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 px-5 rounded-xl bg-[#00F0FF] text-[#04101B] font-display font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload Arena</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
