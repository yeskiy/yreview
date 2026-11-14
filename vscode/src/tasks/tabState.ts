import type { KindFilter } from './taskFilter'
import type { TaskGrouping } from './taskTree'

/** The state of one view, as one IntelliJ tab keeps it. */
export interface TabState extends TaskGrouping {
  readonly kindFilter: KindFilter
  readonly todoFilterName: string
  readonly showResolved: boolean
  readonly scopeGlob: string
}

export const DEFAULT_TAB: TabState = {
  byFolder: false,
  byDirectory: false,
  flatten: false,
  kindFilter: 'both',
  todoFilterName: '',
  showResolved: false,
  scopeGlob: '',
}

/** The part of vscode.Memento that the state needs. */
export interface StateStore {
  get(key: string): unknown
  update(key: string, value: unknown): PromiseLike<void>
}

const KEY = 'yreview.tabs'
const KINDS: ReadonlySet<string> = new Set(['both', 'comments', 'todos'])

type Stored = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Stored => typeof value === 'object' && value !== null

const flag = (stored: Stored, name: keyof TabState): boolean => {
  const value = stored[name]
  return typeof value === 'boolean' ? value : (DEFAULT_TAB[name] as boolean)
}

const text = (stored: Stored, name: keyof TabState): string => {
  const value = stored[name]
  return typeof value === 'string' ? value : (DEFAULT_TAB[name] as string)
}

export const readTab = (value: unknown): TabState => {
  const stored = isRecord(value) ? value : {}
  return {
    byFolder: flag(stored, 'byFolder'),
    byDirectory: flag(stored, 'byDirectory'),
    flatten: flag(stored, 'flatten'),
    kindFilter: KINDS.has(text(stored, 'kindFilter'))
      ? (text(stored, 'kindFilter') as KindFilter)
      : DEFAULT_TAB.kindFilter,
    todoFilterName: text(stored, 'todoFilterName'),
    showResolved: flag(stored, 'showResolved'),
    scopeGlob: text(stored, 'scopeGlob'),
  }
}

/** The state of every view, in the workspace state and outside the repository. */
export class TabStates {
  constructor(private readonly store: StateStore) {}

  get(viewId: string): TabState {
    const all = this.store.get(KEY)
    return readTab(isRecord(all) ? all[viewId] : undefined)
  }

  async set(viewId: string, change: Partial<TabState>): Promise<TabState> {
    const all = this.store.get(KEY)
    const next = { ...this.get(viewId), ...change }
    await this.store.update(KEY, { ...(isRecord(all) ? all : {}), [viewId]: next })
    return next
  }
}
