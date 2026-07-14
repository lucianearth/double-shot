#!/usr/bin/env node
// showcase.mjs <wireframes-dir> [out.html]
//
// Assemble a wireframe set into ONE self-contained HTML page (kit CSS inlined,
// every frame + its sticky notes side by side, stories listed up top) — the file
// you show the human for the iteration loop, publishable anywhere (no external
// requests, so it survives a strict CSP).

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [dir, out] = process.argv.slice(2)
if (!dir || !existsSync(dir)) {
  console.error('usage: showcase.mjs <wireframes-dir> [out.html]')
  process.exit(1)
}

// kit CSS: prefer a copy living next to the frames; fall back to the bundled one
const localCss = join(dir, 'wireframe.css')
const bundledCss = join(dirname(fileURLToPath(import.meta.url)), 'wireframe.css')
const css = readFileSync(existsSync(localCss) ? localCss : bundledCss, 'utf8')

const storiesPath = join(dir, 'stories.md')
const stories = existsSync(storiesPath)
  ? [...readFileSync(storiesPath, 'utf8').matchAll(/^\s*[-*]\s+\*\*(S\d+)\*\*\s*[—–-]\s*(.+)$/gm)]
      .map(([, id, text]) => `<li><b>${id}</b> — ${text}</li>`).join('\n')
  : ''

const frameFiles = readdirSync(dir).filter((f) => f.endsWith('.html') && !/^(index|showcase)\.html$/.test(f)).sort()
const groups = frameFiles.map((f) => {
  const raw = readFileSync(join(dir, f), 'utf8')
  const frame = (raw.match(/<section[^>]*class="[^"]*\bframe\b[^"]*"[^>]*>[\s\S]*?<\/section>/) || [''])[0]
  const notes = (raw.match(/<aside[^>]*class="[^"]*\bnote\b[^"]*"[^>]*>[\s\S]*?<\/aside>/g) || []).join('\n')
  return `<div class="group">\n${frame}\n${notes}\n</div>`
}).join('\n\n')

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wireframes</title>
<style>
${css}
/* showcase-only chrome */
body { flex-direction: column; }
.stories { max-width: 720px; font-size: 13px; line-height: 1.6; }
.stories h1 { font-size: 18px; margin-bottom: 6px; }
.stories li { margin-left: 18px; }
.frames { display: flex; flex-wrap: wrap; gap: 44px; align-items: flex-start; }
.group { display: flex; gap: 16px; align-items: flex-start; padding-top: 26px; }
.group .frame { flex: none; }
.group .note { margin-top: 4px; }
</style></head><body>
<div class="stories"><h1>User stories</h1><ol style="list-style:none">
${stories}
</ol></div>
<div class="frames">
${groups}
</div>
</body></html>
`

const outPath = out || join(dir, 'showcase.html')
writeFileSync(outPath, html)
console.log(`wrote ${outPath} (${frameFiles.length} frames)`)
