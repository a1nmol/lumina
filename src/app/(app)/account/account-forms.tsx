"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { KeyRound, Loader2, Mail, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * The three personal-account cards: Profile (display name), Email, and
 * Password. Conventions (Linear/Notion/Vercel settings pattern): one
 * stacked card per concern, each with its own explicit Save — never one
 * mega-form, never auto-save for credential fields.
 *
 * Supabase specifics baked in:
 * - Name lives in user_metadata.full_name (updateUser({ data })); the
 *   sidebar chip + Command Center greeting read it, so we router.refresh()
 *   after saving.
 * - Email change triggers Supabase's double-confirmation flow (links sent
 *   to BOTH the old and new address by default) — the card says so
 *   plainly instead of pretending it's instant.
 * - Password change re-authenticates with the CURRENT password first
 *   (signInWithPassword) even though updateUser doesn't require it —
 *   standard expectation, and it turns "wrong current password" into a
 *   clear error instead of silently letting any open session rotate the
 *   credential.
 */
export function AccountForms({
  configured,
  email,
  initialFullName,
}: {
  configured: boolean
  email: string
  initialFullName: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <ProfileCard configured={configured} initialFullName={initialFullName} />
      <EmailCard configured={configured} email={email} />
      <PasswordCard configured={configured} email={email} />
    </div>
  )
}

function demoToast() {
  toast.info("Demo mode", {
    description: "Supabase isn't connected, so account changes are disabled here.",
  })
}

// The one shared card convention (ui/card.tsx's CardIcon chip) — matches
// every settings/growth/voice card so Account reads like the same family
// instead of its own bespoke shell.
function CardShell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="max-w-2xl rounded-2xl shadow-raised ring-1 ring-border/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardIcon>
            <Icon />
          </CardIcon>
          {/* Real <h2>, not CardTitle's div (review fix): this page had proper
              headings before the shared-card migration — keep the outline for
              screen readers. Styling matches CardTitle exactly. */}
          <CardTitle asChild>
            <h2>{title}</h2>
          </CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ProfileCard({ configured, initialFullName }: { configured: boolean; initialFullName: string }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialFullName)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured) return demoToast()
    setSaving(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient().auth.updateUser({
        data: { full_name: fullName.trim() },
      })
      if (error) throw error
      toast.success("Name saved", { description: "The dock and your greeting now use it." })
      // Sidebar chip + Command Center greeting are server-rendered from
      // user_metadata — refresh so they pick the new name up immediately.
      router.refresh()
    } catch (error) {
      toast.error("Couldn't save your name", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardShell
      icon={UserRound}
      title="Profile"
      description="How Lumina greets you — your name, not your business's."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            type="text"
            autoComplete="name"
            placeholder="Anmol Subedi"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="sm:w-auto">
          {saving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          Save name
        </Button>
      </form>
    </CardShell>
  )
}

function EmailCard({ configured, email }: { configured: boolean; email: string }) {
  const [newEmail, setNewEmail] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured) return demoToast()
    if (!newEmail || newEmail === email) return
    setSaving(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const { error } = await createClient().auth.updateUser({ email: newEmail })
      if (error) throw error
      toast.success("Confirm the change from your inbox", {
        description: `Confirmation links were sent to ${email} and ${newEmail}. The change applies once confirmed.`,
      })
      setNewEmail("")
    } catch (error) {
      toast.error("Couldn't start the email change", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardShell
      icon={Mail}
      title="Email"
      description={`You sign in as ${email}. Changing it requires confirming from both inboxes.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            placeholder="new@yourbusiness.com"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving || !newEmail} className="sm:w-auto">
          {saving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          Change email
        </Button>
      </form>
    </CardShell>
  )
}

function PasswordCard({ configured, email }: { configured: boolean; email: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured) return demoToast()
    if (newPassword.length < 8) {
      toast.error("Password too short", { description: "Use at least 8 characters." })
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match", { description: "Retype the new password in both fields." })
      return
    }
    setSaving(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()

      // Re-authenticate before rotating the credential — see the file-top
      // note. A wrong current password fails HERE, clearly.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (reauthError) {
        throw new Error("Your current password is incorrect.")
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      toast.success("Password changed", { description: "Use the new password next time you sign in." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      toast.error("Couldn't change your password", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardShell
      icon={KeyRound}
      title="Password"
      description="Changes apply immediately — you stay signed in here."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={saving} className="self-start">
          {saving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          Change password
        </Button>
      </form>
    </CardShell>
  )
}
