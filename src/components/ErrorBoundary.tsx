import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Global ErrorBoundary] Uncaught error caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    // Hard reload as fallback to clean memory state
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4 font-sans text-zinc-900 dark:text-zinc-100">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Application Error</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  An unexpected error occurred in the application view.
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200/80 dark:border-zinc-800 p-4 rounded-2xl text-sm">
              <p className="font-semibold text-red-600 dark:text-red-400 font-mono text-xs break-all">
                {this.state.error?.toString() || 'Unknown error occurred'}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg hover:shadow-blue-600/25 active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                Reload / Retry Application
              </button>

              <button
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="w-full flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-1"
              >
                <span>{this.state.showDetails ? 'Hide technical details' : 'Show technical details'}</span>
                {this.state.showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {this.state.showDetails && this.state.errorInfo && (
                <div className="bg-zinc-950 text-zinc-300 p-3 rounded-xl font-mono text-[11px] max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
                  <pre className="whitespace-pre-wrap break-all">{this.state.errorInfo.componentStack}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
