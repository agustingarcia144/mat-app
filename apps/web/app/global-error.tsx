"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border bg-background p-6">
            <h1 className="text-lg font-semibold">Algo salio mal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ocurrio un error inesperado. Puedes intentar nuevamente.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-4 rounded-md bg-foreground px-4 py-2 text-sm text-background"
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
