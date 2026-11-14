import { strict as assert } from 'node:assert'

import * as vscode from 'vscode'

const answerOf = async (name: string, input: object): Promise<Record<string, unknown>> => {
  const answer = await vscode.lm.invokeTool(name, { input, toolInvocationToken: undefined })
  const part = answer.content[0]
  assert.ok(part instanceof vscode.LanguageModelTextPart)
  return JSON.parse(part.value) as Record<string, unknown>
}

describe('the review tools in VS Code chat', () => {
  before(async () => {
    await vscode.extensions.getExtension('yeskiy.yreview')?.activate()
  })

  it('lists the four tools', () => {
    const names = vscode.lm.tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('review_'))
      .sort()
    assert.deepEqual(names, [
      'review_add_comment',
      'review_list_comments',
      'review_open_comment',
      'review_resolve_comment',
    ])
  })

  it('answers review_list_comments with a comments array', async () => {
    assert.ok(Array.isArray((await answerOf('review_list_comments', {})).comments))
  })

  it('refuses an argument of the wrong type with an error field', async () => {
    assert.equal(typeof (await answerOf('review_resolve_comment', { id: 7 })).error, 'string')
  })
})
