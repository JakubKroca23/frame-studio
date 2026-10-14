import { expect, it } from 'vitest'
import { unlabelledOutreach } from './sheet'
it('LESSONS L4/L7: iQ JIB sheet — main boom vs jib reach', () => {
  const r = unlabelledOutreach(['GEN. DIM. E8+JIB 155Q', 'Min. 4710 / Max. 19710', 'Min. 5024 / Max. 20024', 'Min. 7914 / Max. 32414 (v6)\\PMin. 7914 / Max. 34214 (v6+1m)', 'Min. 2890 / Max. 12390 (v6)\\PMin. 2890 / Max. 14190 (v6+1m)', 'Min. 7914 / Max. 32414 (v6)'])
  expect(r.variants).toMatchObject([{ id: 'E-8', extensions: 8, minOutreachMm: 5024, hydMaxMm: 20024 }])
  expect(r.jib).toEqual({ minMm: 7914, maxMm: 32414, manMm: 34214 })
  const x = unlabelledOutreach(['GEN.DIM H638E-6', 'Min.4638 / Max.11638', 'Min.4809 / Max.15859', 'Manual extension  Min.5234 / Max.17000'])
  expect(x.variants).toMatchObject([{ id: 'E-6', minOutreachMm: 4809, hydMaxMm: 15859, manMaxMm: 17000 }])
})
