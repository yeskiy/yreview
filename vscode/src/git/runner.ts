import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn } from 'node:child_process'

export interface GitResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface GitRunner {
  run(args: readonly string[], signal?: AbortSignal): Promise<GitResult>
}

export interface RunnerLimits {
  readonly waitMs: number
  readonly maxOutputBytes: number
}

/** Exit codes that no git process makes. A git exit code is never negative. */
export const DID_NOT_START = -2
export const TOO_MUCH_OUTPUT = -1
export const TIMED_OUT = -3

export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
export const WAIT_MS = 120_000

export const isOk = (result: GitResult): boolean => result.exitCode === 0

const started = { count: 0 }

const background = new AsyncLocalStorage<boolean>()

/** The number of git processes that the actions started, with no background scan. The action log uses it. */
export const gitCalls = (): number => started.count

/** Runs work whose git processes gitCalls does not count, for example the scan of the task views. */
export const inBackground = <T>(work: () => Promise<T>): Promise<T> => background.run(true, work)

/** False for an answer of the runner, which states nothing about the repository. */
export const ran = (result: GitResult): boolean => result.exitCode >= 0

/** Variables that point git at a repository other than the working directory of the runner. */
const REPOSITORY_OVERRIDES = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
])

const childEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !REPOSITORY_OVERRIDES.has(name.toUpperCase())),
  )

const NO_GIT: GitResult = {
  exitCode: DID_NOT_START,
  stdout: '',
  stderr: 'The extension could not start git. Set the path to git in the setting git.path.',
}

const timedOut = (waitMs: number): GitResult => ({
  exitCode: TIMED_OUT,
  stdout: '',
  stderr:
    `Git did not stop in ${waitMs / 1000} seconds, so the extension stopped it. ` +
    'Git can wait for a password or for a credential window. Make sure that git runs without input.',
})

const refusedOutput = (maxBytes: number): GitResult => ({
  exitCode: TOO_MUCH_OUTPUT,
  stdout: '',
  stderr: `The git command wrote more than ${maxBytes} bytes. The extension stopped the command and refused the answer.`,
})

/** ESRCH: the group ended. EPERM: the group is not ours, or on macOS holds only a zombie leader. */
const GROUP_GONE = new Set(['ESRCH', 'EPERM'])

/** Stops the process and its children. It never throws, and gives the error of a kill that failed. */
export const stopTree = (
  pid: number | undefined,
  platform: NodeJS.Platform = process.platform,
  kill: (pid: number, signal: NodeJS.Signals) => true = process.kill.bind(process),
): unknown => {
  if (pid === undefined) return undefined
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => undefined)
    return undefined
  }
  try {
    // The child is spawned detached, so it leads its own process group and -pid names that group.
    kill(-pid, 'SIGKILL')
    return undefined
  } catch (error) {
    return GROUP_GONE.has((error as NodeJS.ErrnoException).code ?? '') ? undefined : error
  }
}

/** Runs git with no shell. A run stops after the time limit, on a cancel, or at the output cap. */
export class ProcessGitRunner implements GitRunner {
  constructor(
    private readonly cwd: string,
    private readonly gitPath = 'git',
    private readonly limits: RunnerLimits = { waitMs: WAIT_MS, maxOutputBytes: MAX_OUTPUT_BYTES },
  ) {}

  async run(args: readonly string[], signal?: AbortSignal): Promise<GitResult> {
    signal?.throwIfAborted()
    if (background.getStore() !== true) started.count += 1
    return new Promise((resolve, reject) => {
      const child = spawn(this.gitPath, args, {
        cwd: this.cwd,
        env: childEnv(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
      const chunks: [Buffer[], Buffer[]] = [[], []]
      const sizes = [0, 0]
      const outcome: {
        result?: GitResult
        error?: unknown
        stopped: boolean
        settled: boolean
        unwatch: () => void
      } = { stopped: false, settled: false, unwatch: () => undefined }
      const finish = (answer: () => void): void => {
        if (outcome.settled) return
        outcome.settled = true
        outcome.unwatch()
        answer()
      }
      // A child of git can keep a pipe open, so the runner also closes its own ends of the pipes.
      const halt = (result?: GitResult, error?: unknown): void => {
        if (outcome.stopped) return
        Object.assign(outcome, { result, error, stopped: true })
        const failure = stopTree(child.pid)
        child.stdout.destroy()
        child.stderr.destroy()
        if (failure === undefined) return
        // The group did not stop, so 'close' can be late. Stop the child alone and answer now.
        child.kill('SIGKILL')
        finish(() => reject(error ?? failure))
      }
      ;[child.stdout, child.stderr].forEach((stream, index) =>
        stream.on('data', (chunk: Buffer) => {
          sizes[index] = (sizes[index] ?? 0) + chunk.length
          if ((sizes[index] ?? 0) > this.limits.maxOutputBytes) {
            halt(refusedOutput(this.limits.maxOutputBytes))
          } else chunks[index as 0 | 1].push(chunk)
        }),
      )
      const timer = setTimeout(() => halt(timedOut(this.limits.waitMs)), this.limits.waitMs)
      const onAbort = (): void => halt(undefined, signal?.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
      outcome.unwatch = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      child.on('error', () => finish(() => resolve(NO_GIT)))
      child.on('close', (code) =>
        finish(() =>
          outcome.error === undefined
            ? resolve(
                outcome.result ?? {
                  exitCode: code ?? 1,
                  stdout: Buffer.concat(chunks[0]).toString('utf8'),
                  stderr: Buffer.concat(chunks[1]).toString('utf8'),
                },
              )
            : reject(outcome.error),
        ),
      )
    })
  }
}
