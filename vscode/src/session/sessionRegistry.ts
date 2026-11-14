import { CHANNEL, NO_REACH, type SessionReach } from './sessionReach'

export interface SessionEntry {
  readonly key: string
  readonly name: string
  readonly reach: SessionReach
}

/** The open sessions of this window, in start order. The send picker of phase 5 reads it. */
export class SessionRegistry {
  private open: readonly SessionEntry[] = []

  private readonly listeners = new Set<() => void>()

  add(key: string, name: string, reach: SessionReach = CHANNEL): void {
    this.open = [...this.open.filter((entry) => entry.key !== key), { key, name, reach }]
    this.notify()
  }

  rename(key: string, name: string): void {
    this.update(key, (entry) => ({ ...entry, name }))
  }

  setReach(key: string, reach: SessionReach): void {
    this.update(key, (entry) => ({ ...entry, reach }))
  }

  remove(key: string): void {
    this.open = this.open.filter((entry) => entry.key !== key)
    this.notify()
  }

  entries(): readonly SessionEntry[] {
    return this.open
  }

  nameOf(key: string): string | undefined {
    return this.open.find((entry) => entry.key === key)?.name
  }

  reachOf(key: string): SessionReach {
    return this.open.find((entry) => entry.key === key)?.reach ?? NO_REACH
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(key: string, change: (entry: SessionEntry) => SessionEntry): void {
    this.open = this.open.map((entry) => (entry.key === key ? change(entry) : entry))
    this.notify()
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}
