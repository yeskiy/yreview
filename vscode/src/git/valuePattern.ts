const SPECIAL = '\\^$.[]|()*+?{}'

/** The git value pattern that matches this value alone. */
export const exactly = (value: string): string =>
  `^${[...value].map((char) => (SPECIAL.includes(char) ? `\\${char}` : char)).join('')}$`
