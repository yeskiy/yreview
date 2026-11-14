import { sha1Hex } from './digest'
import { kotlinTrim } from './kotlinText'

export const TODO_PREFIX = 'todo-'
export const HANDLE_PREFIX = 'y'

const SAFE = /^[A-Za-z0-9_-]{1,200}$/
const COMMENT = /^[0-9a-f]{40}$/
const TODO = /^todo-[0-9a-f]{40}-[0-9]{1,7}$/
const HANDLE = /^y[a-z0-9]{2,32}$/
// Java \s without UNICODE_CHARACTER_CLASS.
const JAVA_SPACE_RUN = /[ \t\n\v\f\r]+/g

export const isSafe = (id: string): boolean => SAFE.test(id)
export const isLong = (id: string): boolean => COMMENT.test(id) || TODO.test(id)
export const isHandle = (id: string): boolean => HANDLE.test(id)
export const isKnown = (id: string): boolean => isLong(id) || isHandle(id)
export const isTodo = (id: string): boolean => id.startsWith(TODO_PREFIX)

export const normalTodoText = (text: string): string =>
  kotlinTrim(text).replace(JAVA_SPACE_RUN, ' ')

export const todoId = (repository: string, path: string, text: string, order: number): string =>
  `${TODO_PREFIX}${sha1Hex([repository, path, normalTodoText(text)].join('\n'))}-${order}`

export const legacyTodoId = (path: string, line: number): string =>
  `${TODO_PREFIX}${sha1Hex(path)}-${line}`

/** The repository part of a TODO identifier, the same on every machine for a root inside the project. */
export const repositoryOf = (basePath: string | undefined, rootPath: string): string => {
  if (!basePath) return rootPath
  if (rootPath === basePath) return ''
  return rootPath.startsWith(`${basePath}/`) ? rootPath.slice(basePath.length + 1) : rootPath
}

export interface TodoItem {
  readonly path: string
  readonly text: string
}

/** The items of one file, in source order, each with its identifier. */
export const assignTodoIds = <T extends TodoItem>(
  repository: string,
  items: readonly T[],
): readonly (T & { readonly id: string })[] => {
  const texts = items.map((item) => normalTodoText(item.text))
  return items.map((item, index) => ({
    ...item,
    id: todoId(
      repository,
      item.path,
      item.text,
      texts.slice(0, index).filter((text) => text === texts[index]).length,
    ),
  }))
}
