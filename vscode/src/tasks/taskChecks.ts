import type { ReviewTask } from './reviewTask'

export type CheckState = 'none' | 'some' | 'all'

/** Two repositories can hold the same relative path, so the key names the file too. */
export const checkKey = (task: ReviewTask): string => `${task.filePath}\n${task.id}`

/** The checked tasks of one view. The keys outlive a reload of the tree. */
export class TaskChecks {
  private readonly checked = new Set<string>()

  get size(): number {
    return this.checked.size
  }

  isChecked(task: ReviewTask): boolean {
    return this.checked.has(checkKey(task))
  }

  set(tasks: readonly ReviewTask[], value: boolean): void {
    tasks.forEach((task) => {
      if (value) this.checked.add(checkKey(task))
      else this.checked.delete(checkKey(task))
    })
  }

  clear(): void {
    this.checked.clear()
  }

  state(tasks: readonly ReviewTask[]): CheckState {
    const hits = tasks.filter((task) => this.isChecked(task)).length
    if (hits === 0) return 'none'
    return hits === tasks.length ? 'all' : 'some'
  }

  checkedOf(tasks: readonly ReviewTask[]): readonly ReviewTask[] {
    return tasks.filter((task) => this.isChecked(task))
  }
}
