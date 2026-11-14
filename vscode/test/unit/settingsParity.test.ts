import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as {
  contributes: {
    configuration: { properties: Record<string, { scope?: string; markdownDescription?: string }> }
    commands: { command: string }[]
  }
}
const { properties } = manifest.contributes.configuration

// Each field of ReviewSettings.State and each control of ReviewConfigurable, with its VS Code key or its gap.
const ROWS: readonly { intellij: string; vscode?: string; gap?: string }[] = [
  { intellij: 'sharing', vscode: 'yreview.newComments' },
  { intellij: 'remote', vscode: 'yreview.remote' },
  { intellij: 'writeRefspec', vscode: 'yreview.writeRefspec' },
  { intellij: 'editorMarks', vscode: 'yreview.editorMarks' },
  { intellij: 'channel', vscode: 'yreview.channel' },
  { intellij: 'sessionWindow', vscode: 'yreview.sessionLocation' },
  { intellij: 'agent', vscode: 'yreview.agent' },
  { intellij: 'agentCommands', vscode: 'yreview.agentCommands' },
  { intellij: 'autoStartSession', vscode: 'yreview.autoStartSession' },
  {
    intellij: 'claudeCommand',
    gap: 'An older field of the plugin. yreview.agentCommands holds the command of each agent.',
  },
  {
    intellij: 'mcpAdded',
    gap: 'State, not a setting. The extension keeps no such state and asks before each Add.',
  },
  {
    intellij: 'projectTab, currentFileTab, scopeTab, changeListTab',
    gap: 'View state. Each view keeps it in workspaceState (row 50).',
  },
  {
    intellij: 'showResolved, kindFilter, todoFilterName, showPreview, autoScrollToSource, scopeId',
    gap: 'View state. Each view keeps it in workspaceState (row 50).',
  },
  {
    intellij: 'Tab Scope Based (IDE scopes)',
    gap: 'Not possible (row 23). The Filter quick pick of the task views holds a glob scope.',
  },
  {
    intellij: 'Maximize switch (registry key)',
    gap: 'Not possible (row 46). VS Code has Maximize Panel Size of its own.',
  },
  {
    intellij: 'Colors page',
    gap: 'The color yreview.commentRangeBackground in contributes.colors. A theme changes it.',
  },
]
// The TODO patterns and the TODO filters of IntelliJ are IDE settings, not plugin settings.
const VSCODE_ONLY: readonly string[] = [
  'yreview.intellijKey',
  'yreview.todoPatterns',
  'yreview.todoFilters',
]

describe('settings parity with the IntelliJ settings page', () => {
  ROWS.filter((row) => row.vscode !== undefined).forEach((row) =>
    it(`${row.intellij} has the setting ${row.vscode}`, () =>
      assert.ok(properties[row.vscode ?? ''], `${row.vscode} is missing`)),
  )

  it('every row names a setting or a gap', () =>
    ROWS.forEach((row) =>
      assert.ok((row.vscode === undefined) !== (row.gap === undefined), row.intellij),
    ))

  it('every contributed setting maps to a row or is a setting of VS Code only', () =>
    Object.keys(properties).forEach((key) =>
      assert.ok(
        ROWS.some((row) => row.vscode === key) || VSCODE_ONLY.includes(key),
        `${key} has no row`,
      ),
    ))

  it('a repository cannot choose the program that runs (invariant S8)', () =>
    ['yreview.agent', 'yreview.agentCommands'].forEach((key) =>
      assert.equal(properties[key]?.scope, 'machine', key),
    ))

  it('the agent setting links to the agent pick', () =>
    assert.match(
      properties['yreview.agent']?.markdownDescription ?? '',
      /command:yreview\.chooseAgent/,
    ))

  it('contributes the settings commands once each', () =>
    ['yreview.openSettings', 'yreview.chooseAgent'].forEach((command) =>
      assert.equal(
        manifest.contributes.commands.filter((entry) => entry.command === command).length,
        1,
        command,
      ),
    ))
})
