import assert from 'node:assert/strict'

import { OPEN_GIT_SETTING, gitMissingNotice } from '../../src/git/gitMissing'

describe('the git start notice', () => {
  it('shows the problem with the button', async () => {
    const shown: string[][] = []
    await gitMissingNotice(
      'Yreview needs git 2.24 or later.',
      async (message, button) => {
        shown.push([message, button])
        return undefined
      },
      async () => assert.fail('opened without a press'),
    )
    assert.deepEqual(shown, [['Yreview needs git 2.24 or later.', OPEN_GIT_SETTING]])
  })

  it('opens the setting only after a press of the button', async () => {
    const opened: boolean[] = []
    await gitMissingNotice(
      'x',
      async () => OPEN_GIT_SETTING,
      async () => opened.push(true),
    )
    assert.deepEqual(opened, [true])
  })
})
