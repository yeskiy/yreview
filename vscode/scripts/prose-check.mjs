import { existsSync, globSync, readFileSync } from 'node:fs'

const BANNED = /[\u2013\u2014\u2018\u2019\u201C\u201D]/u
const hits = [...globSync('src/**/*.ts'), 'package.json', 'README.md', 'CHANGELOG.md']
  .filter((file) => existsSync(file))
  .flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ file, line, number: index + 1 }))
      .filter((hit) => BANNED.test(hit.line)),
  )
hits.forEach((hit) => console.error(`${hit.file}:${hit.number}: ${hit.line.trim()}`))
process.exitCode = hits.length === 0 ? 0 : 1
