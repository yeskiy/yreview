/// <reference lib="dom" />
import { blocksOf, selectionLines } from '../../preview/previewDom'
import {
  END_KEY,
  type LineRange,
  START_KEY,
  type TextBlock,
  leavesOf,
} from '../../preview/previewLines'
import type { PreviewMark, ToWebview } from '../protocol'
import { afterContent, api, content, onMessage } from './main'

interface Box {
  readonly lines: LineRange
  readonly form: HTMLFormElement
  readonly text: HTMLTextAreaElement
  readonly error: HTMLElement
  readonly shared: boolean
}

const state: {
  last: LineRange | undefined
  clicked: LineRange | undefined
  marks: readonly PreviewMark[]
  box: Box | undefined
  open: string | undefined
} = { last: undefined, clicked: undefined, marks: [], box: undefined, open: undefined }

const label = ({ start, end }: LineRange): string => `${start + 1}-${end + 1}`

const contains = (outer: HTMLElement, inner: HTMLElement): boolean =>
  outer !== inner && outer.contains(inner)

/** The child of the content that holds the node, so an added part never lands inside a list. */
const topOf = (node: HTMLElement): HTMLElement =>
  node.parentElement === content || node.parentElement === null ? node : topOf(node.parentElement)

/** The last top-level block that a line range touches. */
const anchorOf = (lines: LineRange): HTMLElement | undefined =>
  blocksOf(content)
    .filter((block) => block.start <= lines.end && block.end >= lines.start)
    .map((block) => topOf(block.node))
    .at(-1)

const button = (text: string, name: string, action: () => void): HTMLButtonElement => {
  const made = document.createElement('button')
  made.type = 'button'
  made.className = name
  made.textContent = text
  made.addEventListener('click', action)
  return made
}

const saveDraft = (): void =>
  api.setState({
    ...(api.getState() as object | undefined),
    draft:
      state.box === undefined ? undefined : { lines: state.box.lines, text: state.box.text.value },
  })

const closeBox = (): void => {
  state.box?.form.remove()
  state.box = undefined
  saveDraft()
}

const setBusy = (box: Box, busy: boolean): void => {
  box.form.classList.toggle('yreview-saving', busy)
  box.form.querySelectorAll('button').forEach((item) => item.toggleAttribute('disabled', busy))
}

const save = (shared: boolean): void => {
  const { box } = state
  if (box === undefined) return
  if (box.text.value.trim() === '') {
    box.error.textContent = 'Write the comment text first.'
    return
  }
  setBusy(box, true)
  api.postMessage({ type: 'save', lines: box.lines, text: box.text.value, shared })
}

/** Puts the box after the last block of its lines. A content change calls it again. */
const placeBox = (): void => {
  const { box } = state
  const anchor = box === undefined ? undefined : anchorOf(box.lines)
  if (box !== undefined && anchor !== undefined) anchor.after(box.form)
}

/** Ctrl+Enter saves. A first Escape on typed text warns, and a second Escape discards it. */
const onBoxKey = (event: KeyboardEvent): void => {
  const { box } = state
  if (box === undefined) return
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    save(box.shared)
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (box.text.value.trim() === '' || box.error.dataset.discard === 'yes') closeBox()
  else {
    box.error.dataset.discard = 'yes'
    box.error.textContent = 'Press Escape again to discard the text.'
  }
}

const openBox = (lines: LineRange, shared: boolean, text = ''): void => {
  closeBox()
  const form = document.createElement('form')
  form.className = 'yreview-box'
  form.dataset.lines = label(lines)
  const title = document.createElement('div')
  title.className = 'yreview-box-lines'
  title.textContent =
    lines.start === lines.end ? `Line ${lines.start + 1}` : `Lines ${label(lines)}`
  const area = document.createElement('textarea')
  area.rows = 4
  area.value = text
  area.placeholder = 'Write a review comment.'
  area.setAttribute('aria-label', 'Review comment')
  const error = document.createElement('div')
  error.className = 'yreview-box-error'
  error.setAttribute('role', 'alert')
  const actions = document.createElement('div')
  actions.className = 'yreview-box-actions'
  actions.append(
    ...(shared ? [true, false] : [false, true]).map((kind) =>
      button(
        kind ? 'Save Shared' : 'Save Local',
        kind ? 'yreview-save-shared' : 'yreview-save-local',
        () => save(kind),
      ),
    ),
    button('Cancel', 'yreview-cancel', closeBox),
  )
  form.append(title, area, error, actions)
  form.addEventListener('submit', (event) => event.preventDefault())
  area.addEventListener('input', saveDraft)
  area.addEventListener('keydown', onBoxKey)
  state.box = { lines, form, text: area, error, shared }
  placeBox()
  area.focus()
  saveDraft()
}

// --- Marks ---

const markedLeaves = (): TextBlock<HTMLElement>[] => leavesOf(blocksOf(content), contains)

const touches = (block: TextBlock<HTMLElement>, mark: PreviewMark): boolean =>
  block.start <= mark.end && block.end >= mark.start

const cardOf = (marks: readonly PreviewMark[]): HTMLElement => {
  const card = document.createElement('div')
  card.className = 'yreview-card'
  card.append(
    ...marks.map((mark) => {
      const item = document.createElement('section')
      const head = document.createElement('div')
      head.className = 'yreview-card-head'
      head.textContent = [
        mark.author,
        new Date(mark.time).toLocaleString(),
        mark.shared ? 'shared' : 'local',
        mark.outdated ? 'Outdated' : '',
      ]
        .filter((part) => part !== '')
        .join(' - ')
      const body = document.createElement('div')
      body.className = 'yreview-card-body'
      body.textContent = mark.text
      const actions = document.createElement('div')
      actions.className = 'yreview-box-actions'
      actions.append(
        button('Resolve', 'yreview-resolve', () =>
          api.postMessage({ type: 'resolve', id: mark.id }),
        ),
        button('Delete', 'yreview-delete', () => api.postMessage({ type: 'delete', id: mark.id })),
        button('Show in Source', 'yreview-reveal', () =>
          api.postMessage({ type: 'reveal', id: mark.id }),
        ),
      )
      item.append(head, body, actions)
      return item
    }),
  )
  return card
}

/** Draws the marks, one badge for each group of comments that start in one block, and the open card. */
const drawMarks = (): void => {
  content
    .querySelectorAll('.yreview-mark, .yreview-mark-outdated')
    .forEach((node) => node.classList.remove('yreview-mark', 'yreview-mark-outdated'))
  content.querySelectorAll('.yreview-badge, .yreview-card').forEach((node) => node.remove())
  const leaves = markedLeaves()
  state.marks.forEach((mark) =>
    leaves
      .filter((block) => touches(block, mark))
      .forEach((block) =>
        block.node.classList.add(mark.outdated ? 'yreview-mark-outdated' : 'yreview-mark'),
      ),
  )
  const groups = state.marks.reduce((all, mark) => {
    const first = leaves.find((block) => touches(block, mark))
    return first === undefined ? all : all.set(first, [...(all.get(first) ?? []), mark])
  }, new Map<TextBlock<HTMLElement>, PreviewMark[]>())
  groups.forEach((marks, block) => {
    const key = label(block)
    const badge = button(String(marks.length), 'yreview-badge', () => {
      state.open = state.open === key ? undefined : key
      drawMarks()
    })
    badge.dataset.lines = key
    badge.title = marks.length === 1 ? '1 review comment' : `${marks.length} review comments`
    block.node.prepend(badge)
    if (state.open === key) topOf(block.node).after(cardOf(marks))
  })
}

// --- Wiring ---

document.addEventListener('selectionchange', () => {
  const lines = selectionLines(content, null)
  if (lines !== undefined) state.last = lines
  else if (document.hasFocus()) state.last = undefined
})

content.addEventListener('click', (event) => {
  state.clicked = selectionLines(content, event.target) ?? state.clicked
})

// The capture phase runs before the context menu handler of the webview.
window.addEventListener(
  'contextmenu',
  (event) => {
    const lines = selectionLines(content, event.target)
    if (lines === undefined) document.documentElement.removeAttribute('data-vscode-context')
    else
      document.documentElement.setAttribute(
        'data-vscode-context',
        JSON.stringify({ [START_KEY]: lines.start, [END_KEY]: lines.end }),
      )
  },
  true,
)

onMessage.push((message: ToWebview) => {
  if (message.type === 'openBox') {
    const lines = message.lines ?? selectionLines(content, null) ?? state.last ?? state.clicked
    if (lines === undefined) api.postMessage({ type: 'noLines' })
    else if (state.box !== undefined && label(state.box.lines) === label(lines))
      state.box.text.focus()
    else openBox(lines, message.shared)
  }
  if (message.type === 'saved') closeBox()
  if (message.type === 'failed' && state.box !== undefined) {
    setBusy(state.box, false)
    state.box.error.textContent = message.message
  }
  if (message.type === 'marks') {
    state.marks = message.marks
    drawMarks()
  }
})

afterContent.push(() => {
  placeBox()
  drawMarks()
})

const draft = (api.getState() as { draft?: { lines?: LineRange; text?: string } } | undefined)
  ?.draft
if (draft?.lines !== undefined) openBox(draft.lines, false, draft.text ?? '')
