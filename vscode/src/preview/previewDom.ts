/// <reference lib="dom" />
import { type LineRange, type TextBlock, leavesOf, lineOf, selectionSpan } from './previewLines'

/** The blocks of a rendered preview, in document order. */
export const blocksOf = (root: ParentNode): TextBlock<HTMLElement>[] =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-line]')).flatMap((node) => {
    const start = lineOf(node.dataset.line)
    if (start === undefined) return []
    const end = lineOf(node.dataset.lineEnd)
    return [
      {
        node,
        start,
        end: end === undefined || end < start ? start : end,
        text: lineOf(node.dataset.lineText) ?? start,
      },
    ]
  })

/** True when the range and the content of the node share at least one position. */
const intersects = (range: Range, node: Node): boolean => {
  const own = node.ownerDocument?.createRange()
  if (own === undefined) return false
  own.selectNodeContents(node)
  return (
    range.compareBoundaryPoints(Range.END_TO_START, own) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, own) > 0
  )
}

/** The text of the node before one end of the range, or undefined when that end is outside it. */
const textBefore = (range: Range, node: Node, edge: 'start' | 'end'): string | undefined => {
  const container = edge === 'start' ? range.startContainer : range.endContainer
  const own = node.ownerDocument?.createRange()
  if (own === undefined || !node.contains(container)) return undefined
  own.setStart(node, 0)
  own.setEnd(container, edge === 'start' ? range.startOffset : range.endOffset)
  return own.toString()
}

const selected = (root: ParentNode): Range | undefined => {
  const selection = (root instanceof Document ? root : root.ownerDocument)?.getSelection()
  return selection != null && !selection.isCollapsed && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : undefined
}

const contains = (outer: HTMLElement, inner: HTMLElement): boolean =>
  outer !== inner && outer.contains(inner)

/** The lines of the selection, else the lines of the innermost block that holds the target. */
export const selectionLines = (
  root: ParentNode,
  target: EventTarget | null,
): LineRange | undefined => {
  const blocks = blocksOf(root)
  const range = selected(root)
  if (range !== undefined)
    return selectionSpan(
      blocks,
      (node) => intersects(range, node),
      contains,
      (node, edge) => textBefore(range, node, edge),
    )
  const [hit] = leavesOf(
    blocks.filter(({ node }) => target instanceof Node && node.contains(target)),
    contains,
  )
  return hit === undefined ? undefined : { start: hit.start, end: hit.end }
}
