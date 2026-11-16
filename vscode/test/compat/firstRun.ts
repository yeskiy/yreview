import { setTimeout as wait } from 'node:timers/promises'

import { clickAt, evaluate, workbench } from '../integration/keymap/devtools'

interface Step {
  readonly done: boolean
  readonly labels?: readonly string[]
  readonly chosen?: string
  readonly x?: number
  readonly y?: number
}

// A new profile of some editors opens a first-run screen over the workbench, as Cursor does.
const STEP = `(() => {
  const shown = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const screen = [...document.querySelectorAll('[class*="onboarding"]')].find(shown)
  if (screen === undefined) return { done: true }
  const buttons = [...screen.querySelectorAll('button, [role="button"], a')].filter(shown)
  const labels = buttons.map((node) => (node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 40))
  const at = labels.findIndex((text) => /^(skip|not now|maybe later|later|continue|next|done|got it|close)\\b/i.test(text))
  if (at < 0) return { done: false, labels }
  const box = buttons[at].getBoundingClientRect()
  return { done: false, labels, chosen: labels[at], x: box.left + box.width / 2, y: box.top + box.height / 2 }
})()`

/** Clicks through a first-run screen as a new user does, and gives the steps. */
export const finishFirstRun = async (steps: readonly Step[] = []): Promise<readonly Step[]> => {
  const step = (await evaluate(await workbench(), STEP)) as Step
  if (step.done || step.x === undefined || step.y === undefined || steps.length >= 12)
    return [...steps, step]
  await clickAt(step.x, step.y)
  await wait(1000)
  return finishFirstRun([...steps, step])
}
