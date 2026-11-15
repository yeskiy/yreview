/// <reference lib="dom" />
import { END_KEY, START_KEY, lineOf, spanOf } from './previewLines'

// The webview gives this JSON to the commands of its context menu. It holds only line numbers.
const CONTEXT = 'data-vscode-context'

const blocks = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-line]')).flatMap((node) => {
    const line = lineOf(node.dataset.line)
    return line === undefined ? [] : [{ node, line }]
  })

/** True when the range and the content of the node share at least one position. */
const intersects = (range: Range, node: Node): boolean => {
  const own = document.createRange()
  own.selectNodeContents(node)
  return (
    range.compareBoundaryPoints(Range.END_TO_START, own) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, own) > 0
  )
}

const selected = (): Range | undefined => {
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : undefined
}

/** The lines of the selection, else the lines of the block under the pointer. */
const spanAt = (target: EventTarget | null, range = selected()) =>
  spanOf(
    blocks(),
    (node) =>
      range === undefined
        ? target instanceof Node && node.contains(target)
        : intersects(range, node),
    (outer, inner) => outer !== inner && outer.contains(inner),
  )

// The capture phase runs before the context menu handler of the webview.
window.addEventListener(
  'contextmenu',
  (event) => {
    const span = spanAt(event.target)
    if (span === undefined) document.documentElement.removeAttribute(CONTEXT)
    else
      document.documentElement.setAttribute(
        CONTEXT,
        JSON.stringify({ [START_KEY]: span.start, [END_KEY]: span.end }),
      )
  },
  true,
)
