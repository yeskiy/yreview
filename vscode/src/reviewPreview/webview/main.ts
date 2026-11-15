/// <reference lib="dom" />
import { blocksOf } from '../../preview/previewDom'
import type { FromWebview, ToWebview } from '../protocol'

declare const acquireVsCodeApi: () => {
  postMessage(message: FromWebview): void
  getState(): unknown
  setState(state: unknown): void
}

export const api = acquireVsCodeApi()
export const content = document.getElementById('yreview-content') as HTMLElement
const UPDATE = 'vscode.markdown.updateContent'

/** Hooks that the comment part of the page adds. Each runs after a content change. */
export const afterContent: (() => void)[] = []
export const onMessage: ((message: ToWebview) => void)[] = []

api.setState({
  ...(api.getState() as object | undefined),
  ...(JSON.parse(document.body.dataset.yreviewPreview ?? '{}') as object),
})

/** The CSP of the page blocks the scripts and the event handlers of the rendered HTML. */
const show = (html: string): void => {
  content.innerHTML = html
  afterContent.forEach((hook) => hook())
  window.dispatchEvent(new Event(UPDATE))
}

/** Scrolls so that the source line is at the top, between the blocks around it. */
const scrollToLine = (line: number): void => {
  const before = blocksOf(content)
    .filter((block) => block.start <= line)
    .at(-1)
  if (before === undefined) {
    window.scrollTo(0, 0)
    return
  }
  const box = before.node.getBoundingClientRect()
  const part = Math.min((line - before.start) / Math.max(before.end - before.start + 1, 1), 1)
  window.scrollTo(0, window.scrollY + box.top + box.height * part)
}

window.addEventListener('message', (event: MessageEvent<ToWebview | null>) => {
  const message = event.data
  if (typeof message !== 'object' || message === null) return
  if (message.type === 'content') show(message.html)
  if (message.type === 'scroll') scrollToLine(message.line)
  onMessage.forEach((hook) => hook(message))
})

document.addEventListener(
  'click',
  (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (link === null) return
    // The webview host opens a link that reaches its window listener, and that skips the host check.
    event.preventDefault()
    event.stopPropagation()
    const href = link.getAttribute('href') ?? ''
    if (href.startsWith('#'))
      document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView()
    else api.postMessage({ type: 'openLink', href })
  },
  true,
)

document.addEventListener('dblclick', (event) => {
  const block = blocksOf(content)
    .filter(({ node }) => event.target instanceof Node && node.contains(event.target))
    .at(-1)
  if (block !== undefined) api.postMessage({ type: 'showSource', line: block.start })
})
