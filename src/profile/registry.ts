import type { DxfDb } from '../dxf/types'
import { scaniaIcdProfile } from './scania-icd'
import { volvoBepProfile } from './volvo-bep'
import type { Profile, ProfileMatch } from './types'

export const builtinProfiles: Profile[] = [scaniaIcdProfile, volvoBepProfile]

export function detectProfile(db: DxfDb, profiles: Profile[] = builtinProfiles): ProfileMatch | null {
  let best: ProfileMatch | null = null
  const layers = [...db.layers]
  const texts = db.textSamples
  const blocks = [...db.blocks.keys()]
  for (const profile of profiles) {
    let score = 0
    for (const rule of profile.detect.texts) {
      const re = new RegExp(rule.regex, 'i')
      if (texts.some((t) => re.test(t))) score += rule.weight
    }
    for (const rule of profile.detect.layers) {
      const re = new RegExp(rule.regex)
      const matches = layers.filter((l) => re.test(l)).length
      if (matches >= rule.minMatches) score += rule.weight
    }
    for (const rule of profile.detect.blocks ?? []) {
      const re = new RegExp(rule.regex)
      const matches = blocks.filter((name) => re.test(name)).length
      if (matches >= (rule.minMatches ?? 1)) score += rule.weight
    }
    if (score >= profile.detect.minScore && (!best || score > best.score)) {
      best = { profile, score }
    }
  }
  return best
}
