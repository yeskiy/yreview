import { createHash } from 'node:crypto'

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

/** The UTF-8 bytes that Java writes, which hold `?` for a lone surrogate. */
export const javaUtf8 = (text: string): Buffer =>
  Buffer.from(text.replace(LONE_SURROGATE, '?'), 'utf8')

export const sha1Hex = (text: string): string =>
  createHash('sha1').update(javaUtf8(text)).digest('hex')

export const sha256Hex = (text: string): string =>
  createHash('sha256').update(javaUtf8(text)).digest('hex')
