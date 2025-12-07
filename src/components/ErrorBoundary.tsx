// src/components/ErrorBoundary.tsx

"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  // Log errors to your error tracking service (e.g., Sentry)
  logErrorToService = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      // Example: Send to your backend
      await fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }),
      });
    } catch (e) {
      console.error('Failed to log error:', e);
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Show different UI based on error count
      const isRecurringError = this.state.errorCount > 2;

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-center mb-2">
              {isRecurringError ? 'Persistent Error Detected' : 'Something went wrong'}
            </h2>
            
            <p className="text-gray-400 text-center mb-6">
              {isRecurringError 
                ? "This error keeps occurring. Please try reloading the page or contact support if the problem persists."
                : "We're sorry, but something unexpected happened. Please try again."}
            </p>

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-4 bg-gray-900 rounded border border-gray-700 overflow-auto max-h-48">
                <p className="text-xs font-mono text-red-400 mb-2">
                  <strong>Error:</strong> {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Error Count Warning */}
            {this.state.errorCount > 1 && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-200">
                <p className="font-medium">⚠️ Error occurred {this.state.errorCount} times</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {!isRecurringError && (
                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                  Try Again
                </button>
              )}

              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Reload Page
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                <Home className="w-5 h-5" />
                Go to Home
              </button>
            </div>

            {/* Support Info */}
            <div className="mt-6 pt-4 border-t border-gray-700 text-center">
              <p className="text-sm text-gray-400">
                Need help?{' '}
                <a 
                  href="mailto:support@auraiq.com" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Contact Support
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simplified error fallback component for smaller boundaries
export const SimpleErrorFallback: React.FC<{ error?: Error; resetError?: () => void }> = ({ 
  error, 
  resetError 
}) => (
  <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-red-200 mb-1">Error loading component</h3>
        {error && (
          <p className="text-sm text-gray-400 mb-2">{error.message}</p>
        )}
        {resetError && (
          <button
            onClick={resetError}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  </div>
);

// Message-specific error fallback
export const MessageErrorFallback: React.FC = () => (
  <div className="my-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-sm text-gray-300">
    <p className="flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-red-500" />
      Unable to display this message
    </p>
  </div>
);

// Chat error fallback with retry
export const ChatErrorFallback: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
    <div className="w-16 h-16 mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
      <AlertTriangle className="w-8 h-8 text-red-500" />
    </div>
    <h3 className="text-xl font-semibold text-white mb-2">Chat Error</h3>
    <p className="text-gray-400 mb-4 max-w-md">
      There was a problem loading the chat. This might be a temporary issue.
    </p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    )}
  </div>
);

export default ErrorBoundary;