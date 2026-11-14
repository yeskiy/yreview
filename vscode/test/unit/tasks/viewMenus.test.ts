import assert from 'node:assert/strict'

import { DEFAULT_TAB } from '../../../src/tasks/tabState'
import {
  VIEW_ACTIONS,
  filterItems,
  groupItems,
  menuWhen,
  pickLabel,
} from '../../../src/tasks/viewMenus'

const actionOf = (name: string) =>
  VIEW_ACTIONS.find((item) => item.action === name) ?? assert.fail(`no action ${name}`)

describe('view menus', () => {
  it('the filter menu names every kind, then the TODO filters, then the scope', () => {
    assert.deepEqual(
      filterItems(DEFAULT_TAB, [{ name: 'Mine', patterns: ['a'] }]).map((item) => item.label),
      [
        'Comments and TODO Items',
        'Review Comments Only',
        'TODO Items Only',
        'TODO Filters',
        'Show All TODO Items',
        'Mine',
        'Scope',
        'Every File',
        'Files That Match a Glob Pattern...',
      ],
    )
    assert.deepEqual(
      filterItems(DEFAULT_TAB, [{ name: 'Mine', patterns: ['a'] }])
        .filter((item) => item.separator === true)
        .map((item) => item.label),
      ['TODO Filters', 'Scope'],
    )
  })

  it('the chosen kind and filter carry the mark', () => {
    const picked = filterItems({ ...DEFAULT_TAB, kindFilter: 'todos', todoFilterName: 'Mine' }, [
      { name: 'Mine', patterns: ['a'] },
    ])
      .slice(0, 6)
      .filter((item) => item.picked)
      .map((item) => item.label)
    assert.deepEqual(picked, ['TODO Items Only', 'Mine'])
  })

  it('a filter choice names its change', () => {
    const mine = filterItems(DEFAULT_TAB, [{ name: 'Mine', patterns: ['a'] }]).find(
      (item) => item.label === 'Mine',
    )
    assert.deepEqual(mine?.change, { todoFilterName: 'Mine' })
  })

  it('the glob item asks for the pattern', () => {
    const last = filterItems({ ...DEFAULT_TAB, scopeGlob: 'src/**' }, []).at(-1)
    assert.equal(last?.askGlob, true)
    assert.equal(last?.description, 'src/**')
  })

  it('the group menu toggles each choice', () => {
    const items = groupItems({ ...DEFAULT_TAB, byFolder: true })
    assert.deepEqual(
      items.map((item) => [item.label, item.picked, item.change]),
      [
        ['Group by Workspace Folder', true, { byFolder: false }],
        ['Group by Directory', false, { byDirectory: true }],
      ],
    )
  })

  it('flatten shows with the directory grouping only', () => {
    const items = groupItems({ ...DEFAULT_TAB, byDirectory: true })
    assert.equal(items.length, 3)
    assert.equal(items[2]?.label, 'Flatten Directories')
    assert.deepEqual(items[2]?.change, { flatten: true })
  })

  it('a picked item shows the check icon', () => {
    assert.equal(pickLabel({ label: 'A', picked: true }), '$(check) A')
    assert.equal(pickLabel({ label: 'B', picked: false }), '$(blank) B')
    assert.equal(pickLabel({ label: 'Scope', picked: false, separator: true }), 'Scope')
  })

  it('the conditions of a menu entry', () => {
    assert.equal(
      menuWhen('project', actionOf('showResolved')),
      'view == yreview.project && !yreview.project.resolvedShown',
    )
    assert.equal(menuWhen('changes', actionOf('filter')), 'view == yreview.changes')
  })
})
