import { readFileSync } from 'node:fs'
import { gunzipSync as inflate } from 'fflate'
import { describe, expect, it } from 'vitest'
import { analyzeDxf } from '../pipeline/analyze'
import { dwgBytesToDxf } from './dwg'

function unzip(path: string) {
  const bytes = readFileSync(path)
  return inflate(bytes)
}

describe('DWG reader', () => {
  it('rejects a file that is not a DWG', async () => {
    await expect(dwgBytesToDxf(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/nevypadá jako DWG/)
  })

  it('rejects an AutoCAD version the browser reader does not support', async () => {
    const bytes = new Uint8Array(64)
    bytes.set(new TextEncoder().encode('AC1009'))
    await expect(dwgBytesToDxf(bytes)).rejects.toThrow(/R12/)
    await expect(dwgBytesToDxf(bytes)).rejects.toThrow(/2000 až 2018/)
  })

  it('reads the Scania sample extract from DWG with the same detection as the DXF', async () => {
    const dxf = new TextDecoder('windows-1252').decode(unzip('fixtures/scania-extract.dxf.gz'))
    const dwg = unzip('fixtures/scania-extract.dwg.gz')
    const fromDxf = analyzeDxf(dxf)
    const fromDwg = analyzeDxf(await dwgBytesToDxf(dwg))
    expect(fromDxf.profileId).toBe('scania-icd')
    expect(fromDwg.axles.map((axle) => axle.x)).toEqual(fromDxf.axles.map((axle) => axle.x))
    expect(fromDwg.frame && Math.round(fromDwg.frame.topZ - fromDwg.frame.bottomZ)).toBe(
      fromDxf.frame ? Math.round(fromDxf.frame.topZ - fromDxf.frame.bottomZ) : 0,
    )
    const kinds = (model: typeof fromDxf) =>
      model.components
        .map((part) => `${part.partNumber}:${part.kind}`)
        .sort()
    expect(kinds(fromDwg)).toEqual(kinds(fromDxf))
  })
})
