"use client"

import { useEffect, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// "LocalOS · 9:41 PM" receipt header (see .receipt-toast in globals.css).
// Recomputed on an interval rather than once so a toast opened at 11:58pm
// doesn't sit there reading the wrong hour a minute later.
function formatReceiptStamp() {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date()
  )
}

function useReceiptStamp() {
  const [stamp, setStamp] = useState(formatReceiptStamp)
  useEffect(() => {
    const id = window.setInterval(() => setStamp(formatReceiptStamp()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return stamp
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const receiptStamp = useReceiptStamp()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--receipt-time": `"${receiptStamp}"`,
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast receipt-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
