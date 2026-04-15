"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

const TypedNextThemesProvider = NextThemesProvider as React.ComponentType<
  React.ComponentProps<typeof NextThemesProvider> & {
    children?: React.ReactNode;
  }
>;

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & {
  children?: React.ReactNode;
}) {
  return (
    <TypedNextThemesProvider {...props}>{children}</TypedNextThemesProvider>
  );
}
