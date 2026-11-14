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

const stopTree = (pid: number | undefined): void => {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => undefined)
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    // ESRCH: the process group already ended.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
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
      const outcome: { result?: GitResult; error?: unknown; stopped: boolean } = { stopped: false }
      // A child of git can keep a pipe open, so the runner also closes its own ends of the pipes.
      const halt = (result?: GitResult, error?: unknown): void => {
        if (outcome.stopped) return
        Object.assign(outcome, { result, error, stopped: true })
        stopTree(child.pid)
        child.stdout.destroy()
        child.stderr.destroy()
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
      const settle = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      child.on('error', () => {
        settle()
        resolve(NO_GIT)
      })
      child.on('close', (code) => {
        settle()
        if (outcome.error !== undefined) {
          reject(outcome.error)
          return
        }
        resolve(
          outcome.result ?? {
            exitCode: code ?? 1,
            stdout: Buffer.concat(chunks[0]).toString('utf8'),
            stderr: Buffer.concat(chunks[1]).toString('utf8'),
          },
        )
      })
    })
  }
}
