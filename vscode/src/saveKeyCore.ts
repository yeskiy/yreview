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

const OWN_ID = 'yeskiy.yreview'
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
export const findSaveKeyConflicts = (
  installed: readonly Installed[],
  platform: string,
): readonly Conflict[] =>
  installed
    .filter((extension) => extension.id.toLowerCase() !== OWN_ID)
    .flatMap((extension) =>
      (Array.isArray(extension.bindings) ? (extension.bindings as unknown[]) : [extension.bindings])
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
        .map((binding) => ({ extension: extension.name, command: String(binding.command) })),
    )

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
  const present = entries
    .filter(isRecord)
    .some((entry) => isSaveKey(text(entry.key), platform) && entry.command === SAVE_COMMAND)
  if (present) return []
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

export interface SaveKeyHost {
  readonly platform: string
  answer(): string | undefined
  saveAnswer(value: 'added' | 'never'): Promise<void>
  conflicts(): readonly Conflict[]
  ask(message: string, ...items: string[]): Promise<string | undefined>
  addEntry(): Promise<void>
  showManual(line: string, failure: unknown): Promise<void>
}

/** Asks once while a conflict exists. Not now and a closed message keep no answer. */
export const runSaveKeyOffer = async (host: SaveKeyHost): Promise<void> => {
  if (host.answer() !== undefined) return
  const conflict = host.conflicts()[0]
  if (conflict === undefined) return
  const choice = await host.ask(
    saveKeyText(conflict.extension, host.platform),
    'Add',
    'Not now',
    'Never',
  )
  if (choice === 'Never') await host.saveAnswer('never')
  if (choice !== 'Add') return
  const added = await host.addEntry().then(
    () => true,
    (failure: unknown) => host.showManual(saveKeyLine(host.platform), failure).then(() => false),
  )
  if (added) await host.saveAnswer('added')
}
