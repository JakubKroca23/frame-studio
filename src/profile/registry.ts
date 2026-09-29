import type { DxfDb } from '../dxf/types'
import { scaniaIcdProfile } from './scania-icd'
import type { Profile, ProfileMatch } from './types'

export const builtinProfiles: Profile[] = [scaniaIcdProfile]

export function detectProfile(db: DxfDb, profiles: Profile[] = builtinProfiles): ProfileMatch | null {
  let best: ProfileMatch | null = null
  const layers = [...db.layers]
  const texts = db.textSamples
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
    if (score >= profile.detect.minScore && (!best || score > best.score)) {
      best = { profile, score }
    }
  }
  return best
}
