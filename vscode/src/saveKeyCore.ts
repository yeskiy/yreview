import {
  applyEdits,
  type Edit,
  type FormattingOptions,
  modify,
  parse,
  type ParseError,
} from 'jsonc-parser'

export const SAVE_COMMAND = 'editor.action.submitComment'
export const SAVE_WHEN = 'commentEditorFocused && commentController == yreview'

export const OWN_ID = 'yeskiy.yreview'
const FOCUS_KEYS = new Set([
  'editorTextFocus',
  'editorFocus',
  'textInputFocus',
  'inputFocus',
  'commentEditorFocused',
  'true',
])
const KEY_ALIASES: Record<string, string> = { meta: 'cmd', win: 'cmd', ctl: 'ctrl' }

/** An installed extension with its raw `contributes.keybindings` value. */
export interface Installed {
  readonly id: string
  readonly name: string
  readonly bindings: unknown
}

export interface Conflict {
  readonly id: string
  readonly extension: string
  readonly command: string
}

type Binding = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Binding =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const saveKey = (platform: string): string => (platform === 'darwin' ? 'cmd+enter' : 'ctrl+enter')

const normalKey = (key: string): string =>
  key
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .map((part) => KEY_ALIASES[part] ?? part)
    .sort()
    .join('+')

const platformKey = (binding: Binding, platform: string): string | undefined =>
  text(
    { darwin: binding.mac, win32: binding.win, linux: binding.linux }[platform] ?? binding.key,
  ) ?? text(binding.key)

const isSaveKey = (key: string | undefined, platform: string): boolean =>
  key !== undefined && normalKey(key) === normalKey(saveKey(platform))

/** True when a term can hold while a Yreview comment box has focus. */
const termHolds = (term: string): boolean => {
  const flag = /^(!?)\s*([\w.:-]+)$/u.exec(term)
  if (flag !== null) return (flag[1] === '!') !== FOCUS_KEYS.has(flag[2] ?? '')
  const compare = /^([\w.:-]+)\s*(==|!=)\s*'?([^']*?)'?$/u.exec(term)
  if (compare === null) return false
  if (compare[1] !== 'commentController') return compare[2] === '!='
  return (compare[2] === '==') === (compare[3] === 'yreview')
}

/** True when the `when` clause can hold in a comment box. Unknown terms count as false. */
export const whenCanHold = (when: string | undefined): boolean =>
  when === undefined || when.trim() === ''
    ? true
    : !when.includes('(') &&
      when.split('||').some((part) => part.split('&&').every((term) => termHolds(term.trim())))

/** The bindings of other extensions that take the save key in a comment box. */
// VS Code ranks an extension entry by its list index, so an entry below `ownIndex` loses.
export const findSaveKeyConflicts = (
  installed: readonly Installed[],
  platform: string,
  ownIndex = -1,
): readonly Conflict[] =>
  installed
    .filter((extension) => extension.id.toLowerCase() !== OWN_ID)
    .flatMap((extension) =>
      (Array.isArray(extension.bindings) ? (extension.bindings as unknown[]) : [extension.bindings])
        .map((binding, index) => ({ binding, index }))
        .filter(({ index }) => index >= ownIndex)
        .map(({ binding }) => binding)
        .filter(isRecord)
        .filter((binding) => {
          const command = text(binding.command)
          return (
            command !== undefined &&
            !command.startsWith('-') &&
            command !== SAVE_COMMAND &&
            isSaveKey(platformKey(binding, platform), platform) &&
            whenCanHold(text(binding.when))
          )
        })
        .map((binding) => ({
          id: extension.id,
          extension: extension.name,
          command: String(binding.command),
        })),
    )

/** The index of the own scoped save entry in the own `contributes.keybindings`, or -1. */
export const ownSaveIndex = (bindings: unknown, platform: string): number =>
  Array.isArray(bindings)
    ? bindings.findLastIndex(
        (binding) =>
          isRecord(binding) &&
          binding.command === SAVE_COMMAND &&
          binding.when === SAVE_WHEN &&
          isSaveKey(platformKey(binding, platform), platform),
      )
    : -1

const saveEntry = (platform: string) => ({
  key: saveKey(platform),
  command: SAVE_COMMAND,
  when: SAVE_WHEN,
})

/** The entry as one JSON line, for a person who adds it by hand. */
export const saveKeyLine = (platform: string): string =>
  `{ ${Object.entries(saveEntry(platform))
    .map(([name, value]) => `${JSON.stringify(name)}: ${JSON.stringify(value)}`)
    .join(', ')} }`

const hasEntry = (entries: unknown[], platform: string): boolean =>
  entries
    .filter(isRecord)
    .some((entry) => isSaveKey(text(entry.key), platform) && entry.command === SAVE_COMMAND)

/** True when the text of keybindings.json has a user entry that saves comments. */
export const hasUserEntry = (source: string, platform: string): boolean => {
  const entries: unknown = parse(source, [], { allowTrailingComma: true })
  return Array.isArray(entries) && hasEntry(entries, platform)
}

/** The edits that append the entry to keybindings.json. No edits when the entry is present. */
export const saveKeyEdits = (
  source: string,
  platform: string,
  format: FormattingOptions,
): Edit[] => {
  const base = source.trim() === '' ? '[]' : source
  const errors: ParseError[] = []
  const entries: unknown = parse(base, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !Array.isArray(entries))
    throw new Error('The keybindings file is not a JSON array.')
  if (hasEntry(entries, platform)) return []
  const edits = modify(base, [entries.length], saveEntry(platform), {
    formattingOptions: format,
    isArrayInsertion: true,
  })
  return base === source
    ? edits
    : [{ offset: 0, length: source.length, content: applyEdits(base, edits) }]
}

const keyName = (platform: string): string => (platform === 'darwin' ? 'Cmd+Enter' : 'Ctrl+Enter')

export const saveKeyText = (extension: string, platform: string): string =>
  `The extension ${extension} binds ${keyName(platform)} in each text editor. For this reason, ${keyName(platform)} does not save a review comment. Add a user key binding so that ${keyName(platform)} saves comments?`

/** The placeholder of an empty comment box. It names the fix while a conflict exists. */
export const placeholderText = (conflict: Conflict | undefined, platform: string): string =>
  conflict === undefined
    ? 'Write a review comment. Markdown works.'
    : `Write a review comment. Markdown works. ${keyName(platform)} is taken by ${conflict.extension}: run Yreview: Use Ctrl+Enter to Save Comments.`

export interface SaveKeyHost {
  readonly platform: string
  answer(): string | undefined
  saveAnswer(value: 'added' | 'never'): Promise<void>
  conflicts(): readonly Conflict[]
  ask(message: string, ...items: string[]): Promise<string | undefined>
  addEntry(): Promise<boolean>
  showManual(line: string, failure: unknown): Promise<void>
  note(message: string): void
}

/** Asks while a conflict exists. Not now and a closed message keep no answer. */
// A stored answer stops the offer, but `forced` (the command) asks again.
export const runSaveKeyOffer = async (host: SaveKeyHost, forced = false): Promise<void> => {
  const conflict = host.conflicts()[0]
  host.note(
    conflict === undefined
      ? 'Save key: no extension takes the save key in the comment box.'
      : `Save key: the extension ${conflict.id} takes the save key with ${conflict.command}.`,
  )
  const answer = host.answer()
  host.note(`Save key: the stored answer is ${answer ?? 'none'}.`)
  if (conflict === undefined || (answer !== undefined && !forced)) return
  host.note('Save key: the offer message is shown.')
  const choice = await host.ask(
    saveKeyText(conflict.extension, host.platform),
    'Add',
    'Not now',
    'Never',
  )
  host.note(`Save key: the choice is ${choice ?? 'none, the message closed'}.`)
  if (choice === 'Never') await host.saveAnswer('never')
  if (choice !== 'Add') return
  const written = await host.addEntry().then(
    (changed) => {
      host.note(
        changed
          ? 'Save key: the entry is added to keybindings.json.'
          : 'Save key: keybindings.json has the entry already.',
      )
      return true
    },
    (failure: unknown) => {
      host.note('Save key: the entry could not be added.')
      return host.showManual(saveKeyLine(host.platform), failure).then(() => false)
    },
  )
  if (written) await host.saveAnswer('added')
}
