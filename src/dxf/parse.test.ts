import { describe, expect, it } from 'vitest'
import { flatten } from './flatten'
import { parseDxf } from './parse'
import { tessellateBulge } from './tessellate'
import { pairDimensions } from '../pipeline/dimensions'
import { scaniaIcdProfile } from '../profile/scania-icd'

function dxf(entities: string, blocks = ''): string {
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
}

describe('tessellateBulge', () => {
  it('builds a quarter circle through the expected midpoint', () => {
    const bulge = Math.tan(Math.PI / 8)
    const pts = tessellateBulge(1, 0, 0, 1, bulge, 0.02)
    const offChord = pts.some((p) => p.x > 0.65 && p.y > 0.65)
    expect(offChord).toBe(true)
    const radii = pts.map((p) => Math.hypot(p.x, p.y))
    expect(Math.max(...radii)).toBeGreaterThan(0.95)
    expect(Math.min(...radii)).toBeGreaterThan(0.9)
    expect(pts[0]).toEqual({ x: 1, y: 0 })
    expect(pts[pts.length - 1].x).toBeCloseTo(0, 5)
    expect(pts[pts.length - 1].y).toBeCloseTo(1, 5)
  })
})

describe('parse and flatten', () => {
  it('translates block contents and keeps the semantic layer', () => {
    const blocks = [
      '0',
      'BLOCK',
      '8',
      '0',
      '2',
      '1792580',
      '70',
      '0',
      '10',
      '0',
      '20',
      '0',
      '0',
      'LINE',
      '8',
      '205_Chassis_top_view',
      '10',
      '0',
      '20',
      '0',
      '11',
      '100',
      '21',
      '0',
      '0',
      'ENDBLK',
      '',
    ].join('\n')
    const entities = ['0', 'INSERT', '8', '0', '2', '1792580', '10', '0', '20', '3900', ''].join('\n')
    const flat = flatten(parseDxf(dxf(entities, blocks)))
    expect(flat.segments).toHaveLength(1)
    expect(flat.segments[0].layer).toBe('205_Chassis_top_view')
    expect(flat.segments[0].y1).toBeCloseTo(3900)
    expect(flat.segments[0].x2).toBeCloseTo(100)
    expect(flat.segments[0].block).toBe('1792580')
  })

  it('lets a layer-0 entity inherit the insert layer', () => {
    const blocks = [
      '0',
      'BLOCK',
      '2',
      'B',
      '70',
      '0',
      '10',
      '0',
      '20',
      '0',
      '0',
      'LINE',
      '8',
      '0',
      '10',
      '0',
      '20',
      '0',
      '11',
      '10',
      '21',
      '0',
      '0',
      'ENDBLK',
      '',
    ].join('\n')
    const entities = ['0', 'INSERT', '8', '203_Chassis_left_side_view', '2', 'B', '10', '5', '20', '6', ''].join('\n')
    const flat = flatten(parseDxf(dxf(entities, blocks)))
    expect(flat.segments[0].layer).toBe('203_Chassis_left_side_view')
    expect(flat.segments[0].x1).toBeCloseTo(5)
    expect(flat.segments[0].y1).toBeCloseTo(6)
  })

  it('drops the PREL watermark block', () => {
    const blocks = [
      '0',
      'BLOCK',
      '2',
      'PREL',
      '70',
      '0',
      '10',
      '0',
      '20',
      '0',
      '0',
      'LINE',
      '8',
      '0',
      '10',
      '0',
      '20',
      '0',
      '11',
      '1000',
      '21',
      '1000',
      '0',
      'ENDBLK',
      '',
    ].join('\n')
    const entities = ['0', 'INSERT', '8', '0', '2', 'PREL', '10', '0', '20', '0', ''].join('\n')
    const flat = flatten(parseDxf(dxf(entities, blocks)))
    expect(flat.segments).toHaveLength(0)
  })

  it('expands a bulged polyline', () => {
    const bulge = Math.tan(Math.PI / 8).toFixed(6)
    const entities = [
      '0',
      'POLYLINE',
      '8',
      '0',
      '70',
      '0',
      '0',
      'VERTEX',
      '8',
      '0',
      '10',
      '1',
      '20',
      '0',
      '42',
      bulge,
      '0',
      'VERTEX',
      '8',
      '0',
      '10',
      '0',
      '20',
      '1',
      '0',
      'SEQEND',
      '',
    ].join('\n')
    const flat = flatten(parseDxf(dxf(entities)))
    expect(flat.segments.length).toBeGreaterThanOrEqual(2)
    const bowed = flat.segments.some((s) => s.x1 > 0.6 && s.y1 > 0.6) || flat.segments.some((s) => s.x2 > 0.6 && s.y2 > 0.6)
    expect(bowed).toBe(true)
  })
})

describe('dimension pairing', () => {
  it('pairs a horizontal label with the number on its right and keeps inline values', () => {
    const dims = pairDimensions(
      [
        { layer: '201_Dimensions', x: 4253, y: -10, text: 'L011=', rotation: 0, block: 'B' },
        { layer: '201_Dimensions', x: 4377, y: -10, text: '4950', rotation: 0, block: 'B' },
        { layer: '201_Dimensions', x: 1585, y: 410, text: '(H035=994)   H036=', rotation: 90, block: 'B' },
        { layer: '201_Dimensions', x: 1585, y: 875, text: '973', rotation: 90, block: 'B' },
      ],
      scaniaIcdProfile,
      (layer) => layer.startsWith('201_'),
    )
    const l011 = dims.find((d) => d.label === 'L011')
    const h035 = dims.find((d) => d.label === 'H035')
    const h036 = dims.find((d) => d.label === 'H036')
    expect(l011?.value).toBe(4950)
    expect(h035?.value).toBe(994)
    expect(h035?.source).toBe('inline')
    expect(h036?.value).toBe(973)
  })
})
