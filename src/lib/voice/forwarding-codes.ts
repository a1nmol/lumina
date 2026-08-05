// Carrier-agnostic call-forwarding dial codes for the AI Phone Receptionist
// settings surface's "Forward your existing number" card
// (src/app/(app)/settings/voice/voice-phone-number-card.tsx) — lets an
// owner without a purchased Lumina number forward their existing business
// line to it instead. Pure, zero I/O — safe to import from a client
// component, unit-tested directly in forwarding-codes.test.ts.
//
// Covers the two most common CONDITIONAL ("no answer"/"busy") forwarding
// code families:
//  - *71<number>  — Verizon and most US landline/cable-VoIP carriers
//    (Vonage, Ooma, Comcast Digital Voice, etc). *73 deactivates.
//  - 004*<number>#  — GSM "forward when unanswered" activation code, used
//    by AT&T and T-Mobile. ##004# deactivates.
// TODO-VERIFY against each carrier's current published docs before relying
// on this as authoritative support copy — carrier codes occasionally
// change, and some carriers (e.g. legacy Sprint) use different codes
// entirely. This is a best-effort, commonly-cited set, not a guarantee for
// every US carrier.

export interface ForwardingCode {
  id: "verizon" | "gsm"
  carrierLabel: string
  activateCode: string
  deactivateCode: string
}

const MIN_DIGITS = 7

/** Strips everything but digits — dial codes are keyed on the raw digit string, not any particular formatting (spaces, dashes, parens, a leading +). */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Builds both forwarding-code entries for `targetNumber` (the Lumina number
 * calls should forward to), or null when there aren't enough digits to be a
 * real phone number yet — the caller should treat null as "keep typing."
 */
export function formatForwardingCodes(targetNumber: string): ForwardingCode[] | null {
  const digits = digitsOnly(targetNumber)
  // 15 = ITU E.164 maximum — anything longer is a paste accident, not a
  // phone number; showing a garbage dial code helps nobody.
  if (digits.length < MIN_DIGITS || digits.length > 15) return null

  return [
    {
      id: "verizon",
      carrierLabel: "Verizon & most landlines / VoIP",
      activateCode: `*71${digits}`,
      deactivateCode: "*73",
    },
    {
      id: "gsm",
      carrierLabel: "AT&T & T-Mobile (GSM)",
      activateCode: `004*${digits}#`,
      deactivateCode: "##004#",
    },
  ]
}
