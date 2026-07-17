"use client"

// FAQ editor card for the Settings & Brain hub. List of question/answer
// pairs — collapsed answers that expand on click, inline add/edit, delete.
// Persists via saveFaq (src/app/(app)/settings/brain/actions.ts), reusing
// the wizard's own validation caps. Demo mode edits local state only and
// says so in the toast.

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, HelpCircle, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { duration, easing } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { BusinessFaq } from "@/lib/types"

import { saveFaq } from "./brain/actions"

const MAX_QUESTION = 300
const MAX_ANSWER = 1000
const MAX_FAQ = 50

type FaqCardProps = {
  initialFaq: BusinessFaq[]
  /** False in demo mode (Supabase unconfigured) — edits only update local state. */
  isLive: boolean
}

export function FaqCard({ initialFaq, isLive }: FaqCardProps) {
  const [faq, setFaq] = useState<BusinessFaq[]>(initialFaq)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftQuestion, setDraftQuestion] = useState("")
  const [draftAnswer, setDraftAnswer] = useState("")
  const [pending, setPending] = useState(false)
  const reduceMotion = useReducedMotion()

  async function persist(next: BusinessFaq[], successMessage: string): Promise<boolean> {
    const previous = faq
    setFaq(next)

    if (!isLive) {
      toast.success(successMessage, { description: "Demo mode — changes aren't saved." })
      return true
    }

    setPending(true)
    const result = await saveFaq(next)
    setPending(false)

    if (!result.ok) {
      setFaq(previous)
      toast.error("Couldn't save FAQ", { description: "Reverted — please try again." })
      return false
    }

    toast.success(successMessage)
    return true
  }

  function startAdd() {
    setAdding(true)
    setEditingIndex(null)
    setDraftQuestion("")
    setDraftAnswer("")
  }

  function startEdit(index: number) {
    const item = faq[index]
    if (!item) return
    setEditingIndex(index)
    setAdding(false)
    setDraftQuestion(item.question)
    setDraftAnswer(item.answer)
  }

  function cancelDraft() {
    setAdding(false)
    setEditingIndex(null)
    setDraftQuestion("")
    setDraftAnswer("")
  }

  async function saveDraft() {
    const question = draftQuestion.trim()
    const answer = draftAnswer.trim()
    if (!question || !answer) return

    let next: BusinessFaq[]
    if (editingIndex !== null) {
      next = faq.map((item, index) => (index === editingIndex ? { question, answer } : item))
    } else {
      if (faq.length >= MAX_FAQ) {
        toast.error(`You can only have up to ${MAX_FAQ} FAQ entries.`)
        return
      }
      next = [...faq, { question, answer }]
    }

    const ok = await persist(next, editingIndex !== null ? "Question updated" : "Question added")
    if (ok) cancelDraft()
  }

  async function removeFaq(index: number) {
    const next = faq.filter((_, i) => i !== index)
    if (editingIndex === index) cancelDraft()
    if (expandedIndex === index) setExpandedIndex(null)
    await persist(next, "Question removed")
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle aria-hidden="true" className="size-4 text-primary" />
          FAQ
        </CardTitle>
        <CardDescription>
          Questions your FrontDesk AI can answer automatically — the things customers ask you every day.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {faq.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No FAQ yet — add the questions customers ask most.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl ring-1 ring-foreground/10">
            <AnimatePresence initial={false}>
              {faq.map((item, index) => (
                <motion.li
                  key={`${item.question}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: duration.base, ease: easing.out }}
                  className="overflow-hidden"
                >
                  {editingIndex === index ? (
                    <FaqEditForm
                      question={draftQuestion}
                      answer={draftAnswer}
                      onQuestionChange={setDraftQuestion}
                      onAnswerChange={setDraftAnswer}
                      onSave={saveDraft}
                      onCancel={cancelDraft}
                      pending={pending}
                    />
                  ) : (
                    <div className="flex flex-col px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedIndex((prev) => (prev === index ? null : index))}
                        aria-expanded={expandedIndex === index}
                        className="flex w-full items-center justify-between gap-3 rounded-md text-left text-sm font-medium text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0 flex-1 truncate">{item.question}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            expandedIndex === index && "rotate-180"
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {expandedIndex === index && (
                          <motion.div
                            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                            transition={{ duration: duration.fast, ease: easing.out }}
                            className="overflow-hidden"
                          >
                            <p className="pt-2 text-sm whitespace-pre-wrap text-muted-foreground">{item.answer}</p>
                            <div className="flex items-center gap-1 pt-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(index)}>
                                <Pencil aria-hidden="true" data-icon="inline-start" className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFaq(index)}
                                disabled={pending}
                              >
                                <Trash2 aria-hidden="true" data-icon="inline-start" className="size-3.5" />
                                Delete
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {adding ? (
          <FaqEditForm
            question={draftQuestion}
            answer={draftAnswer}
            onQuestionChange={setDraftQuestion}
            onAnswerChange={setDraftAnswer}
            onSave={saveDraft}
            onCancel={cancelDraft}
            pending={pending}
            isNew
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startAdd}
            disabled={faq.length >= MAX_FAQ}
            className="self-start gap-1.5"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add a question
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

type FaqEditFormProps = {
  question: string
  answer: string
  onQuestionChange: (value: string) => void
  onAnswerChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  pending: boolean
  isNew?: boolean
}

function FaqEditForm({
  question,
  answer,
  onQuestionChange,
  onAnswerChange,
  onSave,
  onCancel,
  pending,
  isNew,
}: FaqEditFormProps) {
  const canSave = question.trim().length > 0 && answer.trim().length > 0

  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3", isNew && "rounded-xl bg-muted/30 ring-1 ring-foreground/10")}>
      <div className="flex flex-col gap-1">
        <Input
          value={question}
          onChange={(event) => onQuestionChange(event.target.value.slice(0, MAX_QUESTION))}
          placeholder="e.g. Do you take walk-ins?"
          aria-label="Question"
          autoFocus
        />
        <span className="self-end text-[0.7rem] text-muted-foreground tabular-nums">
          {question.length}/{MAX_QUESTION}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Textarea
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value.slice(0, MAX_ANSWER))}
          placeholder="Your answer…"
          aria-label="Answer"
          className="min-h-20"
        />
        <span className="self-end text-[0.7rem] text-muted-foreground tabular-nums">
          {answer.length}/{MAX_ANSWER}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X aria-hidden="true" data-icon="inline-start" className="size-3.5" />
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={!canSave || pending}>
          {pending ? "Saving…" : isNew ? "Add question" : "Save"}
        </Button>
      </div>
    </div>
  )
}
