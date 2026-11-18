import { WORKTREE } from '../core/anchor'
import { kotlinTrim } from '../core/kotlinText'
import { isRelativeUnder } from '../core/paths'
import { assignTodoIds, repositoryOf } from '../core/taskIds'
import { type NoteStore, NotesGateway } from '../git/notes'
import { type GitRunner, ProcessGitRunner, isOk, ran } from '../git/runner'
import { CommentBook } from '../store/commentBook'
import { FolderNotes } from '../store/folderNotes'
import { commentTask } from './commentTask'
import { noAuthor, readNotes } from './noteScan'
import { placedComments } from './placedComments'
import { type ReviewTask, revisionOf } from './reviewTask'
import { ownsFile } from './roots'
import { type CompiledPattern, searchWords } from './todoPatterns'
import { type TodoHit, grepTodos, hitsByFile, todosOfText } from './todoScan'

/** The tasks of one repository, and the commit they belong to. */
export interface RepositoryTasks {
  readonly root: string
  readonly commit: string
  readonly tasks: readonly ReviewTask[]
  /** The label of a root outside the workspace. Only its open files give tasks. */
  readonly outside?: string
}

/** A root of open tabs outside the workspace, with the open files of that root. */
export interface OutsideRoot {
  readonly root: string
  readonly store: 'git' | 'folder'
  /** HEAD, or WORKTREE for a folder store. */
  readonly commit: string
  readonly label: string
  readonly files: readonly { readonly path: string; readonly text: string }[]
}

export interface ScanInput {
  readonly gitPath: string
  readonly roots: readonly string[]
  readonly basePathOf: (root: string) => string | undefined
  readonly patterns: readonly CompiledPattern[]
  readonly unshared: (id: string) => boolean
  readonly signal?: AbortSignal
  readonly folderStores?: readonly { readonly root: string; readonly store: NoteStore }[]
  readonly outside?: readonly OutsideRoot[]
  /** The git runner of one root. Tests give a counting runner. */
  readonly runnerOf?: (root: string) => GitRunner
}

const runnerOf = (input: ScanInput, root: string): GitRunner =>
  input.runnerOf?.(root) ?? new ProcessGitRunner(root, input.gitPath)

export type ScanKind = 'notes' | 'full'

export const SCAN_DELAY_MS = 300

/** Two git processes in the common case, and one read for each note when git gave no full answer. */
export const notesOfRoot = async (
  git: GitRunner,
  root: string,
  signal?: AbortSignal,
): Promise<NoteStore> => (await readNotes(git, root, undefined, signal)) ?? new NotesGateway(git)

/** The comment rows of one store. The open rows come from `placedComments`, the same function the editor reads. */
const commentTasksOf = async (
  input: ScanInput,
  git: GitRunner,
  root: string,
  head: string,
  notes: NoteStore,
): Promise<readonly ReviewTask[]> => {
  const book = new CommentBook(notes, noAuthor)
  const closed = (
    await Promise.all((await book.commits()).map((commit) => book.closed(commit)))
  ).flat()
  return [
    ...(await placedComments(git, root, head, notes, undefined, input.signal)).flatMap(
      ({ stored, carry }) =>
        commentTask({ stored, resolved: false }, root, input.unshared(stored.id), carry) ?? [],
    ),
    ...closed.flatMap(
      (stored) => commentTask({ stored, resolved: true }, root, input.unshared(stored.id)) ?? [],
    ),
  ]
}

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
  const git = runnerOf(input, root)
  const head = await git.run(['rev-parse', '-q', '--verify', 'HEAD^{commit}'], input.signal)
  if (!ran(head)) throw new Error(head.stderr.trim() || 'Git did not answer.')
  const commit = revisionOf(isOk(head) ? kotlinTrim(head.stdout) : undefined)
  const repository = repositoryOf(input.basePathOf(root), root)
  const [comments, lines] = await Promise.all([
    notesOfRoot(git, root, input.signal).then((notes) =>
      commentTasksOf(input, git, root, commit, notes),
    ),
    grepTodos(git, searchWords(input.patterns), input.signal),
  ])
  if (lines === undefined) {
    throw new Error('git grep did not answer, so the extension did not read the TODO items.')
  }
  return {
    root,
    commit,
    tasks: [
      ...comments,
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
        tasks: await commentTasksOf(input, runnerOf(input, root), root, WORKTREE, store),
      })),
    )
  ).filter((entry) => entry.tasks.length > 0)

/** The comments and the TODO items of the open files of each outside root. No git grep runs there. */
const outsideTasks = async (input: ScanInput): Promise<readonly RepositoryTasks[]> =>
  (
    await Promise.all(
      (input.outside ?? []).map(async ({ root, store, commit, label, files }) => {
        const git = runnerOf(input, root)
        const open = new Set(files.map((file) => file.path))
        const repository = repositoryOf(input.basePathOf(root), root)
        return {
          root,
          commit,
          outside: label,
          tasks: [
            ...(
              await commentTasksOf(
                input,
                git,
                root,
                commit,
                store === 'git'
                  ? await notesOfRoot(git, root, input.signal)
                  : new FolderNotes(root),
              )
            ).filter((task) => open.has(task.path)),
            ...files.flatMap(({ path, text }) =>
              todosOfFile(repository, root, path, commit, todosOfText(text, input.patterns)),
            ),
          ].map((task) => ({ ...task, outside: true })),
        }
      }),
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
  ...(await outsideTasks(input)),
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
      const git = runnerOf(input, root)
      return {
        ...old,
        tasks: [
          ...(await commentTasksOf(
            input,
            git,
            root,
            old.commit,
            await notesOfRoot(git, root, input.signal),
          )),
          ...old.tasks.filter((task) => task.kind === 'todo'),
        ],
      }
    })),
    ...(await folderTasks(input)),
    ...(await outsideTasks(input)),
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
    // A folder store entry has no TODO items, the same as in a full scan.
    // An outside entry keeps the text of the open document that the scan read.
    if (repo.outside !== undefined || !roots.includes(repo.root)) return repo
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
