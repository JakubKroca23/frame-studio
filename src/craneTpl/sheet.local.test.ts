import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { it, expect } from 'vitest'
import { readCraneSheet } from './sheet'
import { adaptFromSheet } from './template'
const F = ['/workspace/crane/dr/iX. 142 HiPro GD-E-ES-1-3 464-0807.dxf', '/workspace/crane/dr/iX. 142 HiPro GD-E-ES-4-5 464-0808.dxf']
for (const f of F) it(f, () => {
  if (!existsSync(f)) return
  const s = readCraneSheet(new TextDecoder('windows-1252').decode(readFileSync(f)))
  expect(s.isCrane).toBe(true)
  const a = adaptFromSheet(s)
  writeFileSync(`/tmp/tpl-${f.match(/464-\d+/)![0]}.json`, JSON.stringify({ title: s.title, model: s.model, scale: s.scale.label, note: s.scaleNote, variants: s.variants, labelled: s.labelled.map((d) => `${d.label} ${d.paper.toFixed(2)} → ${d.mm}${d.override ? ` (${d.override})` : ''}`), dims: s.dims, adapt: a.report, scales: a.scales }, null, 1))
}, 120000)
