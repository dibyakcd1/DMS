import React, { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
          <div className="w-20 h-20 bg-destructive/10 rounded-3xl flex items-center justify-center text-destructive mb-6">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-2">Something went wrong</h1>
          <p className="text-muted-foreground text-sm max-w-xs mb-8">
            The application encountered an unexpected error. Don't worry, your data is safe.
          </p>
          <div className="flex flex-col w-full max-w-xs gap-3">
            <Button 
              className="rounded-2xl h-14 font-bold" 
              onClick={() => window.location.reload()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reload Application
            </Button>
            <Button 
              variant="outline" 
              className="rounded-2xl h-14 font-bold"
              onClick={() => window.location.href = "/"}
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Home
            </Button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mt-12 p-4 bg-muted rounded-xl text-left overflow-auto max-w-xl w-full">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Debug Info</p>
              <pre className="text-[10px] font-mono text-destructive leading-tight">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
