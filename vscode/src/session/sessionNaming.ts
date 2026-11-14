import { kotlinTrim } from '../core/kotlinText'

export const TITLE = 'Rename Review Session'
export const PROMPT = 'Name of this session:'
export const HINT =
  'Give this session a name of your own. An empty name brings the built name back.'

/** The longest name that the extension keeps. */
export const MAX_NAME = 60

// Java \s without UNICODE_CHARACTER_CLASS.
const JAVA_SPACE_RUN = /[ \t\n\v\f\r]+/g

/** The name a session keeps. Undefined drops the name of the user. */
export const cleanName = (raw: string | undefined): string | undefined => {
  const name = kotlinTrim((raw ?? '').replace(JAVA_SPACE_RUN, ' ')).slice(0, MAX_NAME)
  return name === '' ? undefined : name
}
