import type { TabState } from './tabState'
import { KIND_FILTERS, type TodoFilter } from './taskFilter'
import type { ViewKey } from './viewRows'

/** One action of a view title. `context` names the group of the row menu when the row menu offers it too. */
export interface ViewAction {
  readonly action: string
  readonly title: string
  readonly icon: string
  readonly group: string
  readonly when?: (key: ViewKey) => string
  readonly context?: string
}

const anyTask = (key: ViewKey): string => `yreview.${key}.anyTask`

export const VIEW_ACTIONS: readonly ViewAction[] = [
  { action: 'filter', title: 'Filter', icon: '$(filter)', group: 'navigation@1' },
  {
    action: 'showResolved',
    title: 'Show Resolved Comments',
    icon: '$(eye)',
    group: 'navigation@2',
    when: (key) => `!yreview.${key}.resolvedShown`,
  },
  {
    action: 'hideResolved',
    title: 'Hide Resolved Comments',
    icon: '$(eye-closed)',
    group: 'navigation@2',
    when: (key) => `yreview.${key}.resolvedShown`,
  },
  { action: 'groupBy', title: 'Group By', icon: '$(list-tree)', group: 'navigation@3' },
  {
    action: 'previous',
    title: 'Previous Task',
    icon: '$(arrow-up)',
    group: '1_move@1',
    when: anyTask,
  },
  { action: 'next', title: 'Next Task', icon: '$(arrow-down)', group: '1_move@2', when: anyTask },
  {
    action: 'checkAll',
    title: 'Check All',
    icon: '$(check-all)',
    group: '2_checks@1',
    when: anyTask,
  },
  {
    action: 'clearChecks',
    title: 'Clear Checks',
    icon: '$(clear-all)',
    group: '2_checks@2',
    when: (key) => `yreview.${key}.anyCheck`,
  },
]

export const commandOf = (key: ViewKey, action: string): string => `yreview.${key}.${action}`

export const menuWhen = (key: ViewKey, item: ViewAction): string =>
  [`view == yreview.${key}`, item.when?.(key)].filter((part) => part !== undefined).join(' && ')

export const rowWhen = (key: ViewKey): string =>
  `view == yreview.${key} && viewItem =~ /^yreview\\./`

/** One entry of a quick pick of a view. A separator only names the next block. */
export interface MenuItem {
  readonly label: string
  readonly description?: string
  readonly picked: boolean
  readonly separator?: boolean
  readonly change?: Partial<TabState>
  readonly askGlob?: boolean
}

export const GLOB_PROMPT =
  'Only the files that match this glob pattern stay in the view, for example src/**/*.ts. Clear the box to show every file.'

export const filterItems = (tab: TabState, filters: readonly TodoFilter[]): readonly MenuItem[] => [
  ...KIND_FILTERS.map((entry) => ({
    label: entry.label,
    description: entry.summary,
    picked: tab.kindFilter === entry.kind,
    change: { kindFilter: entry.kind },
  })),
  { label: 'TODO Filters', picked: false, separator: true },
  {
    label: 'Show All TODO Items',
    picked: tab.todoFilterName === '',
    change: { todoFilterName: '' },
  },
  ...filters.map((filter) => ({
    label: filter.name,
    description: filter.patterns.join(', '),
    picked: tab.todoFilterName === filter.name,
    change: { todoFilterName: filter.name },
  })),
  { label: 'Scope', picked: false, separator: true },
  { label: 'Every File', picked: tab.scopeGlob === '', change: { scopeGlob: '' } },
  {
    label: 'Files That Match a Glob Pattern...',
    description: tab.scopeGlob,
    picked: tab.scopeGlob !== '',
    askGlob: true,
  },
]

export const groupItems = (tab: TabState): readonly MenuItem[] => [
  {
    label: 'Group by Workspace Folder',
    description: 'Group the files under the workspace folder that holds them.',
    picked: tab.byFolder,
    change: { byFolder: !tab.byFolder },
  },
  {
    label: 'Group by Directory',
    description: 'Show the directory tree above the files.',
    picked: tab.byDirectory,
    change: { byDirectory: !tab.byDirectory },
  },
  ...(tab.byDirectory
    ? [
        {
          label: 'Flatten Directories',
          description: 'Put the whole directory path on one row.',
          picked: tab.flatten,
          change: { flatten: !tab.flatten },
        },
      ]
    : []),
]

export const pickLabel = (item: MenuItem): string => {
  if (item.separator === true) return item.label
  return `${item.picked ? '$(check)' : '$(blank)'} ${item.label}`
}
