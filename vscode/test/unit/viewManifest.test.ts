import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { VIEW_ACTIONS, commandOf, menuWhen, rowWhen } from '../../src/tasks/viewMenus'
import { VIEW_KEYS } from '../../src/tasks/viewRows'

const manifest = JSON.parse(
  readFileSync(path.join(path.resolve(__dirname, '../..'), 'package.json'), 'utf8'),
) as { readonly contributes: unknown }

const contributes = manifest.contributes as {
  readonly commands: readonly Record<string, unknown>[]
  readonly menus: Record<string, readonly Record<string, unknown>[] | undefined>
}

describe('view manifest', () => {
  VIEW_KEYS.forEach((key) =>
    VIEW_ACTIONS.forEach((item) => {
      it(`offers ${item.action} in the ${key} view`, () => {
        const command = commandOf(key, item.action)
        assert.deepEqual(
          contributes.commands.find((entry) => entry.command === command),
          { command, title: item.title, icon: item.icon },
        )
        assert.deepEqual(
          contributes.menus['view/title']?.find((entry) => entry.command === command),
          { command, when: menuWhen(key, item), group: item.group },
        )
        assert.deepEqual(
          contributes.menus.commandPalette?.find((entry) => entry.command === command),
          { command, when: 'false' },
        )
        if (item.context !== undefined) {
          assert.deepEqual(
            contributes.menus['view/item/context']?.find((entry) => entry.command === command),
            { command, when: rowWhen(key), group: item.context },
          )
        }
      })
    }),
  )
})
