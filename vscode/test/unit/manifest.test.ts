import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { reviewTools } from '../../src/channel/reviewTools'

const root = path.resolve(__dirname, '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>

interface Contributed {
  readonly command?: string
  readonly id?: string
  readonly key?: string
  readonly when?: string
  readonly group?: string
  readonly defaults?: Record<string, string | null>
}

const contributes = manifest.contributes as {
  readonly keybindings: readonly Contributed[]
  readonly colors: readonly Contributed[]
  readonly menus: Record<string, readonly Contributed[]>
}

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

  it('keeps the Comments panel closed when a comment thread opens', () => {
    const defaults = (manifest.contributes as Record<string, unknown>).configurationDefaults
    assert.deepEqual(defaults, { 'comments.openView': 'never' })
  })

  it('contributes no telemetry setting', () => {
    assert.doesNotMatch(JSON.stringify(manifest.contributes), /telemetry/i)
  })

  it('carries the license of the repository', () => {
    assert.equal(
      readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
      readFileSync(path.join(root, '..', 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
    )
  })

  it('binds Escape in our comment box to the command that closes it', () => {
    const escape = contributes.keybindings.find((binding) => binding.key === 'escape')
    assert.equal(escape?.command, 'yreview.closeBox')
    const when = escape?.when ?? ''
    ;['commentEditorFocused', 'commentController == yreview'].forEach((part) =>
      assert.ok(when.includes(part), part),
    )
    ;['!suggestWidgetVisible', '!inlineSuggestionVisible', '!parameterHintsVisible'].forEach(
      (part) => assert.ok(when.includes(part), part),
    )
  })

  it('shows Discard only in an empty box of our controller', () => {
    const discard = contributes.menus['comments/commentThread/context']?.find(
      (item) => item.command === 'yreview.discard',
    )
    assert.equal(discard?.when, 'commentController == yreview && commentThreadIsEmpty')
    assert.equal(
      contributes.menus.commandPalette?.find((item) => item.command === 'yreview.discard')?.when,
      'false',
    )
  })

  it('offers only Save Local in an empty box of a local only thread', () => {
    const empty = 'commentController == yreview && commentThreadIsEmpty'
    assert.deepEqual(
      contributes.menus['comments/commentThread/context']
        ?.filter((item) => item.command !== 'yreview.discard')
        .map(({ command, group, when }) => ({ command, group, when })),
      [
        {
          command: 'yreview.saveLocal',
          group: 'inline@1',
          when: `${empty} && (commentThread == localOnly || config.yreview.newComments != shared)`,
        },
        {
          command: 'yreview.saveShared',
          group: 'inline@2',
          when: `${empty} && commentThread != localOnly && config.yreview.newComments != shared`,
        },
        {
          command: 'yreview.saveShared',
          group: 'inline@1',
          when: `${empty} && commentThread != localOnly && config.yreview.newComments == shared`,
        },
        {
          command: 'yreview.saveLocal',
          group: 'inline@2',
          when: `${empty} && commentThread != localOnly && config.yreview.newComments == shared`,
        },
      ],
    )
  })

  it('hides Save Shared of a draft whose source has a folder store', () => {
    const shared = 'resourceScheme == yreview-draft && resource not in yreview.localDrafts'
    ;['editor/title', 'commandPalette'].forEach((place) =>
      assert.equal(
        contributes.menus[place]?.find((item) => item.command === 'yreview.draft.saveShared')?.when,
        shared,
        place,
      ),
    )
  })

  it('colors an overlap with one color that differs from the range color', () => {
    const ids = contributes.colors.map((color) => color.id)
    assert.deepEqual(ids, [
      'yreview.commentRangeBackground',
      'yreview.commentOverlapBackground',
      'yreview.commentOverlapBorder',
      'yreview.commentOutdatedBackground',
    ])
    const overlap = contributes.colors[1]?.defaults ?? {}
    assert.match(overlap.dark ?? '', /^#[0-9a-f]{8}$/)
    assert.match(overlap.light ?? '', /^#[0-9a-f]{8}$/)
    assert.equal(contributes.colors[2]?.defaults?.highContrast, 'contrastActiveBorder')
    const outdated = contributes.colors[3]?.defaults ?? {}
    assert.match(outdated.dark ?? '', /^#[0-9a-f]{8}$/)
    assert.match(outdated.light ?? '', /^#[0-9a-f]{8}$/)
  })

  it('puts the task views in an activity bar container', () => {
    const all = manifest.contributes as Record<string, unknown>
    const containers = (all.viewsContainers as Record<string, readonly Record<string, unknown>[]>)
      .activitybar
    assert.deepEqual(
      containers?.map((container) => container.id),
      ['yreview'],
    )
    assert.ok(existsSync(path.join(root, String(containers?.[0]?.icon))))
    assert.deepEqual(
      (all.views as Record<string, readonly Record<string, unknown>[]>).yreview?.map(
        (view) => view.id,
      ),
      ['yreview.project', 'yreview.currentFile', 'yreview.changes'],
    )
    assert.match(
      readFileSync(path.join(root, '.vscodeignore'), 'utf8'),
      /^!images\/activity\.svg$/m,
    )
  })

  it('gives the TODO settings application scope, so a workspace cannot set them', () => {
    const { properties } = (manifest.contributes as Record<string, unknown>).configuration as {
      readonly properties?: Record<string, Record<string, unknown>>
    }
    assert.equal(properties?.['yreview.todoPatterns']?.scope, 'application')
    assert.equal(properties?.['yreview.todoFilters']?.scope, 'application')
  })

  it('contributes the four review tools of the channel server to VS Code chat', () => {
    const all = manifest.contributes as Record<string, unknown>
    const tools = all.languageModelTools as readonly Record<string, unknown>[]
    const definitions = reviewTools({ request: () => Promise.reject(new Error('no bridge')) }).map(
      (tool) => tool.definition,
    )
    assert.deepEqual(
      tools.map((tool) => tool.name),
      definitions.map((definition) => definition.name),
    )
    definitions.forEach((definition, index) => {
      const tool = tools[index] ?? {}
      assert.equal(tool.modelDescription, definition.description)
      assert.equal(tool.userDescription, definition.description?.split('\n')[0])
      assert.deepEqual(tool.inputSchema, definition.inputSchema)
      assert.equal(tool.canBeReferencedInPrompt, true)
    })
    assert.equal(all.mcpServerDefinitionProviders, undefined)
  })
})

describe('diagnostic commands', () => {
  const declared = manifest.contributes as {
    readonly commands: readonly { command: string; title: string; category?: string }[]
  }

  it('contributes Copy Diagnostic Report under the product name', () =>
    assert.deepEqual(
      declared.commands.find((entry) => entry.command === 'yreview.copyDiagnosticReport'),
      {
        command: 'yreview.copyDiagnosticReport',
        title: 'Copy Diagnostic Report',
        category: 'Yreview',
      },
    ))

  it('hides the failure report from the palette, because it needs a failure', () =>
    assert.equal(
      contributes.menus.commandPalette?.find((item) => item.command === 'yreview.reportFailure')
        ?.when,
      'false',
    ))
})

describe('the Markdown preview', () => {
  const markdown = manifest.contributes as Record<string, unknown>

  const views =
    "activeWebviewPanelId == 'markdown.preview' || activeCustomEditorId == 'vscode.markdown.preview.editor' || activeCustomEditorId == 'vscode.markdown.editor'"
  const fromPreview = (place: string): readonly Contributed[] =>
    (place === 'keybindings' ? contributes.keybindings : (contributes.menus[place] ?? [])).filter(
      (entry) => entry.command === 'yreview.addCommentFromPreview',
    )
  const ignored = readFileSync(path.join(root, '.vscodeignore'), 'utf8')

  it('gives a markdown-it plugin, a style sheet and a script that the package carries', () => {
    assert.equal(markdown['markdown.markdownItPlugins'], true)
    assert.deepEqual(markdown['markdown.previewStyles'], ['./media/preview.css'])
    assert.deepEqual(markdown['markdown.previewScripts'], ['./dist/previewSelection.js'])
    assert.match(ignored, /^!media\/preview\.css$/m)
    assert.match(ignored, /^!dist\/previewSelection\.js$/m)
  })

  it('shows the add button on the preview and the Markdown editor only', () => {
    assert.deepEqual(
      fromPreview('editor/title').map((entry) => entry.when),
      [views],
    )
    assert.deepEqual(
      fromPreview('commandPalette').map((entry) => entry.when),
      [views],
    )
  })

  it('adds the command to the context menu of the preview, which sends the lines', () =>
    assert.deepEqual(
      fromPreview('webview/context').map((entry) => entry.when),
      ["webviewId == 'markdown.preview' || webviewId == 'vscode.markdown.preview.editor'"],
    ))

  it('binds the keys of Add Review Comment while the preview has the focus', () =>
    assert.deepEqual(
      fromPreview('keybindings').map((entry) => [entry.key, entry.when]),
      [
        [
          'ctrl+alt+g',
          `!editorTextFocus && !inputFocus && !terminalFocus && !sideBarFocus && !panelFocus && !auxiliaryBarFocus && (${views})`,
        ],
        [
          'ctrl+shift+g',
          `config.yreview.intellijKey && !editorTextFocus && !inputFocus && !terminalFocus && !sideBarFocus && !panelFocus && !auxiliaryBarFocus && (${views})`,
        ],
      ],
    ))

  it('has no comment links, no URI handler and no style of a link', () => {
    assert.ok(
      !(manifest.activationEvents as readonly string[]).some((event) => event.startsWith('onUri')),
    )
    assert.doesNotMatch(
      readFileSync(path.join(root, 'media', 'preview.css'), 'utf8'),
      /yreview-add/,
    )
    readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) =>
        assert.doesNotMatch(
          readFileSync(path.join(entry.parentPath, entry.name), 'utf8'),
          /registerUriHandler|yeskiy\.yreview\/comment|handleUri/,
          entry.name,
        ),
      )
  })
})

describe('the review preview', () => {
  const declared = manifest.contributes as {
    readonly commands: readonly { command: string; title: string; category?: string }[]
  }
  const focus =
    "!editorTextFocus && !inputFocus && !terminalFocus && !sideBarFocus && !panelFocus && !auxiliaryBarFocus && activeWebviewPanelId == 'yreview.preview'"
  const inPreview = "activeWebviewPanelId == 'yreview.preview'"
  const source = 'resourceLangId == markdown && resourceScheme == file'
  const ids = [
    'yreview.openReviewPreview',
    'yreview.addCommentFromReviewPreview',
    'yreview.showReviewPreviewSource',
  ]
  const of = (place: string, command: string): readonly Contributed[] =>
    (place === 'keybindings' ? contributes.keybindings : (contributes.menus[place] ?? [])).filter(
      (entry) => entry.command === command,
    )

  it('contributes the three commands with their titles', () =>
    assert.deepEqual(
      declared.commands
        .filter((entry) => ids.includes(entry.command))
        .map((entry) => [entry.command, entry.title, entry.category]),
      [
        ['yreview.openReviewPreview', 'Open Review Preview to the Side', 'Yreview'],
        ['yreview.addCommentFromReviewPreview', 'Add Review Comment', 'Yreview'],
        ['yreview.showReviewPreviewSource', 'Show Source', 'Yreview'],
      ],
    ))

  it('activates on a restore of the panel', () =>
    assert.ok(
      (manifest.activationEvents as readonly string[]).includes('onWebviewPanel:yreview.preview'),
    ))

  it('shows the commands in the palette only where they work', () =>
    assert.deepEqual(
      ids.flatMap((command) => of('commandPalette', command).map((entry) => entry.when)),
      [source, inPreview, inPreview],
    ))

  it('puts the buttons on the title of the source and of the preview', () =>
    assert.deepEqual(
      ids.flatMap((command) =>
        of('editor/title', command).map((entry) => [entry.when, entry.group]),
      ),
      [
        [`${source} && activeWebviewPanelId != 'yreview.preview'`, 'navigation@8'],
        [inPreview, 'navigation@9'],
        [inPreview, 'navigation@10'],
      ],
    ))

  it('adds the command to the context menu of the review preview', () =>
    assert.deepEqual(
      of('webview/context', 'yreview.addCommentFromReviewPreview').map((entry) => [
        entry.when,
        entry.group,
      ]),
      [["webviewId == 'yreview.preview'", 'z_yreview@1']],
    ))

  it('binds the keys of Add Review Comment while the review preview has the focus', () => {
    const keys = of('keybindings', 'yreview.addCommentFromReviewPreview')
    assert.deepEqual(
      keys.map((entry) => [entry.key, entry.when]),
      [
        ['ctrl+alt+g', focus],
        ['ctrl+shift+g', `config.yreview.intellijKey && ${focus}`],
      ],
    )
    keys.forEach((entry) => assert.doesNotMatch(entry.when ?? '', /markdown\.preview/))
  })

  it('carries the page script and the page style in the package', () => {
    const ignored = readFileSync(path.join(root, '.vscodeignore'), 'utf8')
    assert.match(ignored, /^!dist\/reviewPreview\.js$/m)
    assert.match(ignored, /^!media\/reviewPreview\.css$/m)
  })
})
