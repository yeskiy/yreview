import assert from 'node:assert/strict'

import { DEFAULT_TAB, TabStates, readTab } from '../../../src/tasks/tabState'

describe('tab state', () => {
  const memory = () => {
    const values = new Map<string, unknown>()
    return {
      get: (key: string): unknown => values.get(key),
      update: (key: string, value: unknown): Promise<void> => {
        values.set(key, value)
        return Promise.resolve()
      },
    }
  }

  it('a new view gets the defaults', () => {
    assert.deepEqual(new TabStates(memory()).get('yreview.project'), DEFAULT_TAB)
  })

  it('each view keeps its own state', async () => {
    const tabs = new TabStates(memory())
    await tabs.set('yreview.project', { byDirectory: true })
    assert.equal(tabs.get('yreview.project').byDirectory, true)
    assert.equal(tabs.get('yreview.changes').byDirectory, false)
  })

  it('a bad stored value falls back to the default of that field', () => {
    assert.deepEqual(
      readTab({
        byFolder: 'yes',
        kindFilter: 'all',
        todoFilterName: 3,
        showResolved: true,
        scopeGlob: 'src/**',
      }),
      { ...DEFAULT_TAB, showResolved: true, scopeGlob: 'src/**' },
    )
  })
})
