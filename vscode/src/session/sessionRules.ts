import { kotlinTrim } from '../core/kotlinText'

/** The stem of a session that names no agent. */
export const PLAIN = 'Session'

/** The stream cap of the bridge. A session over it would read no comment. */
export const MAX_SESSIONS = 16

export interface TabFacts {
  readonly number: number
  readonly agent?: string | undefined
  readonly byAgent?: string | undefined
  readonly byUser?: string | undefined
}

/** The smallest number that no open session holds. */
export const freeNumber = (taken: ReadonlySet<number>): number =>
  Array.from({ length: taken.size + 1 }, (_, index) => index + 1).find(
    (number) => !taken.has(number),
  ) ?? taken.size + 1

export const canOpen = (open: number): boolean => open < MAX_SESSIONS

const given = (text: string | undefined): string | undefined => {
  const name = kotlinTrim(text ?? '')
  return name === '' ? undefined : name
}

/** The name of the agent first, then the name of the user, then the built name. */
export const sessionName = (facts: TabFacts): string =>
  given(facts.byAgent) ?? given(facts.byUser) ?? `${facts.agent ?? PLAIN} ${facts.number}`

/** A name that shows twice takes its place in the list, so a picker stays readable. */
export const apart = (names: readonly string[]): readonly string[] =>
  names.map((name, index) =>
    names.filter((other) => other === name).length > 1
      ? `${name} (${names.slice(0, index + 1).filter((other) => other === name).length})`
      : name,
  )
