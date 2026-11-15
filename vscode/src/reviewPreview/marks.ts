import { shownRange } from '../core/lineMap'
import { isShared } from '../store/noteRefs'
import type { Placed } from '../tasks/placedComments'
import type { PreviewMark } from './protocol'

/** The marks of the open comments that the editor draws, at their lines in the working tree. */
export const marksOf = (placed: readonly Placed[]): PreviewMark[] =>
  placed.flatMap(({ stored, carry }) => {
    const range = shownRange(carry)
    return range === undefined
      ? []
      : [
          {
            id: stored.id,
            start: range.startLine - 1,
            end: range.endLine - 1,
            outdated: carry.kind === 'outdated',
            author: stored.record.author,
            time: stored.record.timestamp,
            text: stored.record.description ?? '',
            shared: isShared(stored.ref),
          },
        ]
  })
