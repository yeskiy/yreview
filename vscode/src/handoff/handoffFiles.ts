import { randomUUID } from 'node:crypto'
import { appendFile, copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type TaskDocument, encodeTaskDocument } from '../core/taskDocument'
import { cleanText } from '../tasks/taskText'
import { GUIDE_NAME, GUIDE_TEXT } from './agentGuide'

export const TASKS_NAME = 'tasks.json'
export const DONE_NAME = 'done.txt'

// An agent that holds the target open makes a rename fail on Windows.
const NO_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES', 'EXDEV'])

/** The three files of the file protocol in one window folder. Git never tracks the git directory. */
export class HandoffFiles {
  constructor(readonly folder: string) {}

  get guide(): string {
    return path.join(this.folder, GUIDE_NAME)
  }

  get tasks(): string {
    return path.join(this.folder, TASKS_NAME)
  }

  get done(): string {
    return path.join(this.folder, DONE_NAME)
  }

  /** The rules and the tasks of one send. An empty done file appears, and its lines stay. */
  async write(document: TaskDocument): Promise<void> {
    await mkdir(this.folder, { recursive: true })
    await this.replace(this.guide, `${GUIDE_TEXT}\n`)
    await this.writeTasks(document)
    await appendFile(this.done, '')
  }

  /** The task file alone. Every task text loses the control characters that a terminal runs. */
  async writeTasks(document: TaskDocument): Promise<void> {
    await this.replace(
      this.tasks,
      `${encodeTaskDocument({
        ...document,
        tasks: document.tasks.map((task) => ({ ...task, text: cleanText(task.text) })),
      })}\n`,
    )
  }

  /** A temporary file, then a rename. An agent can read while the extension writes. */
  private async replace(target: string, content: string): Promise<void> {
    const temporary = path.join(this.folder, `${path.basename(target)}.${randomUUID()}.tmp`)
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, target).catch(async (error: NodeJS.ErrnoException) => {
      if (!NO_RENAME.has(error.code ?? '')) {
        await rm(temporary, { force: true })
        throw error
      }
      await copyFile(temporary, target).finally(() => rm(temporary, { force: true }))
    })
  }
}
