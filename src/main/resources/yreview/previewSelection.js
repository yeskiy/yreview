// Sends the selection of the Markdown preview to Yreview as md-src-pos offsets.
(() => {
  const meta = document.querySelector('meta[name="markdown-position-attribute-name"]')
  const attribute = (meta && meta.getAttribute('content')) || 'md-src-pos'
  const POSITION = /^(\d+)\.\.(\d+)$/
  const edgeOf = (container, offset) => {
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement
    const holder = element && element.closest('[' + attribute + ']')
    const match = holder && POSITION.exec(holder.getAttribute(attribute) || '')
    if (!match) return null
    const before = document.createRange()
    before.setStart(holder, 0)
    before.setEnd(container, offset)
    return { from: Number(match[1]), to: Number(match[2]), breaks: before.toString().split('\n').length - 1 }
  }
  const send = (text) => window.__IntelliJTools?.messagePipe?.post('yreview/selection', text)
  const timer = { id: 0 }
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer.id)
    timer.id = setTimeout(() => {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        if (document.hasFocus()) send('')
        return
      }
      const range = selection.getRangeAt(0)
      const start = edgeOf(range.startContainer, range.startOffset)
      const end = edgeOf(range.endContainer, range.endOffset)
      send(start && end ? JSON.stringify({ start, end }) : '')
    }, 100)
  })
})()
