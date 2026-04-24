import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold text-red-600">Oops! Something went wrong.</h2>
            <p className="text-gray-600">We're sorry, but an unexpected error occurred.</p>
            <div className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
              <pre className="text-red-500 whitespace-pre-wrap">
                {this.state.error?.message}
              </pre>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
