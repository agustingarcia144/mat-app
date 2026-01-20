import React from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import ConvexClientProvider from './convex-provider'
import { ThemeProvider } from './theme-provider'

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
        <ConvexClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </ConvexClientProvider>
    </ClerkProvider>
  )
}

export default Providers