"use client";

import * as Sentry from "@sentry/nextjs";

const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  undefined;

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  integrations: [Sentry.replayIntegration()],
  enableLogs: true,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.2,
  replaysSessionSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
