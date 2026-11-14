import { type BatchTask, buildBatches } from './batchBuilder'
import { bridgeFilePath, deleteBridgeFile, writeBridgeFile } from './discoveryFile'
import type { SendReport } from './sendReport'
import { BridgeServer, type ResolveHandler, type Route } from './server'

export type BridgeLookup =
  | { readonly kind: 'available'; readonly url: string; readonly path: string }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'channelOff' }

export interface HostDeps {
  channelOn(): boolean
  projectPath(): string | undefined
  home(): string
  readonly onResolve: ResolveHandler
  readonly routes: ReadonlyMap<string, Route>
  warn(message: string): void
  readonly pid: number
}

interface Running {
  readonly server: BridgeServer
  readonly lookup: BridgeLookup & { readonly kind: 'available' }
}

/** Owns the bridge of one window. It opens a port only when a session, a send or a tool needs it. */
export class BridgeHost {
  private running: Running | undefined

  private disposed = false

  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: HostDeps) {}

  start(): Promise<BridgeLookup> {
    return this.serial(() => this.open())
  }

  stop(): Promise<void> {
    return this.serial(() => this.close())
  }

  dispose(): Promise<void> {
    this.disposed = true
    return this.stop()
  }

  applySwitch(enabled: boolean): Promise<void> {
    return enabled ? this.start().then(() => undefined) : this.stop()
  }

  readerCount(): number {
    return this.running?.server.streamCount() ?? 0
  }

  openKeys(): readonly string[] {
    return this.running?.server.openKeys() ?? []
  }

  /** A target that left reaches zero streams, and the report keeps its name for the notice. */
  async sendTasks(
    branch: string,
    commit: string | undefined,
    tasks: readonly BatchTask[],
    target?: string,
    targetName?: string,
  ): Promise<SendReport> {
    if (commit === undefined) {
      return { tasks: 0, batches: 0, streams: 0, problem: 'The repository has no commit yet.' }
    }
    const lookup = await this.start()
    const server = this.running?.server
    if (lookup.kind !== 'available' || server === undefined) {
      return { tasks: 0, batches: 0, streams: 0, problem: 'The review bridge is not running.' }
    }
    const plan = buildBatches(branch, commit, tasks)
    if (plan.dropped.length > 0) {
      this.deps.warn(
        `The review bridge dropped ${plan.dropped.length} tasks: ${plan.dropped.map((task) => `${task.id} (${task.reason})`).join(', ')}`,
      )
    }
    return {
      tasks: plan.tasks,
      batches: plan.batches.length,
      streams: Math.max(0, ...plan.batches.map((batch) => server.send(batch, target))),
      dropped: plan.dropped.length,
      dropReason: plan.reason === '' ? undefined : plan.reason,
      targetName,
    }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async open(): Promise<BridgeLookup> {
    if (this.running !== undefined) return this.running.lookup
    if (!this.deps.channelOn()) return { kind: 'channelOff' }
    if (this.disposed) return { kind: 'unavailable', reason: 'The window closed.' }
    const projectPath = this.deps.projectPath()
    if (projectPath === undefined) {
      return { kind: 'unavailable', reason: 'The window has no folder.' }
    }
    const server = new BridgeServer(this.deps.onResolve, this.deps.routes)
    const address = await server.start().catch(() => undefined)
    if (address === undefined) {
      await server.stop()
      return { kind: 'unavailable', reason: 'The review bridge did not open a port.' }
    }
    const file = bridgeFilePath(projectPath, this.deps.home())
    const written = await writeBridgeFile(file, {
      url: address.url,
      token: address.token,
      projectPath,
      pid: this.deps.pid,
    }).then(
      () => true,
      () => false,
    )
    if (!written) {
      await server.stop()
      return {
        kind: 'unavailable',
        reason: 'The review bridge did not write the file that a session reads.',
      }
    }
    this.running = { server, lookup: { kind: 'available', url: address.url, path: file } }
    return this.running.lookup
  }

  private async close(): Promise<void> {
    const current = this.running
    this.running = undefined
    if (current === undefined) return
    await deleteBridgeFile(current.lookup.path).catch(() => undefined)
    await current.server.stop()
  }
}
