import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vehicleFromFile } from './vehicleFromFile'

describe('vehicleFromFile', () => {
  it('builds the drive-out vehicle from a trw/config@1 export (chassis + crane markers)', async () => {
    const text = readFileSync(new URL('../trw/sample-crane-408-3d.json', import.meta.url), 'utf8')
    const file = new File([text], 'sample.json', { type: 'application/json' })
    const v = await vehicleFromFile('trw', file, async () => {})
    expect(v?.model.axles.length).toBeGreaterThanOrEqual(2)
    expect(v?.trw?.markers.crane).toBeTruthy()
  })
  it('returns null for a JSON that is not a trw export', async () => {
    expect(await vehicleFromFile('trw', new File(['{"a":1}'], 'x.json'), async () => {})).toBeNull()
  })
})
