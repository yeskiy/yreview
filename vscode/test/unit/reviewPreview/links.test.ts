import assert from 'node:assert/strict'
import path from 'node:path'

import { linkTarget } from '../../../src/reviewPreview/links'

const root = path.resolve('/work/demo')
const doc = path.join(root, 'docs', 'a.md')

describe('the target of a link in the review preview', () => {
  it('opens web and mail links outside', () => {
    assert.deepEqual(linkTarget('https://example.com/x', doc, root), {
      kind: 'external',
      uri: 'https://example.com/x',
    })
    assert.deepEqual(linkTarget('mailto:a@b.c', doc, root), {
      kind: 'external',
      uri: 'mailto:a@b.c',
    })
  })

  it('opens a relative file under the root', () => {
    assert.deepEqual(linkTarget('b.md#part', doc, root), {
      kind: 'file',
      path: path.join(root, 'docs', 'b.md'),
    })
    assert.deepEqual(linkTarget('../README.md', doc, root), {
      kind: 'file',
      path: path.join(root, 'README.md'),
    })
    assert.deepEqual(linkTarget('/src/x.ts', doc, root), {
      kind: 'file',
      path: path.join(root, 'src', 'x.ts'),
    })
    assert.deepEqual(linkTarget('my%20file.md', doc, root), {
      kind: 'file',
      path: path.join(root, 'docs', 'my file.md'),
    })
  })

  it('refuses a file outside the root, other schemes and broken text', () => {
    assert.equal(linkTarget('../../../etc/passwd', doc, root), undefined)
    assert.equal(linkTarget('command:workbench.action.terminal.new', doc, root), undefined)
    assert.equal(linkTarget(['javascript', 'alert(1)'].join(':'), doc, root), undefined)
    assert.equal(linkTarget('file:///etc/passwd', doc, root), undefined)
    assert.equal(linkTarget('vscode://x', doc, root), undefined)
    assert.equal(linkTarget('%E0%A4%A', doc, root), undefined)
    assert.equal(linkTarget('/x.md', doc, undefined), undefined)
    assert.equal(linkTarget('#part', doc, root), undefined)
  })
})
