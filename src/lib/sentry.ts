import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (dsn) {
    Sentry.init({
      dsn: dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      // Performance Monitoring
      tracesSampleRate: import.meta.env.PROD ? 0.05 : 1.0, 
      // Session Replay
      replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.dev ? "development" : "production",
    });
    console.log("Sentry initialized");
  } else {
    console.warn("Sentry DSN not found, skipping initialization");
  }
}
