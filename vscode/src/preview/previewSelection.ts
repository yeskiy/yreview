/// <reference lib="dom" />
import { selectionLines } from './previewDom'
import { END_KEY, START_KEY } from './previewLines'

// The webview gives this JSON to the commands of its context menu. It holds only line numbers.
const CONTEXT = 'data-vscode-context'

// The capture phase runs before the context menu handler of the webview.
window.addEventListener(
  'contextmenu',
  (event) => {
    const span = selectionLines(document, event.target)
    if (span === undefined) document.documentElement.removeAttribute(CONTEXT)
    else
      document.documentElement.setAttribute(
        CONTEXT,
        JSON.stringify({ [START_KEY]: span.start, [END_KEY]: span.end }),
      )
  },
  true,
)
