"use client"

// Client form for the closing conversion zone (formerly section 14 · THE
// PILOT MENU, landing-copy.md §14). Calls the saveEarlyAccessLead server
// action; success renders Wick celebrating (one-shot) + a receipt-styled
// toast, per brand-redesign-plan.md §5.11. Now rendered directly on the
// chalkboard card (no white sub-card wrapper), so labels use
// chalkboard-foreground for contrast and fields go side-by-side on sm+.

import { useId, useState, type FormEvent } from "react"
import { Loader2, Store } from "lucide-react"
import { toast } from "sonner"

import { saveEarlyAccessLead } from "@/app/(marketing)/actions"
import { Wick } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status = "idle" | "submitting" | "success" | "error"

export function PilotMenuForm() {
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const nameId = useId()
  const emailId = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === "submitting") return

    setStatus("submitting")
    setErrorMessage(null)

    try {
      const result = await saveEarlyAccessLead(businessName, email)
      if (result.ok) {
        setStatus("success")
        toast.success("Seat saved — we'll be in touch.")
        return
      }

      setStatus("error")
      setErrorMessage(
        result.error === "rate_limited"
          ? "Too many attempts — please try again in a minute."
          : result.error === "invalid"
            ? "Please check your business name and email."
            : "Something went wrong. Please try again."
      )
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Wick state="celebrating" size={64} />
        <div className="relative w-full max-w-[220px] rounded-sm border border-border bg-card px-4 py-3 font-mono text-xs shadow-raised">
          <div
            aria-hidden="true"
            className="mb-2 h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]"
          />
          <p className="font-semibold text-foreground">Seat saved.</p>
          <p className="mt-1 text-muted-foreground">We&rsquo;ll be in touch.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-chalkboard-foreground">
          Business name
        </Label>
        <Input
          id={nameId}
          name="businessName"
          autoComplete="organization"
          required
          maxLength={200}
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Sunrise Bakery"
          disabled={status === "submitting"}
          className="bg-background"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={emailId} className="text-chalkboard-foreground">
          Email
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@yourshop.com"
          disabled={status === "submitting"}
          className="bg-background"
        />
      </div>

      {status === "error" && errorMessage && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        variant="flame"
        size="lg"
        className="h-11 sm:col-span-2"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? (
          <>
            <Loader2 aria-hidden="true" data-icon="inline-start" className="size-4 animate-spin" />
            Saving your seat…
          </>
        ) : (
          <>
            <Store aria-hidden="true" data-icon="inline-start" className="size-4" />
            Save my seat
          </>
        )}
      </Button>

      <p className="text-center text-xs text-chalkboard-foreground/60 sm:col-span-2">
        Limited seats per city — free during the pilot.
      </p>
    </form>
  )
}
