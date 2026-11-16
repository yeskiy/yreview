import './comments'
import { afterContent, api } from './main'

/** The webview host shows a page at its load, or 200 ms after it writes the page. */
const STALL_MS = 1000
const { build } = JSON.parse(document.body.dataset.yreviewPreview ?? '{}') as { build?: number }

afterContent.forEach((hook) => hook())
api.postMessage({ type: 'ready', build })

// A late load of the page before can stop the host timer of this page, so this page stays hidden.
const checkShown = (): void => {
  setTimeout(() => {
    if (window.frameElement?.id === 'pending-frame') api.postMessage({ type: 'stalled', build })
  }, STALL_MS)
}
if (document.readyState === 'complete') checkShown()
else window.addEventListener('load', checkShown, { once: true })
