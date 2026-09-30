import { describe, expect, it } from 'vitest'
import { analyzeDxf } from './analyze'
import { applyReview, buildReview } from './review'

/** Small stand-in for the Contsystem DAF sheet: two views, two axles, a column. */
function dafFixture(): string {
  const side = [
    line(0, 1000, 8000, 1000),
    line(0, 1300, 8000, 1300),
    line(200, 1500, 1800, 1500),
    line(200, 3200, 1800, 3200),
    line(200, 1500, 200, 3200),
    line(1800, 1500, 1800, 3200),
    line(2200, 1600, 2200, 4000),
    line(2550, 1600, 2550, 3900),
    line(2200, 3700, 4600, 3700),
    line(4000, 1100, 4002, 1100),
  ]
  const top = [
    line(0, 0, 8000, 0),
    line(0, 790, 8000, 790),
    line(500, 75, 6500, 75),
    line(500, 715, 6500, 715),
    line(3500, 40, 3500, 750),
    line(5200, 40, 5200, 750),
    line(400, -800, 900, -800),
    line(400, 1590, 900, 1590),
    line(2100, 50, 2700, 50),
    line(2100, 740, 2700, 740),
  ]
  const circles = [
    circle(1600, 700, 298),
    circle(6000, 700, 298),
    circle(1000, 1150, 6),
    circle(3000, 1150, 6),
    circle(5000, 1120, 5),
  ]
  const body = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1032',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'BLOCKS',
    block('daf_side', [...side, ...circles]),
    block('daf_top', top),
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    insert('daf_side', 0, 0),
    insert('daf_top', 0, -12000),
    text(100, 100, 'Contsystem s.r.o.'),
    text(100, 80, 'NÁSTAVBA:'),
    '0',
    'ENDSEC',
    '0',
    'EOF',
  ]
  return body.join('\n')
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return ['0', 'LINE', '8', 'OBRYS', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)].join('\n')
}

function circle(x: number, y: number, r: number) {
  return ['0', 'CIRCLE', '8', 'OBRYS', '10', String(x), '20', String(y), '40', String(r)].join('\n')
}

function text(x: number, y: number, value: string) {
  return ['0', 'TEXT', '8', 'OBRYS', '10', String(x), '20', String(y), '1', value].join('\n')
}

function insert(name: string, x: number, y: number) {
  return ['0', 'INSERT', '8', '0', '2', name, '10', String(x), '20', String(y), '41', '1', '42', '1', '50', '0'].join('\n')
}

function block(name: string, parts: string[]) {
  return ['0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name, parts.join('\n'), '0', 'ENDBLK'].join('\n')
}

describe('DAF Contsystem profile', () => {
  it('reads the frame, two axles, the cab and the loader crane from the two views', () => {
    const model = analyzeDxf(dafFixture())
    expect(model.profileId).toBe('daf-contsystem')
    expect(model.manufacturer).toBe('DAF')
    expect(model.header.chassisType).toBe('DAF')
    expect(model.frame).toBeTruthy()
    expect(Math.round(model.frame!.topZ - model.frame!.bottomZ)).toBe(300)
    expect(Math.round(model.frame!.outerWidthStraight)).toBeGreaterThan(760)
    expect(Math.round(model.frame!.outerWidthStraight)).toBeLessThan(820)
    expect(model.axles.map((axle) => axle.x)).toEqual([1600, 6000])
    expect(model.axles[0].tireDiameter).toBe(596)
    expect(model.axles[0].tireSource).toBe('measured')
    expect(model.axles[1].dual).toBe(true)
    expect(model.axles[0].dual).toBe(false)
    expect(model.holes.length).toBeGreaterThanOrEqual(4)
    expect(model.holes.filter((hole) => hole.side === 'left').length).toBe(model.holes.filter((hole) => hole.side === 'right').length)
    expect(model.crossmembers.length).toBeGreaterThanOrEqual(2)
    expect(model.cab).toBeTruthy()
    expect(model.cab!.side.x1).toBeLessThan(2100)
    expect(model.cab!.side.y1 - model.cab!.side.y0).toBeGreaterThan(1000)
    const crane = model.components.find((part) => part.kind === 'crane')
    expect(crane).toBeTruthy()
    expect(crane!.side && crane!.side.y1 - crane!.side.y0).toBeGreaterThan(1500)
    expect(crane!.side && crane!.side.x0).toBeGreaterThan(1900)
    expect(model.warnings.some((warning) => /pneumatik/i.test(warning))).toBe(true)
    const review = buildReview(model)
    const hand = review.find((item) => item.kind === 'crane')
    expect(hand?.title).toBe('Hydraulická ruka HIAB')
    expect(hand?.deleted).toBeFalsy()
    applyReview(model, review)
    expect(hand?.title).toBe('Hydraulická ruka HIAB')
  })
})
