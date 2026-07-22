"use client"

import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ServiceWorkerRegister />
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
