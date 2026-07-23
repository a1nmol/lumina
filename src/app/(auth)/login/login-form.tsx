"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"
import { ArrowRight, Loader2, Mail, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { duration, easing, springGentle } from "@/lib/motion"

type Status = "idle" | "loading" | "sent"

type LoginFormProps = {
  /** Whether Supabase is configured — passed from the server so this client component never has to re-derive it from env vars. */
  configured: boolean
}

export function LoginForm({ configured }: LoginFormProps) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [usePassword, setUsePassword] = useState(false)
  const [status, setStatus] = useState<Status>("idle")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    setStatus("loading")

    if (!configured) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      toast.info("Demo mode", {
        description:
          "Supabase isn't connected yet, so sign-in is disabled. Explore the demo instead.",
      })
      setStatus("idle")
      return
    }

    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()

      if (usePassword) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push("/dashboard")
        return
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      })
      if (error) throw error
      setStatus("sent")
      // Toast + the SuccessState card swap both announce success (matches
      // the codebase pattern of pairing an in-place UI change with a toast,
      // e.g. reminder-button.tsx, enable-push-button.tsx) — the toast is
      // the more reliable a11y announcement (an aria-live region) since the
      // card swap alone isn't guaranteed to be announced by every AT.
      toast.success("Check your inbox", {
        description: `We sent a magic link to ${email}.`,
      })
    } catch (error) {
      setStatus("idle")
      toast.error("Couldn't sign in", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    }
  }

  return (
    // Scene-locked dusk register (brand-redesign-plan.md §7 "the login
    // aurora, replaced by the signature shader") — the shader always paints
    // the dusk sky regardless of the visitor's light/dark preference, so the
    // Light-first (owner direction): the sign-in scene uses the same
    // "Morning on Main Street" daylight treatment as the marketing hero —
    // paper surface, soft morning-sky wash, faint grain. Theme tokens are
    // NOT scene-locked here, so users who toggle dark mode in the app get
    // a dark sign-in too (their choice, not ours).
    <div className="relative flex min-h-svh flex-1 items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden="true" className="morning-sky pointer-events-none absolute inset-0 z-0" />
      <div aria-hidden="true" className="paper-grain pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[var(--chart-2)] text-primary-foreground shadow-glow">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              LocalOS
            </h1>
            {!configured && <Badge variant="secondary">Demo mode</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Content that gets customers. A front desk that never misses one.
          </p>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: easing.out }}
          className="rounded-3xl bg-card p-6 shadow-overlay ring-1 ring-foreground/10 sm:p-8"
        >
          {status === "sent" ? (
            <SuccessState
              email={email}
              onBack={() => setStatus("idle")}
              reduceMotion={!!reduceMotion}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@yourbusiness.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {usePassword && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              )}

              <Button type="submit" disabled={status === "loading"} className="w-full">
                {status === "loading" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <ArrowRight aria-hidden="true" className="size-4" />
                )}
                {usePassword ? "Sign in" : "Send magic link"}
              </Button>

              <button
                type="button"
                onClick={() => setUsePassword((value) => !value)}
                className="text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {usePassword ? "Use a magic link instead" : "Use a password instead"}
              </button>
            </form>
          )}
        </motion.div>

        {!configured && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/dashboard")}>
              Explore the demo
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function SuccessState({
  email,
  onBack,
  reduceMotion,
}: {
  email: string
  onBack: () => void
  reduceMotion: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <motion.span
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : springGentle}
        className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success"
      >
        <Mail aria-hidden="true" className="size-5" />
      </motion.span>
      <h2 className="text-base font-medium text-foreground">Check your inbox</h2>
      <p className="text-sm text-muted-foreground">
        We sent a magic link to{" "}
        <span className="font-medium text-foreground">{email}</span>. Click it to sign in.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        Use a different email
      </button>
    </div>
  )
}
