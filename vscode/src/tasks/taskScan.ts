import { WORKTREE } from '../core/anchor'
import { kotlinTrim } from '../core/kotlinText'
import { isRelativeUnder } from '../core/paths'
import { assignTodoIds, repositoryOf } from '../core/taskIds'
import { type NoteStore, NotesGateway } from '../git/notes'
import { type GitRunner, ProcessGitRunner, isOk, ran } from '../git/runner'
import { CommentBook } from '../store/commentBook'
import { type ScanRecord, commentTask, pickRecords } from './commentTask'
import { noAuthor, readNotes } from './noteScan'
import { type ReviewTask, revisionOf } from './reviewTask'
import { ownsFile } from './roots'
import { type CompiledPattern, searchWords } from './todoPatterns'
import { type TodoHit, grepTodos, hitsByFile, todosOfText } from './todoScan'

/** The tasks of one repository, and the commit they belong to. */
export interface RepositoryTasks {
  readonly root: string
  readonly commit: string
  readonly tasks: readonly ReviewTask[]
}

export interface ScanInput {
  readonly gitPath: string
  readonly roots: readonly string[]
  readonly basePathOf: (root: string) => string | undefined
  readonly patterns: readonly CompiledPattern[]
  readonly unshared: (id: string) => boolean
  readonly signal?: AbortSignal
  readonly folderStores?: readonly { readonly root: string; readonly store: NoteStore }[]
}

export type ScanKind = 'notes' | 'full'

export const SCAN_DELAY_MS = 300

/** The open records and the resolved records. A view drops the resolved ones while its switch is off. */
export const recordsOf = async (book: CommentBook): Promise<readonly ScanRecord[]> =>
  (
    await Promise.all(
      (await book.commits()).map(async (commit) =>
        pickRecords(await book.open(commit), await book.closed(commit), true),
      ),
    )
  ).flat()

/** Two git processes in the common case, and one read for each note when git gave no full answer. */
export const gitRecords = async (
  git: GitRunner,
  root: string,
  signal?: AbortSignal,
): Promise<readonly ScanRecord[]> =>
  recordsOf(
    new CommentBook(
      (await readNotes(git, root, undefined, signal)) ?? new NotesGateway(git),
      noAuthor,
    ),
  )

const commentsOf = (
  input: ScanInput,
  root: string,
  records: readonly ScanRecord[],
): readonly ReviewTask[] =>
  records.flatMap((record) => commentTask(record, root, input.unshared(record.stored.id)) ?? [])

const todoTask = (hit: TodoHit, root: string, path: string, commit: string): ReviewTask => ({
  id: '',
  kind: 'todo',
  path,
  startLine: hit.line,
  endLine: hit.line,
  text: hit.text,
  pattern: hit.word,
  filePath: `${root}/${path}`,
  rootPath: root,
  revision: commit,
  state: '',
  folder: '',
  patternRule: hit.rule,
  resolved: false,
})

const todosOfFile = (
  repository: string,
  root: string,
  path: string,
  commit: string,
  hits: readonly TodoHit[],
): readonly ReviewTask[] =>
  assignTodoIds(
    repository,
    hits.map((hit) => todoTask(hit, root, path, commit)),
  )

export const scanRepository = async (input: ScanInput, root: string): Promise<RepositoryTasks> => {
  const git = new ProcessGitRunner(root, input.gitPath)
  const head = await git.run(['rev-parse', '-q', '--verify', 'HEAD^{commit}'], input.signal)
  if (!ran(head)) throw new Error(head.stderr.trim() || 'Git did not answer.')
  const commit = revisionOf(isOk(head) ? kotlinTrim(head.stdout) : undefined)
  const repository = repositoryOf(input.basePathOf(root), root)
  const [records, lines] = await Promise.all([
    gitRecords(git, root, input.signal),
    grepTodos(git, searchWords(input.patterns), input.signal),
  ])
  if (lines === undefined) {
    throw new Error('git grep did not answer, so the extension did not read the TODO items.')
  }
  return {
    root,
    commit,
    tasks: [
      ...commentsOf(input, root, records),
      ...[...hitsByFile(lines, input.patterns)].flatMap(([path, hits]) =>
        isRelativeUnder(root, path) && ownsFile(root, `${root}/${path}`, input.roots)
          ? todosOfFile(repository, root, path, commit, hits)
          : [],
      ),
    ],
  }
}

/** A folder store gives comments only. Its TODO items come from the repositories under it. */
const folderTasks = async (input: ScanInput): Promise<readonly RepositoryTasks[]> =>
  (
    await Promise.all(
      (input.folderStores ?? []).map(async ({ root, store }) => ({
        root,
        commit: WORKTREE,
        tasks: commentsOf(input, root, await recordsOf(new CommentBook(store, noAuthor))),
      })),
    )
  ).filter((entry) => entry.tasks.length > 0)

/** The repositories one after the other, so a large workspace does not start many git processes at once. */
const inTurn = (
  input: ScanInput,
  read: (root: string) => Promise<RepositoryTasks>,
): Promise<readonly RepositoryTasks[]> =>
  input.roots.reduce<Promise<readonly RepositoryTasks[]>>(async (done, root) => {
    const found = await done
    input.signal?.throwIfAborted()
    return [...found, await read(root)]
  }, Promise.resolve([]))

export const scanProject = async (input: ScanInput): Promise<readonly RepositoryTasks[]> => [
  ...(await inTurn(input, (root) => scanRepository(input, root))),
  ...(await folderTasks(input)),
]

/** Reads the comments again and keeps the TODO items. A ref tip that did not move starts no git grep. */
export const rescanNotes = async (
  input: ScanInput,
  found: readonly RepositoryTasks[],
): Promise<readonly RepositoryTasks[]> => {
  const known = new Map(found.map((repo) => [repo.root, repo]))
  return [
    ...(await inTurn(input, async (root) => {
      const old = known.get(root)
      if (old === undefined) return scanRepository(input, root)
      const git = new ProcessGitRunner(root, input.gitPath)
      return {
        ...old,
        tasks: [
          ...commentsOf(input, root, await gitRecords(git, root, input.signal)),
          ...old.tasks.filter((task) => task.kind === 'todo'),
        ],
      }
    })),
    ...(await folderTasks(input)),
  ]
}

/** Starts one scan after a burst of requests. A full request in the burst makes the scan full. */
export class ScanSchedule {
  private timer: NodeJS.Timeout | undefined

  private wanted: ScanKind | undefined

  constructor(
    private readonly start: (kind: ScanKind) => void,
    private readonly delayMs = SCAN_DELAY_MS,
  ) {}

  request(kind: ScanKind): void {
    this.wanted = kind === 'full' || this.wanted === 'full' ? 'full' : 'notes'
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const wanted = this.wanted ?? kind
      this.cancel()
      this.start(wanted)
    }, this.delayMs)
  }

  cancel(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.wanted = undefined
  }
}

/** The scan with the TODO items of each dirty document in place of the items that git read from the disk. */
export const withOverlays = (
  found: readonly RepositoryTasks[],
  overlays: ReadonlyMap<string, string>,
  patterns: readonly CompiledPattern[],
  roots: readonly string[],
  basePathOf: (root: string) => string | undefined,
): readonly RepositoryTasks[] =>
  found.map((repo) => {
    const mine = [...overlays].filter(
      ([filePath]) =>
        ownsFile(repo.root, filePath, roots) &&
        isRelativeUnder(repo.root, filePath.slice(repo.root.length + 1)),
    )
    if (mine.length === 0) return repo
    const dirty = new Set(mine.map(([filePath]) => filePath))
    const repository = repositoryOf(basePathOf(repo.root), repo.root)
    return {
      ...repo,
      tasks: [
        ...repo.tasks.filter((task) => task.kind !== 'todo' || !dirty.has(task.filePath)),
        ...mine.flatMap(([filePath, text]) =>
          todosOfFile(
            repository,
            repo.root,
            filePath.slice(repo.root.length + 1),
            repo.commit,
            todosOfText(text, patterns),
          ),
        ),
      ],
    }
  })
