"use client"

// Real QR codes, rendered as inline SVG so they stay crisp at any size and
// pick up the current text color (works in light + dark without a re-render).
// See MASTER_PLAN.md §4.F "QR tools [MVP]".
//
// We compute the module bitmap synchronously via `qrcode`'s `create()` (no
// canvas/DOM dependency) and turn it into a single stroked path using the
// same run-length-encoded "one horizontal line per row-run" technique the
// `qrcode` package's own SVG renderer uses (lib/renderer/svg-tag.js) — a
// single <path> is far cheaper to paint than one <rect> per module.

import { useId, useMemo } from "react"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"

/** Quiet zone around the code, in QR modules — keeps scanners happy. */
const QUIET_ZONE_MODULES = 1

function buildQrPath(data: Uint8Array, size: number, margin: number): string {
  let path = ""
  let moveBy = 0
  let newRow = false
  let lineLength = 0

  for (let i = 0; i < data.length; i++) {
    const col = i % size
    const row = Math.floor(i / size)

    if (!col && !newRow) newRow = true

    if (data[i]) {
      lineLength++

      if (!(i > 0 && col > 0 && data[i - 1])) {
        path += newRow ? `M${col + margin} ${0.5 + row + margin}` : `m${moveBy} 0`
        moveBy = 0
        newRow = false
      }

      if (!(col + 1 < size && data[i + 1])) {
        path += `h${lineLength}`
        lineLength = 0
      }
    } else {
      moveBy++
    }
  }

  return path
}

interface QrCodeProps {
  /** The URL/text the code encodes. */
  value: string
  /** Rendered pixel size (square). */
  size?: number
  /** Optional caption shown under the code. */
  label?: string
  /** Required — screen readers can't scan a QR code, so always describe the destination. */
  ariaLabel: string
  className?: string
  errorCorrectionLevel?: "L" | "M" | "Q" | "H"
}

/** Themed, crisp, inline SVG QR code — foreground follows `currentColor`, background is transparent. */
export function QrCode({
  value,
  size = 128,
  label,
  ariaLabel,
  className,
  errorCorrectionLevel = "M",
}: QrCodeProps) {
  const titleId = useId()

  const { path, dimension } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel })
    return {
      path: buildQrPath(qr.modules.data, qr.modules.size, QUIET_ZONE_MODULES),
      dimension: qr.modules.size + QUIET_ZONE_MODULES * 2,
    }
  }, [value, errorCorrectionLevel])

  return (
    <figure className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${dimension} ${dimension}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="text-foreground"
      >
        <title id={titleId}>{ariaLabel}</title>
        <path d={path} stroke="currentColor" strokeWidth={1} fill="none" />
      </svg>
      {label && <figcaption className="text-xs text-muted-foreground">{label}</figcaption>}
    </figure>
  )
}

/**
 * Renders `value` to a PNG and triggers a browser download. Uses fixed
 * black-on-white colors (not `currentColor`) regardless of app theme — this
 * output is meant for print/display, where scan reliability matters more
 * than matching the current color scheme.
 */
export async function downloadQrPng(value: string, filename: string, pixelSize = 512): Promise<void> {
  const dataUrl = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: pixelSize,
    color: { dark: "#000000ff", light: "#ffffffff" },
  })

  const link = document.createElement("a")
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
