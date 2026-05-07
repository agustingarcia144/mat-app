import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "./convex-provider";
import { ThemeProvider } from "./theme-provider";
import SentryProvider from "./sentry-provider";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/select-organization"
      signUpFallbackRedirectUrl="/select-organization"
      afterSignOutUrl="/"
    >
      <ConvexClientProvider>
        <SentryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </SentryProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}

export default Providers;
