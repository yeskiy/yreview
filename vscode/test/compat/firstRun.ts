import { setTimeout as wait } from 'node:timers/promises'

import { clickAt, evaluate, pressKey, workbench } from '../integration/keymap/devtools'

interface Step {
  readonly done: boolean
  readonly text?: string
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
  const buttons = [...screen.querySelectorAll('*')]
    .filter((node) => shown(node) && (node.matches('button, a, [role="button"]') || getComputedStyle(node).cursor === 'pointer'))
    .filter((node) => !node.parentElement?.closest('button, a, [role="button"]'))
  const labels = buttons.map((node) => (node.innerText || node.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40))
  const at = labels.findIndex((text) => /^(skip|not now|maybe later|later|continue|next|done|got it|close|start|get started)\\b/i.test(text))
  const text = screen.innerText.replace(/\\s+/g, ' ').slice(0, 300)
  if (at < 0) return { done: false, text, labels }
  const box = buttons[at].getBoundingClientRect()
  return { done: false, text, labels, chosen: labels[at], x: box.left + box.width / 2, y: box.top + box.height / 2 }
})()`

/** Clicks through a first-run screen as a new user does, and gives the steps. */
export const finishFirstRun = async (steps: readonly Step[] = []): Promise<readonly Step[]> => {
  const step = (await evaluate(await workbench(), STEP)) as Step
  if (step.done || steps.length >= 8) return [...steps, step]
  if (step.x !== undefined && step.y !== undefined) await clickAt(step.x, step.y)
  // A screen with no skip button can still close with Escape.
  else
    await pressKey({
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    })
  await wait(1000)
  return finishFirstRun([...steps, { ...step, chosen: step.chosen ?? 'Escape' }])
}
