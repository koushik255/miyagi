import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('scripts/dev-dual.mjs currently supports macOS Terminal only.')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || process.env.MIYAGI_DEV_DRY_RUN === '1'
const root = process.cwd()
const rootDir = shellQuote(root)
const backDir = shellQuote(resolve(root, 'back'))

const commands = [
  `cd ${backDir} && bun run dev`,
  `cd ${rootDir} && npm run dev`,
  `cd ${rootDir} && ./node_modules/.bin/wait-on http://127.0.0.1:5173 && VITE_DEV_SERVER_URL=http://127.0.0.1:5173 ./node_modules/.bin/electron .`,
]

if (dryRun) {
  for (const command of commands) console.log(command)
  process.exit(0)
}

const script = [
  'tell application "Terminal"',
  'activate',
  ...commands.flatMap((command) => [`do script "${appleQuote(command)}"`, 'delay 0.5']),
  'end tell',
].join('\n')

const result = spawnSync('osascript', ['-'], {
  input: script,
  stdio: ['pipe', 'pipe', 'inherit'],
  encoding: 'utf8',
})

if (result.status !== 0) process.exit(result.status ?? 1)
if (result.stdout.trim()) console.log(result.stdout.trim())

function shellQuote(value) {
  return `'${value.replaceAll(`'`, `'\\''`)}'`
}

function appleQuote(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
