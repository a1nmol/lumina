"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
