import type { BlockViewName, BlockViewRules } from './types'

interface Compiled {
  special: { re: RegExp; view: BlockViewName }[]
  cab?: { re: RegExp; map: Record<string, BlockViewName> }
  part?: BlockViewRules['part'] & { re: RegExp }
}

const cache = new WeakMap<BlockViewRules, Compiled>()

function compiled(rules: BlockViewRules): Compiled {
  let hit = cache.get(rules)
  if (hit) return hit
  hit = {
    special: rules.special.map((rule) => ({ re: new RegExp(rule.regex), view: rule.view })),
    cab: rules.cab ? { re: new RegExp(rules.cab.regex), map: rules.cab.map } : undefined,
    part: rules.part ? { ...rules.part, re: new RegExp(rules.part.regex) } : undefined,
  }
  cache.set(rules, hit)
  return hit
}

/** View encoded in a block name. Null when this profile does not use block suffixes. */
export function classifyBlock(name: string, rules: BlockViewRules | undefined): BlockViewName | null {
  if (!name || !rules) return null
  const ruleset = compiled(rules)
  for (const rule of ruleset.special) {
    if (rule.re.test(name)) return rule.view
  }
  if (ruleset.cab) {
    const match = name.match(ruleset.cab.re)
    if (match) return ruleset.cab.map[match[1] ?? ''] ?? null
  }
  if (ruleset.part) {
    const match = name.match(ruleset.part.re)
    if (match) {
      const suffix = match[ruleset.part.viewGroup] ?? ''
      if (!suffix) return ruleset.part.defaultView
      return ruleset.part.map[suffix] ?? ruleset.part.defaultView
    }
  }
  return null
}
