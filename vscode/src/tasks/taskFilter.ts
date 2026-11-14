import type { ReviewTask } from './reviewTask'

export type KindFilter = 'both' | 'comments' | 'todos'

export const KIND_FILTERS: readonly {
  readonly kind: KindFilter
  readonly label: string
  readonly summary: string
}[] = [
  {
    kind: 'both',
    label: 'Comments and TODO Items',
    summary: 'Show the review comments and the TODO items together.',
  },
  {
    kind: 'comments',
    label: 'Review Comments Only',
    summary: 'Hide every TODO item and keep the review comments.',
  },
  {
    kind: 'todos',
    label: 'TODO Items Only',
    summary: 'Hide every review comment and keep the TODO items.',
  },
]

/** A named set of TODO patterns from the setting yreview.todoFilters. */
export interface TodoFilter {
  readonly name: string
  readonly patterns: readonly string[]
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

export const readFilters = (value: unknown): readonly TodoFilter[] =>
  (Array.isArray(value) ? (value as unknown[]) : []).flatMap((entry) =>
    isRecord(entry) && typeof entry.name === 'string' && Array.isArray(entry.patterns)
      ? [
          {
            name: entry.name,
            patterns: (entry.patterns as unknown[]).filter(
              (pattern): pattern is string => typeof pattern === 'string',
            ),
          },
        ]
      : [],
  )

export const acceptsKind = (task: ReviewTask, kind: KindFilter): boolean => {
  if (kind === 'both') return true
  return kind === 'comments' ? task.kind === 'comment' : task.kind === 'todo'
}

/** Undefined rules mean that the user chose no TODO filter. A comment is never a TODO. */
export const acceptsRules = (task: ReviewTask, rules: ReadonlySet<string> | undefined): boolean =>
  rules === undefined || task.kind !== 'todo' || rules.has(task.patternRule)

export const accepts = (
  task: ReviewTask,
  rules: ReadonlySet<string> | undefined,
  kind: KindFilter = 'both',
): boolean => acceptsKind(task, kind) && acceptsRules(task, rules)

export const acceptsResolved = (task: ReviewTask, showResolved: boolean): boolean =>
  showResolved || !task.resolved

export const applyFilter = (
  tasks: readonly ReviewTask[],
  rules: ReadonlySet<string> | undefined,
  kind: KindFilter = 'both',
): readonly ReviewTask[] =>
  rules === undefined && kind === 'both'
    ? tasks
    : tasks.filter((task) => accepts(task, rules, kind))
