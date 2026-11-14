import { NotesGateway, type NoteStore } from '../git/notes'
import { ProcessGitRunner } from '../git/runner'
import { CommentBook } from '../store/commentBook'
import { FolderNotes } from '../store/folderNotes'
import type { ReviewService } from '../store/reviewService'
import { noAuthor, readNotes } from './noteScan'
import type { ReviewTask } from './reviewTask'
import type { CompletionHost, FoundComment } from './taskCompletion'

const tasksOf = async (found: Omit<FoundComment, 'stored'>, store: NoteStore) =>
  (await new CommentBook(store, noAuthor).tasks()).map((stored) => ({ ...found, stored }))

/** The host of the workspace. Phase 4 passes the sent tasks of the handoff folder. */
export const projectCompletionHost = (
  service: ReviewService,
  gitPath: string,
  roots: () => Promise<readonly string[]>,
  openTodos: () => Promise<readonly ReviewTask[]>,
  sent: (open: readonly ReviewTask[]) => Promise<ReadonlySet<string>> = () =>
    Promise.resolve(new Set()),
): CompletionHost => ({
  comments: async () =>
    (
      await Promise.all([
        ...(await roots()).map(async (root) => {
          const git = new ProcessGitRunner(root, gitPath)
          return tasksOf(
            { store: 'git', root },
            (await readNotes(git, root)) ?? new NotesGateway(git),
          )
        }),
        ...(await service.folderStores(false)).map(({ root, store }) =>
          tasksOf({ store: 'folder', root }, store),
        ),
      ])
    ).flat(),
  isClosed: async (found) =>
    (
      await new CommentBook(
        found.store === 'folder'
          ? new FolderNotes(found.root)
          : new NotesGateway(new ProcessGitRunner(found.root, gitPath)),
        noAuthor,
      ).closed(found.stored.commit)
    ).some((stored) => stored.id === found.stored.id),
  resolve: async (found) => {
    await service.resolve(
      {
        store: found.store,
        root: found.root,
        head: found.stored.commit,
        path: found.stored.record.location?.path ?? '',
      },
      found.stored.id,
    )
  },
  openTodos,
  sent,
})
