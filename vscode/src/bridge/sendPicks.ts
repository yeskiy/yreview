import { apart } from '../session/sessionRules'

export interface SessionChoice {
  readonly key: string | undefined
  readonly name: string
}

export type SendPick =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly choice: SessionChoice }
  | { readonly kind: 'ask'; readonly choices: readonly SessionChoice[] }

/** The row with no target writes to every stream, so it promises the channel and nothing more. */
export const EVERY_NAME = 'Every session that reads the channel'

const EVERY: SessionChoice = { key: undefined, name: EVERY_NAME }

export const sendPickOf = (named: readonly SessionChoice[], pushPossible: boolean): SendPick => {
  if (!pushPossible || named.length === 0) return { kind: 'none' }
  if (named.length === 1) return { kind: 'one', choice: named[0] ?? EVERY }
  const rows = [...named, EVERY]
  const names = apart(rows.map((row) => row.name))
  return { kind: 'ask', choices: rows.map((row, at) => ({ ...row, name: names[at] ?? row.name })) }
}

export const buttonText = (base: string, pick: SendPick, sendable: boolean): string => {
  if (!sendable) return base
  if (pick.kind === 'one') return `${base} to ${pick.choice.name}`
  return pick.kind === 'ask' ? `${base} to a Session...` : base
}
