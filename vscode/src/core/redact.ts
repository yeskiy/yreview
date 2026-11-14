export const HOME_MARK = '~'
export const PROJECT_MARK = '<project>'
export const REPOSITORY_MARK = '<repository>'
export const REMOTE_MARK = '<remote>'
export const EMAIL_MARK = '<email>'
export const SECRET_MARK = '<secret>'

const LOOPBACK = new Set(['localhost', '::1', '[::1]'])
// Java \s is ASCII white space, so the patterns name those six characters.
const SCP_REMOTE = /[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^ \t\n\v\f\r"']+/g
const URL_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^ \t\n\v\f\r"'<>]+/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const HEX_RUN = /(?<![0-9A-Za-z])[0-9a-fA-F]{16,}(?![0-9A-Za-z])/g
const TOKEN_VALUE = /(token["' \t\n\v\f\r:=]{1,4})([A-Za-z0-9._+/-]{8,})/gi
const WSL_PATH = /^\/mnt\/([a-zA-Z])(\/.*)?$/

export const windowsPath = (raw: string): string => {
  const slashes = raw.replaceAll('\\', '/')
  const match = WSL_PATH.exec(slashes)
  const windows = match ? `${(match[1] ?? '').toUpperCase()}:${match[2] || '/'}` : slashes
  return windows.length > 3 && windows.endsWith('/') ? windows.slice(0, -1) : windows
}

const spellings = (folder: string): readonly string[] => [
  ...new Set([folder.replaceAll('\\', '/'), windowsPath(folder)]),
]

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every occurrence, whatever the case, as Kotlin indexOf with ignoreCase does. */
const replaceAll = (value: string, needle: string, mark: string): string =>
  needle === '' ? value : value.replace(new RegExp(escape(needle), 'gi'), () => mark)

/** Each folder with its mark, the longest first. One folder keeps its first mark. */
const needles = (
  homes: readonly string[],
  projects: readonly string[],
  repositories: readonly string[],
): readonly (readonly [string, string])[] => {
  const all = [
    ...projects.flatMap(spellings).map((needle) => [needle, PROJECT_MARK] as const),
    ...repositories.flatMap(spellings).map((needle) => [needle, REPOSITORY_MARK] as const),
    ...homes.map((home) => [home.replaceAll('\\', '/'), HOME_MARK] as const),
  ]
    .map(([needle, mark]) => [needle.replace(/\/+$/, ''), mark] as const)
    .filter(([needle]) => needle !== '')
  return all
    .filter(
      ([needle], index) =>
        all.findIndex(([other]) => other.toLowerCase() === needle.toLowerCase()) === index,
    )
    .sort((a, b) => b[0].length - a[0].length)
}

/** The host of one address, without the user information and without the port. */
const loopback = (url: string): boolean => {
  const hostPort = (url.slice(url.indexOf('://') + 3).split('/')[0] ?? '').split('?')[0] ?? ''
  const afterUser = hostPort.slice(hostPort.lastIndexOf('@') + 1)
  const host = (
    afterUser.includes(':') ? afterUser.slice(0, afterUser.lastIndexOf(':')) : afterUser
  ).toLowerCase()
  return LOOPBACK.has(host) || host.startsWith('127.')
}

const addresses = (value: string): string =>
  value
    .replace(SCP_REMOTE, REMOTE_MARK)
    .replace(URL_PATTERN, (url) => (loopback(url) ? url : REMOTE_MARK))
    .replace(EMAIL, EMAIL_MARK)

const secrets = (value: string): string =>
  value
    .replace(TOKEN_VALUE, (_match, prefix: string) => `${prefix}${SECRET_MARK}`)
    .replace(HEX_RUN, SECRET_MARK)

/** The text without the folders of the user, remotes, mail addresses and secrets. */
export const redactText = (
  value: string,
  homes: readonly string[],
  projects: readonly string[],
  repositories: readonly string[],
): string =>
  secrets(
    addresses(
      needles(homes, projects, repositories).reduce(
        (text, [needle, mark]) => replaceAll(text, needle, mark),
        value.replaceAll('\\', '/'),
      ),
    ),
  )
