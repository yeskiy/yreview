/** The extension of the built-in preview. Its styles load, its scripts do not. */
export const MARKDOWN_ID = 'vscode.markdown-language-features'

export interface ExtensionInfo<U> {
  readonly id: string
  readonly root: U
  readonly packageJSON: unknown
}

export interface Script<U> {
  readonly uri: U
  readonly module: boolean
}

export interface Contributions<U> {
  readonly styles: readonly U[]
  readonly scripts: readonly Script<U>[]
  readonly roots: readonly U[]
}

const listOf = (packageJSON: unknown, key: string): readonly unknown[] => {
  const value = (packageJSON as { contributes?: Record<string, unknown> } | undefined)
    ?.contributes?.[key]
  return Array.isArray(value) ? value : []
}

/** True for a relative path that stays inside its extension. */
const inside = (relative: string): boolean =>
  relative !== '' && !/^([a-zA-Z]:|[\\/])/.test(relative) && !relative.split(/[\\/]/).includes('..')

const scriptOf = (
  entry: unknown,
): { readonly path: string; readonly module: boolean } | undefined => {
  if (typeof entry === 'string') return { path: entry, module: false }
  const { path, type } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
    string,
    unknown
  >
  return typeof path === 'string' ? { path, module: type === 'module' } : undefined
}

/** The preview styles and scripts of all extensions, as the built-in preview collects them. */
export const contributionsOf = <U>(
  extensions: readonly ExtensionInfo<U>[],
  ownId: string,
  join: (root: U, relative: string) => U,
): Contributions<U> => {
  const each = extensions
    .filter((extension) => extension.id !== ownId)
    .map((extension) => ({
      extension,
      styles: listOf(extension.packageJSON, 'markdown.previewStyles')
        .filter((entry): entry is string => typeof entry === 'string' && inside(entry))
        .map((entry) => join(extension.root, entry)),
      scripts:
        extension.id === MARKDOWN_ID
          ? []
          : listOf(extension.packageJSON, 'markdown.previewScripts')
              .map(scriptOf)
              .filter(
                (script): script is { path: string; module: boolean } =>
                  script !== undefined && inside(script.path),
              )
              .map((script) => ({ uri: join(extension.root, script.path), module: script.module })),
    }))
    .sort((a, b) => Number(b.extension.id === MARKDOWN_ID) - Number(a.extension.id === MARKDOWN_ID))
  return {
    styles: each.flatMap((item) => item.styles),
    scripts: each.flatMap((item) => item.scripts),
    roots: each
      .filter((item) => item.styles.length + item.scripts.length > 0)
      .map((item) => item.extension.root),
  }
}
