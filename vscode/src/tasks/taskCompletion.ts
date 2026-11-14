import { type HandleMatch, handleOf, keyOf, matchKey, namesTodo } from '../core/handles'
import { kotlinTrim } from '../core/kotlinText'
import { NotesWriteError } from '../git/errors'
import type { StoredComment } from '../store/commentBook'
import type { StoreKind } from '../store/reviewService'
import type { ReviewTask } from './reviewTask'
import { legacyMatch } from './todoMigration'

/** The largest batch of an agent route. A route that a person drives states NO_CAP. */
export const MAX_CLOSE_IDS = 200
export const NO_CAP = Number.MAX_SAFE_INTEGER
export const TOO_MANY = `The extension closes at most ${MAX_CLOSE_IDS} tasks at one time.`
export const UNKNOWN = 'The extension holds no open task with the id'
export const AMBIGUOUS = 'Send the whole 40 character id instead.'

export interface CloseReport {
  readonly closed: number
  readonly problems: readonly string[]
}

export const problemOf = (report: CloseReport): string | undefined =>
  report.problems.length === 0 ? undefined : report.problems.join(' ')

export const isQuiet = (report: CloseReport): boolean =>
  report.closed === 0 && report.problems.length === 0

/** The count first and the problem second, so a reader sees how many tasks closed. */
export const closeSentence = (report: CloseReport, done: string): string =>
  [kotlinTrim(done) === '' ? undefined : done, problemOf(report)]
    .filter((part) => part !== undefined)
    .join(' ')

export interface ClosePlan {
  readonly comments: readonly string[]
  readonly todos: readonly string[]
  readonly dropped: readonly string[]
}

export const planClose = (ids: readonly string[], limit: number = MAX_CLOSE_IDS): ClosePlan => {
  const known = [...new Set(ids)]
  const taken = known.slice(0, limit)
  return {
    comments: taken.filter((id) => !namesTodo(id)),
    todos: taken.filter((id) => namesTodo(id)),
    dropped: known.slice(limit),
  }
}

export const overflowProblem = (plan: ClosePlan): string | undefined =>
  plan.dropped.length === 0
    ? undefined
    : `${TOO_MANY} It left ${plan.dropped.length} out, so report them again.`

export interface TodoOutcome {
  readonly closed: readonly string[]
  readonly stillOpen: readonly string[]
  readonly problems: readonly string[]
}

export const ambiguous = (given: string, count: number): string =>
  `The id ${given} names ${count} tasks. ${AMBIGUOUS}`

const matchOf = (
  text: string,
  ids: readonly string[],
  open: readonly ReviewTask[],
): HandleMatch => {
  const key = keyOf(text)
  if (key === undefined) return { kind: 'none' }
  const match = matchKey(key, ids)
  return match.kind === 'none' ? legacyMatch(key, open) : match
}

/** A TODO closes when this window sent it and the scan no longer finds it. */
export const todoOutcome = (
  given: readonly string[],
  open: readonly ReviewTask[],
  sent: ReadonlySet<string>,
): TodoOutcome => {
  const ids = open.map((task) => task.id)
  const matched = given.map((text) => ({ text, match: matchOf(text, ids, open) }))
  return {
    closed: matched
      .filter(({ text, match }) => match.kind === 'none' && sent.has(handleOf(text)))
      .map(({ text }) => text),
    stillOpen: matched.filter(({ match }) => match.kind === 'one').map(({ text }) => text),
    problems: matched.flatMap(({ text, match }) =>
      match.kind === 'many' ? [ambiguous(text, match.count)] : [],
    ),
  }
}

/** One comment record, its store kind, and the root that holds it. */
export interface FoundComment {
  readonly store: StoreKind
  readonly root: string
  readonly stored: StoredComment
}

/** What the completion needs from the store, the scan and the handoff. Tests give a fake. */
export interface CompletionHost {
  comments(): Promise<readonly FoundComment[]>
  isClosed(found: FoundComment): Promise<boolean>
  resolve(found: FoundComment): Promise<void>
  openTodos(): Promise<readonly ReviewTask[]>
  sent(open: readonly ReviewTask[]): Promise<ReadonlySet<string>>
}

type CommentOutcome =
  | { readonly kind: 'closed' }
  | { readonly kind: 'already' }
  | { readonly kind: 'problem'; readonly text: string }

const unknown = (given: string): CommentOutcome => ({
  kind: 'problem',
  text: `${UNKNOWN} ${given}.`,
})

/** Closes the tasks that an agent or a user reports. Every sentence names the value as given. */
export class TaskCompletion {
  constructor(private readonly host: CompletionHost) {}

  async close(ids: readonly string[], limit: number = MAX_CLOSE_IDS): Promise<CloseReport> {
    const plan = planClose(ids, limit)
    const outcomes = await this.closeComments(plan.comments)
    const todos = await this.todoOutcomeOf(plan.todos)
    return {
      closed: outcomes.filter((outcome) => outcome.kind === 'closed').length + todos.closed.length,
      problems: [
        ...outcomes.flatMap((outcome) => (outcome.kind === 'problem' ? [outcome.text] : [])),
        ...todos.stillOpen.map((id) => `The line of the task ${id} is still in the source.`),
        ...todos.problems,
        ...[overflowProblem(plan)].filter((problem) => problem !== undefined),
      ],
    }
  }

  /** One read of every record serves the whole batch. The writes run one after the other. */
  private async closeComments(given: readonly string[]): Promise<readonly CommentOutcome[]> {
    if (given.length === 0) return []
    const found = await this.host.comments()
    const ids = found.map((entry) => entry.stored.id)
    return given.reduce<Promise<readonly CommentOutcome[]>>(
      async (done, text) => [...(await done), await this.outcomeOf(found, ids, text)],
      Promise.resolve([]),
    )
  }

  private async outcomeOf(
    found: readonly FoundComment[],
    ids: readonly string[],
    given: string,
  ): Promise<CommentOutcome> {
    const key = keyOf(given)
    const match = key === undefined ? undefined : matchKey(key, ids)
    if (match?.kind === 'many') return { kind: 'problem', text: ambiguous(given, match.count) }
    const hit =
      match?.kind === 'one' ? found.find((entry) => entry.stored.id === match.id) : undefined
    if (hit === undefined) return unknown(given)
    if (await this.host.isClosed(hit)) return { kind: 'already' }
    try {
      await this.host.resolve(hit)
      return { kind: 'closed' }
    } catch (failure) {
      if (!(failure instanceof NotesWriteError)) throw failure
      return {
        kind: 'problem',
        text: `The extension could not resolve ${given}. ${failure.message}`,
      }
    }
  }

  private async todoOutcomeOf(given: readonly string[]): Promise<TodoOutcome> {
    if (given.length === 0) return { closed: [], stillOpen: [], problems: [] }
    const open = await this.host.openTodos()
    return todoOutcome(given, open, await this.host.sent(open))
  }
}
