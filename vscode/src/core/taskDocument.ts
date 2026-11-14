import {
  type Lexer,
  type Reader,
  int,
  list,
  nullable,
  optional,
  plain,
  readObject,
  readWhole,
  refuse,
  required,
  text,
} from './kotlinJson'

/** The version of a task file that holds current TODO identifiers. A file with no version reads as 2. */
export const TASKS_VERSION = 2

export type TaskKind = 'comment' | 'todo'

/** One task as tasks.json holds it. Spec section 11 lists the fields. */
export interface TaskEntry {
  readonly id: string
  readonly kind: TaskKind
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly text: string
  readonly pattern?: string
  readonly author?: string
}

export interface TaskDocument {
  readonly version: number
  readonly repository: string
  readonly commit: string
  readonly generated: string
  readonly tasks: readonly TaskEntry[]
}

/** The fields of the format alone, in the Kotlin order. A field of the task model stays out. */
const entryOf = (entry: TaskEntry): TaskEntry =>
  plain<TaskEntry>({
    id: entry.id,
    kind: entry.kind,
    path: entry.path,
    startLine: entry.startLine,
    startColumn: entry.startColumn,
    endLine: entry.endLine,
    endColumn: entry.endColumn,
    text: entry.text,
    pattern: entry.pattern,
    author: entry.author,
  })

export const encodeTaskDocument = (document: TaskDocument): string =>
  JSON.stringify(
    {
      version: document.version,
      repository: document.repository,
      commit: document.commit,
      generated: document.generated,
      tasks: document.tasks.map(entryOf),
    },
    null,
    4,
  )

const kind: Reader = (lexer) => {
  const value = lexer.string()
  return value === 'comment' || value === 'todo' ? value : refuse()
}

const readEntry: Reader = (lexer) => {
  const values = readObject(
    lexer,
    new Map<string, Reader>([
      ['id', text],
      ['kind', kind],
      ['path', text],
      ['startLine', int],
      ['startColumn', nullable(int)],
      ['endLine', int],
      ['endColumn', nullable(int)],
      ['text', text],
      ['pattern', nullable(text)],
      ['author', nullable(text)],
    ]),
  )
  return plain<TaskEntry>({
    id: required(values, 'id'),
    kind: required(values, 'kind'),
    path: required(values, 'path'),
    startLine: required(values, 'startLine'),
    startColumn: optional(values, 'startColumn'),
    endLine: required(values, 'endLine'),
    endColumn: optional(values, 'endColumn'),
    text: required(values, 'text'),
    pattern: optional(values, 'pattern'),
    author: optional(values, 'author'),
  })
}

const readDocument = (lexer: Lexer): TaskDocument => {
  const values = readObject(
    lexer,
    new Map<string, Reader>([
      ['version', int],
      ['repository', text],
      ['commit', text],
      ['generated', text],
      ['tasks', list(readEntry)],
    ]),
  )
  return {
    version: optional<number>(values, 'version') ?? TASKS_VERSION,
    repository: required(values, 'repository'),
    commit: required(values, 'commit'),
    generated: required(values, 'generated'),
    tasks: required(values, 'tasks'),
  }
}

/** The document of one task file, or undefined for a text that the Kotlin decoder refuses. */
export const decodeTaskDocument = (source: string): TaskDocument | undefined =>
  readWhole(source, readDocument)
