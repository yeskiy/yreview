import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>

describe('manifest', () => {
  it('names the store id yeskiy.yreview', () => {
    assert.equal(`${String(manifest.publisher)}.${String(manifest.name)}`, 'yeskiy.yreview')
    assert.equal(manifest.displayName, 'Yreview')
  })

  it('runs only on the workspace host and has no web entry point', () => {
    assert.deepEqual(manifest.extensionKind, ['workspace'])
    assert.equal(manifest.browser, undefined)
  })

  it('refuses untrusted and virtual workspaces', () => {
    const capabilities = manifest.capabilities as Record<string, unknown>
    assert.equal((capabilities.untrustedWorkspaces as Record<string, unknown>).supported, false)
    assert.equal(capabilities.virtualWorkspaces, false)
  })

  it('contributes no telemetry setting', () => {
    assert.doesNotMatch(JSON.stringify(manifest.contributes), /telemetry/i)
  })

  it('carries the license of the repository', () => {
    assert.equal(
      readFileSync(path.join(root, 'LICENSE'), 'utf8'),
      readFileSync(path.join(root, '..', 'LICENSE'), 'utf8'),
    )
  })
})
