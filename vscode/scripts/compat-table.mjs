// Merges the result files of the compat workflow into one Markdown table.
// Usage: node scripts/compat-table.mjs <folder of result files> <table file>
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { CHECKS, SKIPPED } from './compat-checks.mjs'

const [folder = 'compat-results', out = 'compat-table.md'] = process.argv.slice(2)

const COLUMNS = [
  ['Local Windows', ['local-windows']],
  ['Remote-SSH', ['remote-ssh']],
  ['WSL', ['wsl']],
  ['Dev Containers', ['devcontainers']],
  ['Codespaces', []],
  ['Cursor', ['cursor-linux', 'cursor-windows']],
  ['Windsurf', ['windsurf-linux', 'windsurf-windows']],
  ['VSCodium', ['vscodium-linux', 'vscodium-windows']],
]
const OS = { linux: 'Linux', win32: 'Windows' }

const outcomes = new Map(
  readdirSync(folder, { recursive: true })
    .filter((file) => String(file).endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(folder, String(file)), 'utf8')))
    .map((outcome) => [outcome.setup, outcome]),
)

const clean = (text) =>
  String(text ?? '')
    .replace(/\s+/gu, ' ')
    .replaceAll('|', '/')
    .trim()
    .slice(0, 160)
const editorOf = (outcome) => `${outcome.editor.name} ${outcome.editor.version}`

const cellOf = (outcome, result) => {
  if (result === undefined) return 'not checked yet'
  if (result.status === 'passed')
    return `passed (CI, ${outcome.date}, ${editorOf(outcome)}${result.reason ? `, ${clean(result.reason)}` : ''})`
  if (result.status === 'not checked yet') return 'not checked yet'
  return `${result.status}: ${clean(result.reason)}`
}

/** One cell for a column. A column of two systems names each system, unless both cells agree. */
const columnCell = (setups, pick) => {
  const found = setups.filter((setup) => outcomes.has(setup)).map((setup) => outcomes.get(setup))
  const missing = setups.filter((setup) => !outcomes.has(setup))
  const cells = found.map((outcome) => [
    OS[outcome.os] ?? outcome.os,
    cellOf(outcome, pick(outcome)),
  ])
  if (setups.length === 0) return 'not checked yet'
  if (cells.length === 1 && missing.length === 0) return cells[0][1]
  if (cells.length > 1 && new Set(cells.map(([, cell]) => cell)).size === 1)
    return cells[0][1].replace(/\)$/u, `, ${cells.map(([os]) => os).join(' and ')})`)
  return [
    ...cells.map(([os, cell]) => `${os}: ${cell}`),
    ...missing.map((setup) => `${setup}: failed: the job wrote no result`),
  ].join('<br>')
}

const row = (cells) => `| ${cells.join(' | ')} |`
const lines = [
  row(['Check', ...COLUMNS.map(([name]) => name)]),
  row(['---', ...COLUMNS.map(() => '---')]),
  ...CHECKS.map(([check, name]) =>
    row([
      `${check}. ${name}`,
      ...COLUMNS.map(([, setups]) =>
        SKIPPED.has(check)
          ? 'not checked yet'
          : columnCell(setups, (outcome) => outcome.checks.find((one) => one.check === check)),
      ),
    ]),
  ),
  row([
    'The CLI installs the VSIX and it activates',
    ...COLUMNS.map(([, setups]) =>
      columnCell(
        setups,
        (outcome) =>
          outcome.install ?? {
            status: 'not automated',
            reason: 'a remote window loads the extension from its folder',
          },
      ),
    ),
  ]),
]
const versions = [...outcomes.values()].map(
  (outcome) =>
    `- ${outcome.setup}: ${editorOf(outcome)}, VS Code ${outcome.editor.vscodeVersion}, host ${outcome.host ?? 'none'}`,
)
const text = `${lines.join('\n')}\n\nEditors:\n\n${versions.join('\n')}\n`
writeFileSync(out, text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
console.log(text)
