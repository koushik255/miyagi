import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  html: 'html', css: 'css', json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', sql: 'sql',
}

const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/github-light-default.mjs')],
      langs: [],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    })
  }
  return highlighterPromise
}

export function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase()
  const ext = lower.split('.').pop() ?? ''
  const lang = LANG_BY_EXT[ext]
  return lang && LANG_LOADERS[lang] ? lang : 'plaintext'
}

export async function highlight(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter()
  if (lang !== 'plaintext' && !loadedLangs.has(lang) && LANG_LOADERS[lang]) {
    const language = await LANG_LOADERS[lang]()
    await hl.loadLanguage(language as Parameters<HighlighterCore['loadLanguage']>[0])
    loadedLangs.add(lang)
  }
  return hl.codeToHtml(code, {
    lang: loadedLangs.has(lang) ? lang : 'text',
    theme: 'github-light-default',
  })
}
