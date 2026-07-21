#!/usr/bin/env node
// showcase.mjs <wireframes-dir> [out.html]
//
// Assemble a wireframe set into ONE self-contained HTML page (kit CSS inlined,
// every frame + its sticky notes side by side, stories listed up top) — the file
// you show the human for the iteration loop, publishable anywhere (no external
// requests, so it survives a strict CSP).
//
// Sections: put data-section="Donor journey — the first give" on the FIRST frame
// of each group and the showcase renders a section header there. Every frame's
// data-title is rendered as a visible caption above the phone (the kit's tiny
// corner tab is hidden here — captions read better at review altitude).
// Filename order = presentation order, as always.

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

const sections = []
let current = null
for (const f of frameFiles) {
  const raw = readFileSync(join(dir, f), 'utf8')
  const frame = (raw.match(/<section[^>]*class="[^"]*\bframe\b[^"]*"[^>]*>[\s\S]*?<\/section>/) || [''])[0]
  const notes = (raw.match(/<aside[^>]*class="[^"]*\bnote\b[^"]*"[^>]*>[\s\S]*?<\/aside>/g) || []).join('\n')
  const sectionTitle = (frame.match(/data-section="([^"]*)"/) || [])[1]
  if (sectionTitle !== undefined || !current) {
    current = { title: sectionTitle || '', screens: [] }
    sections.push(current)
  }
  const title = (frame.match(/data-title="([^"]*)"/) || [])[1] || f
  current.screens.push(
    `<div class="screen"><h3 class="screen-title">${title}</h3>\n<div class="group">\n${frame}\n${notes}\n</div></div>`
  )
}

const framesHtml = sections
  .map((s) => `${s.title ? `<h2 class="section-title">${s.title}</h2>` : ''}\n<div class="frames">\n${s.screens.join('\n\n')}\n</div>`)
  .join('\n\n')

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
.section-title { font-size: 26px; font-weight: 800; margin-top: 28px; padding-top: 24px; border-top: 3px solid #444; }
.frames { display: flex; flex-wrap: wrap; gap: 44px; align-items: flex-start; }
.screen { display: flex; flex-direction: column; }
.screen-title { font-size: 16px; font-weight: 700; margin: 0 0 8px 2px; }
.frame::before { display: none; } /* visible caption replaces the tiny corner tab here */
.group { display: flex; gap: 16px; align-items: flex-start; padding-top: 26px; }
.group .frame { flex: none; }
.group .note { margin-top: 4px; }
</style></head><body>
<div class="stories"><h1>User stories</h1><ol style="list-style:none">
${stories}
</ol></div>
${framesHtml}
</body></html>
`

const outPath = out || join(dir, 'showcase.html')
writeFileSync(outPath, html)
console.log(`wrote ${outPath} (${frameFiles.length} frames, ${sections.length} section${sections.length === 1 ? '' : 's'})`)
