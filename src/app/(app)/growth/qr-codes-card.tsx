"use client"

// One calm "QR codes" card on the Growth page — three ready-made codes
// (review, booking, chat widget) each downloadable as a PNG for print/
// display. Not a builder tool: no customization, just the links the org
// already has. See MASTER_PLAN.md §4.F "QR tools [MVP]".

import { Download, QrCode as QrCodeIcon } from "lucide-react"
import { toast } from "sonner"

import { QrCode, downloadQrPng } from "@/components/qr-code"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"

interface QrCodesCardProps {
  reviewLink: string
  bookingLink: string
  chatLink: string
}

export function QrCodesCard({ reviewLink, bookingLink, chatLink }: QrCodesCardProps) {
  const items = [
    {
      id: "review",
      label: "Review link",
      description: "Print on receipts or table tents to collect reviews.",
      value: reviewLink,
    },
    {
      id: "booking",
      label: "Booking link",
      description: "Scan to start a booking conversation with your FrontDesk agent.",
      value: bookingLink,
    },
    {
      id: "chat",
      label: "Chat widget",
      description: "Scan to open a chat with your AI FrontDesk.",
      value: chatLink,
    },
  ] as const

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <QrCodeIcon />
          </CardIcon>
          <CardTitle>QR codes</CardTitle>
        </div>
        <CardDescription>
          Ready-made codes for print, table tents, or receipts — download and go.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {items.map(({ id, ...item }) => (
            <QrCodeItem key={id} {...item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function QrCodeItem({
  label,
  description,
  value,
}: {
  label: string
  description: string
  value: string
}) {
  async function handleDownload() {
    try {
      const filename = `${label.toLowerCase().replace(/\s+/g, "-")}-qr.png`
      await downloadQrPng(value, filename)
      toast.success("QR code downloaded")
    } catch {
      toast.error("Couldn't generate the QR download — try again.")
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4 text-center transition-colors hover:bg-muted/30">
      <QrCode value={value} size={112} ariaLabel={`QR code linking to ${label.toLowerCase()}: ${value}`} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
        <Download aria-hidden="true" className="size-3.5" />
        Download PNG
      </Button>
    </div>
  )
}
