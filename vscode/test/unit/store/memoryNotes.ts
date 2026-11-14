import type { Change, NoteStore } from '../../../src/git/notes'

/** A note store in memory, keyed by ref and commit. */
export class MemoryNotes implements NoteStore {
  readonly notes = new Map<string, readonly string[]>()

  private static key(ref: string, commit: string): string {
    return `${ref}\u0000${commit}`
  }

  readLines(ref: string, commit: string): Promise<readonly string[]> {
    return Promise.resolve(this.notes.get(MemoryNotes.key(ref, commit)) ?? [])
  }

  readOrRefuse(ref: string, commit: string): Promise<readonly string[]> {
    return this.readLines(ref, commit)
  }

  append(ref: string, commit: string, line: string): Promise<void> {
    this.notes.set(MemoryNotes.key(ref, commit), [
      ...(this.notes.get(MemoryNotes.key(ref, commit)) ?? []),
      line,
    ])
    return Promise.resolve()
  }

  async rewrite(ref: string, commit: string, lines: readonly string[]): Promise<void> {
    await this.edit(ref, commit, () => lines)
  }

  async edit(ref: string, commit: string, change: Change): Promise<readonly string[]> {
    const before = await this.readLines(ref, commit)
    const after = await change(before)
    if (after.length === 0) this.notes.delete(MemoryNotes.key(ref, commit))
    else this.notes.set(MemoryNotes.key(ref, commit), after)
    return before
  }

  commitsWithNotes(ref: string): Promise<readonly string[]> {
    return Promise.resolve(
      [...this.notes.keys()]
        .filter((key) => key.startsWith(`${ref}\u0000`))
        .map((key) => key.slice(ref.length + 1)),
    )
  }

  commitsOrRefuse(ref: string): Promise<readonly string[]> {
    return this.commitsWithNotes(ref)
  }
}
