"use client"

// "Ask for reviews" wizard — a small 3-step flow (channel → preview message
// → send) reusing the Business Brain wizard's pill-progress shell pattern
// (src/app/(app)/settings/brain/brain-wizard.tsx), scaled down to fit a
// Dialog. See docs/design-briefs/phase-3-analytics-reviews.md "Review
// generation: simple 3-step wizard".

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, Copy, Link2, MessageSquareText, QrCode, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { duration, easing, fadeUp } from "@/lib/motion"
import type { BusinessBrain } from "@/lib/types"
import { cn } from "@/lib/utils"

type ReviewChannel = "sms" | "qr" | "link"

const CHANNEL_OPTIONS: {
  value: ReviewChannel
  label: string
  description: string
  icon: typeof MessageSquareText
}[] = [
  {
    value: "sms",
    label: "Text message",
    description: "Send a review request to customers by SMS.",
    icon: MessageSquareText,
  },
  {
    value: "qr",
    label: "QR code",
    description: "Print or display a code customers can scan in-store.",
    icon: QrCode,
  },
  {
    value: "link",
    label: "Direct link",
    description: "Copy a link to share anywhere — email, social, receipts.",
    icon: Link2,
  },
]

const STEP_LABELS = ["Channel", "Message", "Send"]

// Demo-scale placeholder — a real deployment would resolve a Google/Facebook
// short review link once listings are connected (MASTER_PLAN.md §4.F,
// [V2] Google Business posting/listings) and a real contact count from the
// CRM (filtered to consented phone numbers).
const DEMO_RECIPIENT_COUNT = 24
const COPIED_RESET_MS = 2000

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "your-business"
  )
}

function buildReviewLink(businessName: string | null): string {
  return `https://loc.al/r/${slugify(businessName ?? "your-business")}`
}

function buildDefaultMessage(businessName: string | null, link: string): string {
  const name = businessName ?? "us"
  return `Loved your visit to ${name}? We'd be grateful for a quick review: ${link}`
}

interface ReviewRequestDialogProps {
  businessBrain: BusinessBrain
}

export function ReviewRequestDialog({ businessBrain }: ReviewRequestDialogProps) {
  const link = buildReviewLink(businessBrain.business_name)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [channel, setChannel] = useState<ReviewChannel | null>(null)
  const [message, setMessage] = useState(() => buildDefaultMessage(businessBrain.business_name, link))
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const reduceMotion = useReducedMotion()

  function reset() {
    setStep(0)
    setChannel(null)
    setMessage(buildDefaultMessage(businessBrain.business_name, link))
    setCopied(false)
    setSent(false)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) window.setTimeout(reset, 200) // let the close animation finish before resetting
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Link copied")
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error("Couldn't copy automatically — select the link and copy manually.")
    }
  }

  function handlePrimaryAction() {
    if (channel === "sms") {
      toast.success(`Would send to ${DEMO_RECIPIENT_COUNT} customers`, {
        description: "SMS review requests aren't wired up to a live provider yet.",
      })
      setSent(true)
    } else if (channel === "link") {
      void handleCopyLink()
      setSent(true)
    }
  }

  const canContinue = step === 0 ? channel !== null : step === 1 ? message.trim().length > 0 : true
  const isLastStep = step === STEP_LABELS.length - 1

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <Sparkles aria-hidden="true" data-icon="inline-start" />
        Ask for reviews
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask for reviews</DialogTitle>
          <DialogDescription>
            Reach out to happy customers and turn great visits into public reviews.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
                transition={{ duration: reduceMotion ? 0 : duration.base, ease: easing.out }}
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduceMotion ? false : fadeUp.initial}
              animate={fadeUp.animate}
              exit={reduceMotion ? undefined : fadeUp.exit}
              transition={reduceMotion ? { duration: 0 } : fadeUp.transition}
              className="min-h-44"
            >
              {step === 0 && (
                <div role="radiogroup" aria-label="Review request channel" className="flex flex-col gap-2">
                  {CHANNEL_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const selected = channel === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setChannel(option.value)}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </span>
                        {selected && (
                          <Check aria-hidden="true" className="ml-auto size-4 shrink-0 self-center text-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="review-request-message" className="text-xs font-medium text-muted-foreground">
                    Message preview
                  </label>
                  <Textarea
                    id="review-request-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="min-h-28 resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefilled from your Business Brain&apos;s tone — edit freely before sending.
                  </p>
                </div>
              )}

              {step === 2 && channel && (
                <ResultStep
                  channel={channel}
                  message={message}
                  link={link}
                  copied={copied}
                  sent={sent}
                  onCopyLink={handleCopyLink}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {!isLastStep ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continue
            </Button>
          ) : channel === "qr" ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <Button type="button" onClick={handlePrimaryAction} className="gap-1.5">
              <Send aria-hidden="true" className="size-3.5" />
              {channel === "sms" ? "Send" : "Copy link"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResultStep({
  channel,
  message,
  link,
  copied,
  sent,
  onCopyLink,
}: {
  channel: ReviewChannel
  message: string
  link: string
  copied: boolean
  sent: boolean
  onCopyLink: () => void
}) {
  if (channel === "qr") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
        {/* Real QR rendering lands later with a dedicated lib — this is a styled placeholder frame, per the design brief's DECISION. */}
        <div className="flex size-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-foreground/20 bg-card p-3">
          <QrCode aria-hidden="true" className="size-10 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">QR preview</span>
        </div>
        <p className="max-w-xs text-xs break-all text-muted-foreground">{link}</p>
        <Button type="button" variant="outline" size="sm" onClick={onCopyLink} className="gap-1.5">
          {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
          Copy link
        </Button>
      </div>
    )
  }

  if (channel === "sms") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-muted/40 p-3 text-sm text-foreground">{message}</div>
        <p className="text-xs text-muted-foreground">
          Sending to <span className="font-medium text-foreground">{DEMO_RECIPIENT_COUNT} customers</span> with a
          phone number on file (demo count — not wired to a live provider yet).
        </p>
        {sent && (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <Check aria-hidden="true" className="size-4" />
            Sent (demo) — {DEMO_RECIPIENT_COUNT} customers would receive this text.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
        <Link2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-foreground">{link}</span>
      </div>
      {sent || copied ? (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <Check aria-hidden="true" className="size-4" />
          Link copied — paste it anywhere.
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Click &quot;Copy link&quot; to grab it.</p>
      )}
    </div>
  )
}
