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

type Status = "idle" | "loading" | "sent" | "confirm"
type Mode = "signin" | "signup"

type LoginFormProps = {
  /** Whether Supabase is configured — passed from the server so this client component never has to re-derive it from env vars. */
  configured: boolean
}

/**
 * Password-first auth (owner direction: "I don't want to use that magic
 * link every time"):
 *
 * - SIGN IN: email + password, submit, straight to /dashboard. The magic
 *   link survives as a quiet secondary link under the button — it's the
 *   right tool for "I'm on my phone and can't remember the password", the
 *   wrong default for daily use.
 * - CREATE ACCOUNT: business name + email + password. The business name
 *   rides along as `options.data.business_name`, which the signup trigger
 *   (0001_foundation.sql handle_new_user) reads to name the new org +
 *   Business Brain — so a fresh account lands in a properly-named
 *   workspace, not "you@example".
 * - Supabase may or may not require email confirmation (dashboard
 *   setting): signUp returning a live session → go straight in; returning
 *   a user with no session → show the "confirm your email" state. Both
 *   paths handled, no assumption baked in.
 */
export function LoginForm({ configured }: LoginFormProps) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  const [mode, setMode] = useState<Mode>("signin")
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<Status>("idle")

  function switchMode(next: Mode) {
    setMode(next)
    setStatus("idle")
  }

  async function handleDemoFallback() {
    await new Promise((resolve) => setTimeout(resolve, 500))
    toast.info("Demo mode", {
      description: "Supabase isn't connected yet, so sign-in is disabled. Explore the demo instead.",
    })
    setStatus("idle")
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email || !password) return
    setStatus("loading")

    if (!configured) {
      await handleDemoFallback()
      return
    }

    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push("/dashboard")
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: businessName ? { business_name: businessName } : undefined,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error

      if (data.session) {
        toast.success("Welcome to Lumina", {
          description: businessName ? `${businessName} is ready.` : "Your workspace is ready.",
        })
        router.push("/dashboard")
        return
      }

      // No session back from signUp → the project requires email
      // confirmation before the first sign-in.
      setStatus("confirm")
      toast.success("Almost there", {
        description: `We sent a confirmation link to ${email}.`,
      })
    } catch (error) {
      setStatus("idle")
      toast.error(mode === "signin" ? "Couldn't sign in" : "Couldn't create your account", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    }
  }

  async function handleMagicLink() {
    if (!email) {
      toast.info("Enter your email first", {
        description: "Type your email above, then request the magic link.",
      })
      return
    }
    setStatus("loading")

    if (!configured) {
      await handleDemoFallback()
      return
    }

    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      })
      if (error) throw error
      setStatus("sent")
      // Toast + the MailState card swap both announce success — the toast
      // is the more reliable a11y announcement (an aria-live region).
      toast.success("Check your inbox", {
        description: `We sent a magic link to ${email}.`,
      })
    } catch (error) {
      setStatus("idle")
      toast.error("Couldn't send the link", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    }
  }

  return (
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
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Lumina</h1>
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
            <MailState
              title="Check your inbox"
              body={
                <>
                  We sent a magic link to <span className="font-medium text-foreground">{email}</span>. Click it
                  to sign in.
                </>
              }
              backLabel="Back to sign in"
              onBack={() => setStatus("idle")}
              reduceMotion={!!reduceMotion}
            />
          ) : status === "confirm" ? (
            <MailState
              title="Confirm your email"
              body={
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">{email}</span>. Click it, then sign in with your
                  password.
                </>
              }
              backLabel="Back to sign in"
              onBack={() => switchMode("signin")}
              reduceMotion={!!reduceMotion}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="business-name">Business name</Label>
                  <Input
                    id="business-name"
                    type="text"
                    required
                    autoComplete="organization"
                    placeholder="Sunrise Bakery"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                  />
                </div>
              )}

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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <Button type="submit" disabled={status === "loading"} className="w-full">
                {status === "loading" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <ArrowRight aria-hidden="true" className="size-4" />
                )}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>

              <div className="flex flex-col items-center gap-1.5">
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handleMagicLink}
                    disabled={status === "loading"}
                    className="text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    Email me a magic link instead
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                  className="text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
                </button>
              </div>
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

function MailState({
  title,
  body,
  backLabel,
  onBack,
  reduceMotion,
}: {
  title: string
  body: React.ReactNode
  backLabel: string
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
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {backLabel}
      </button>
    </div>
  )
}
