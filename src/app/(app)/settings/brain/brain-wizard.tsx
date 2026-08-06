"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Check, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Wick, type WickState } from "@/components/brand/wick"
import { Button } from "@/components/ui/button"
import { duration, easing, fadeUp, springGentle } from "@/lib/motion"
import type { BusinessBrain } from "@/lib/types"
import { cn } from "@/lib/utils"

import { completeBusinessBrain, saveBusinessBrainStep } from "./actions"
import { WIZARD_STEPS } from "./constants"
import { BasicsStep } from "./steps/basics-step"
import { ChannelsStep } from "./steps/channels-step"
import { HoursServicesStep } from "./steps/hours-services-step"
import { VoiceBrandStep } from "./steps/voice-brand-step"

/** How long Wick's "step completed" reaction holds before settling back to idle — a quiet pulse, not a full celebration (that's reserved for the finish screen). */
const WICK_STEP_REACTION_MS = 1400

type BrainWizardProps = {
  initialBrain: BusinessBrain
}

export function BrainWizard({ initialBrain }: BrainWizardProps) {
  const [brain, setBrain] = useState<BusinessBrain>(initialBrain)
  const [stepIndex, setStepIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const reduceMotion = useReducedMotion()

  // Wick perches beside the progress header and reacts to progress: a brief
  // "curious" (happy/excited) pulse whenever the step index actually
  // advances (Continue/Skip), settling back to idle after a beat. Never
  // fires on stepping backward (Back / clicking an earlier pill) — only
  // forward progress reads as an accomplishment. `prevStepIndexRef` starts
  // equal to the initial `stepIndex` so mount never falsely triggers it.
  const [wickState, setWickState] = useState<WickState>("idle")
  const prevStepIndexRef = useRef(stepIndex)
  useEffect(() => {
    const advanced = stepIndex > prevStepIndexRef.current
    prevStepIndexRef.current = stepIndex
    if (!advanced) return
    setWickState("curious")
    const timer = setTimeout(() => setWickState("idle"), WICK_STEP_REACTION_MS)
    return () => clearTimeout(timer)
  }, [stepIndex])

  // Callback ref (instead of a stepIndex-keyed effect) so focus moves to the
  // new heading exactly when AnimatePresence mode="wait" actually mounts it
  // — not on some fixed delay guessed from the step index. Skips the very
  // first mount so initial page load doesn't steal focus from the page.
  const isFirstHeadingMount = useRef(true)
  const focusHeadingOnMount = useCallback((node: HTMLHeadingElement | null) => {
    if (!node) return
    if (isFirstHeadingMount.current) {
      isFirstHeadingMount.current = false
      return
    }
    node.focus()
  }, [])

  const isLastStep = stepIndex === WIZARD_STEPS.length - 1

  function patchBrain(patch: Partial<BusinessBrain>) {
    setBrain((prev) => ({ ...prev, ...patch }))
  }

  async function handleContinue() {
    setIsSaving(true)
    try {
      if (isLastStep) {
        const result = await completeBusinessBrain(brain, WIZARD_STEPS.length)
        if (!result.ok) {
          toast.error("Couldn't save", {
            description: "Your Business Brain will sync once you're back online.",
          })
        }
        setShowCompletion(true)
      } else {
        const result = await saveBusinessBrainStep(stepIndex + 1, brain)
        if (!result.ok) {
          toast.error("Couldn't save that step", {
            description: "You can keep going — we'll retry the sync.",
          })
        }
        setStepIndex((i) => i + 1)
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSkip() {
    if (isLastStep) {
      setIsSaving(true)
      try {
        const result = await completeBusinessBrain(brain, WIZARD_STEPS.length)
        if (!result.ok) {
          toast.error("Couldn't save", {
            description: "Your Business Brain will sync once you're back online.",
          })
        }
        setShowCompletion(true)
      } finally {
        setIsSaving(false)
      }
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  function handleBack() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  function handlePillClick(index: number) {
    if (index <= stepIndex) setStepIndex(index)
  }

  if (showCompletion) {
    return <CompletionState headingRef={focusHeadingOnMount} reduceMotion={Boolean(reduceMotion)} />
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <Wick state={wickState} size={40} className="shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Business Brain setup
          </p>
          <p className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${((stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
            transition={{ duration: reduceMotion ? 0 : duration.base, ease: easing.out }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-label="Business Brain setup steps">
          {WIZARD_STEPS.map((step, index) => {
            const state = index < stepIndex ? "completed" : index === stepIndex ? "current" : "upcoming"
            const reachable = index <= stepIndex
            return (
              <button
                key={step.id}
                type="button"
                aria-current={state === "current" ? "step" : undefined}
                disabled={!reachable}
                onClick={() => handlePillClick(index)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed",
                  state === "completed" && "bg-primary/10 text-primary hover:bg-primary/15",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "upcoming" && "bg-muted text-muted-foreground"
                )}
              >
                {state === "completed" ? (
                  <Check aria-hidden="true" className="size-3" />
                ) : (
                  <span className="tabular-nums" aria-hidden="true">
                    {index + 1}
                  </span>
                )}
                {step.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-6 shadow-soft ring-1 ring-foreground/10 sm:p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepIndex}
            initial={reduceMotion ? false : fadeUp.initial}
            animate={fadeUp.animate}
            exit={reduceMotion ? undefined : fadeUp.exit}
            transition={reduceMotion ? { duration: 0 } : fadeUp.transition}
            className="flex flex-col gap-6"
          >
            <h2
              ref={focusHeadingOnMount}
              tabIndex={-1}
              className="font-heading text-2xl font-normal text-foreground outline-none"
            >
              {WIZARD_STEPS[stepIndex].label}
            </h2>
            {stepIndex === 0 && <BasicsStep brain={brain} onChange={patchBrain} />}
            {stepIndex === 1 && <HoursServicesStep brain={brain} onChange={patchBrain} />}
            {stepIndex === 2 && <VoiceBrandStep brain={brain} onChange={patchBrain} />}
            {stepIndex === 3 && <ChannelsStep brain={brain} onChange={patchBrain} />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
          <div>
            {stepIndex > 0 && (
              <Button type="button" variant="ghost" onClick={handleBack} disabled={isSaving}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSaving}>
              Skip for now
            </Button>
            <Button type="button" onClick={handleContinue} disabled={isSaving}>
              {isSaving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {isLastStep ? "Finish" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletionState({
  headingRef,
  reduceMotion,
}: {
  headingRef: (node: HTMLHeadingElement | null) => void
  reduceMotion: boolean
}) {
  // Composes with the existing spring-in check icon (doesn't replace it) —
  // Wick plays his one-shot "celebrating" loop-de-loop alongside it, then
  // settles back to idle rather than freezing on the loop's last frame.
  const [wickState, setWickState] = useState<WickState>("celebrating")
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-card px-6 py-20 text-center shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : springGentle}
          className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success ring-1 ring-success/20"
        >
          <CheckCircle2 aria-hidden="true" className="size-8" />
        </motion.div>
        <Wick state={wickState} size={56} onComplete={() => setWickState("idle")} />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl font-normal text-foreground outline-none"
        >
          Your Business Brain is live
        </h2>
        <p className="text-sm text-muted-foreground">
          Content and FrontDesk now know your hours, services, and voice — fine-tune any of this
          later from Settings.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  )
}
