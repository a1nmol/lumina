import type { Metadata } from "next"

import { getBusinessBrain } from "./actions"
import { BrainWizard } from "./brain-wizard"

export const metadata: Metadata = { title: "Set up Business Brain" }

export default async function BusinessBrainWizardPage() {
  const brain = await getBusinessBrain()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <BrainWizard initialBrain={brain} />
    </div>
  )
}
