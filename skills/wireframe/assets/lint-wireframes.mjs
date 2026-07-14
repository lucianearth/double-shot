#!/usr/bin/env node
// lint-wireframes.mjs <wireframes-dir> [--budget N]
//
// The machine-checkable taste gate for a wireframe set:
//   1. TEXT BUDGET   — max N visible words per frame (default 60). Real words are for
//                      labels, headings, and actions; body copy must be .line skeletons.
//   2. FOCUS         — max 2 `.btn.primary` per frame. A screen with three primary
//                      actions has no primary action.
//   3. TRACEABILITY  — every story in stories.md is served by >=1 frame (a story with
//                      no frame is a MISSING PIECE of the experience: fail), and every
//                      frame serves >=1 story (unmotivated UI: warn).
//   4. HYGIENE       — exactly one .frame per file, with data-title + data-stories.
//
// Zero dependencies. Exit 1 on any error.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
const budgetFlag = args.indexOf('--budget')
const DEFAULT_BUDGET = budgetFlag !== -1 ? Number(args[budgetFlag + 1]) : 60

if (!dir || !existsSync(dir)) {
  console.error('usage: lint-wireframes.mjs <wireframes-dir> [--budget N]')
  process.exit(1)
}

const errors = []
const warnings = []

// --- stories.md ---
const storiesPath = join(dir, 'stories.md')
const storyIds = new Map() // id -> text
if (!existsSync(storiesPath)) {
  errors.push('stories.md is missing — stories come FIRST; frames exist to serve them.')
} else {
  for (const line of readFileSync(storiesPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*[-*]\s+\*\*(S\d+)\*\*\s*[—–-]\s*(.+)$/)
    if (m) storyIds.set(m[1], m[2].trim())
  }
  if (storyIds.size === 0) errors.push('stories.md has no stories (expected lines like: - **S1** — As a …, I want …, so that …)')
}

// --- frames ---
const frameFiles = readdirSync(dir).filter((f) => f.endsWith('.html') && !/^(index|showcase)\.html$/.test(f)).sort()
if (frameFiles.length === 0) errors.push(`no frame .html files found in ${dir}`)

const served = new Set() // story ids covered by some frame

for (const file of frameFiles) {
  const raw = readFileSync(join(dir, file), 'utf8')

  const frames = raw.match(/<section[^>]*class="[^"]*\bframe\b[^"]*"[^>]*>/g) || []
  if (frames.length !== 1) {
    errors.push(`${file}: expected exactly one <section class="frame">, found ${frames.length}`)
    continue
  }
  const tag = frames[0]
  const title = (tag.match(/data-title="([^"]*)"/) || [])[1]
  const stories = (tag.match(/data-stories="([^"]*)"/) || [])[1]
  const budget = Number((tag.match(/data-budget="([^"]*)"/) || [])[1]) || DEFAULT_BUDGET

  if (!title) errors.push(`${file}: frame is missing data-title`)
  if (!stories) {
    warnings.push(`${file}: frame lists no data-stories — what user story motivates this screen?`)
  } else {
    for (const id of stories.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (storyIds.size && !storyIds.has(id)) errors.push(`${file}: references unknown story ${id}`)
      served.add(id)
    }
  }

  // visible word count: strip annotations, style/script, then all tags
  const visible = raw
    .replace(/<aside[^>]*class="[^"]*\bnote\b[^"]*"[^>]*>[\s\S]*?<\/aside>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
  const words = visible.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t))
  if (words.length > budget) {
    errors.push(`${file}: ${words.length} visible words > budget ${budget}. Cut copy or turn body text into .line skeletons — a wireframe argues with structure, not prose.`)
  }

  const primaries = (raw.match(/\bbtn\b[^"]*\bprimary\b/g) || []).length
  if (primaries > 2) {
    errors.push(`${file}: ${primaries} primary buttons — a screen with ${primaries} primary actions has none. Max 2; ideally 1.`)
  }

  console.log(`  ${file}: "${title || '?'}" — ${words.length}/${budget} words, ${primaries} primary, stories [${stories || 'NONE'}]`)
}

// --- traceability ---
for (const [id, text] of storyIds) {
  if (!served.has(id)) {
    errors.push(`story ${id} has NO frame serving it — the experience is missing a piece: "${text}"`)
  }
}

console.log('')
for (const w of warnings) console.log(`WARN  ${w}`)
for (const e of errors) console.log(`ERROR ${e}`)
console.log(errors.length ? `\n${errors.length} error(s).` : `OK — ${frameFiles.length} frames, ${storyIds.size} stories, all traceable.`)
process.exit(errors.length ? 1 : 0)
