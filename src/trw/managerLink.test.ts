import { describe, expect, it } from 'vitest'
import { MANAGER_MAX_BYTES, MANAGER_ORIGIN, managerMessageFile, parseLinkParams } from './links'

const msg = (data: unknown, name = 'zakazka-123.trw') => ({ type: 'cs-studio/open-trw', name, data })

describe('Contsystem Manager link (?from=manager)', () => {
  it('parses ?from=manager', () => {
    expect(parseLinkParams('?from=manager')).toEqual({ kind: 'manager' })
  })
  it('ignores other origins (exact match only)', () => {
    const bytes = new Uint8Array([84, 82, 87, 49]).buffer
    for (const origin of ['https://evil.example', 'http://zakazky.contsystem.cz', 'https://zakazky.contsystem.cz.evil.com', 'https://x.zakazky.contsystem.cz', 'https://zakazky.contsystem.cz:8443', 'null'])
      expect(managerMessageFile({ origin, data: msg(bytes) })).toBeNull()
  })
  it('ignores other message types', () => {
    expect(managerMessageFile({ origin: MANAGER_ORIGIN, data: { type: 'ready' } })).toBeNull()
    expect(managerMessageFile({ origin: MANAGER_ORIGIN, data: 'hello' })).toBeNull()
  })
  it('accepts a .trw ArrayBuffer and keeps the name', async () => {
    const bytes = new TextEncoder().encode('TRW1\nDT 04-23-2026\n').buffer
    const f = managerMessageFile({ origin: MANAGER_ORIGIN, data: msg(bytes, 'C:\\zakazky\\volvo.trw') })
    expect(f).toBeInstanceOf(File)
    expect((f as File).name).toBe('volvo.trw')
    expect(await (f as File).text()).toMatch(/^TRW1/)
  })
  it('accepts a trw JSON export object as .json', async () => {
    const f = managerMessageFile({ origin: MANAGER_ORIGIN, data: msg({ schema: 'trw/config@1' }, 'export') }) as File
    expect(f.name).toBe('export.json')
    expect(JSON.parse(await f.text()).schema).toBe('trw/config@1')
  })
  it('rejects empty, missing and oversized payloads', () => {
    expect(managerMessageFile({ origin: MANAGER_ORIGIN, data: msg(new ArrayBuffer(0)) })).toEqual({ error: expect.stringMatching(/prázdný/) })
    expect(managerMessageFile({ origin: MANAGER_ORIGIN, data: msg(undefined) })).toEqual({ error: expect.stringMatching(/neobsahuje/) })
    expect(managerMessageFile({ origin: MANAGER_ORIGIN, data: msg(new ArrayBuffer(MANAGER_MAX_BYTES + 1)) })).toEqual({ error: expect.stringMatching(/příliš velký/) })
  })
})
