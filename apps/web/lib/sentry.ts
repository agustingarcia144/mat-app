import * as Sentry from "@sentry/nextjs";

type HandledErrorContext = {
  area: string;
  action: string;
  extras?: Record<string, unknown>;
  tags?: Record<string, string>;
};

export function captureHandledError(
  error: unknown,
  context: HandledErrorContext,
) {
  Sentry.withScope((scope) => {
    scope.setTag("error_type", "handled");
    scope.setTag("error_area", context.area);
    scope.setTag("error_action", context.action);

    for (const [key, value] of Object.entries(context.tags ?? {})) {
      scope.setTag(key, value);
    }

    for (const [key, value] of Object.entries(context.extras ?? {})) {
      scope.setExtra(key, value);
    }

    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
    );
  });
}
