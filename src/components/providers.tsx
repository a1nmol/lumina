"use client"

import { WickMomentsProvider } from "@/components/brand/wick"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light" enableSystem disableTransitionOnChange>
      <ServiceWorkerRegister />
      <WickMomentsProvider>{children}</WickMomentsProvider>
      <Toaster />
    </ThemeProvider>
  )
}
