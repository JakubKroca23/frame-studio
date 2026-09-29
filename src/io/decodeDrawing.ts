import { gunzipSync, unzipSync } from 'fflate'

/** Turn an uploaded DXF, gzip, tar.gz/tgz or zip into DXF text. */
export function decodeDrawing(name: string, bytes: Uint8Array): string {
  const lower = name.toLowerCase()
  let dxf = bytes
  if (lower.endsWith('.zip')) {
    const entries = unzipSync(bytes)
    const hit = Object.keys(entries).find((entry) => entry.toLowerCase().endsWith('.dxf'))
    if (!hit) throw new Error('V ZIPu není žádný soubor DXF.')
    dxf = entries[hit]
  } else if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
    dxf = dxfInTar(isGzip(bytes) ? gunzipSync(bytes) : bytes)
  } else if (lower.endsWith('.gz')) {
    // A static .gz served with Content-Encoding: gzip is already inflated by fetch.
    dxf = isGzip(bytes) ? gunzipSync(bytes) : bytes
  } else if (!lower.endsWith('.dxf')) {
    throw new Error('Podporované soubory jsou DXF, DXF.GZ, TGZ a ZIP.')
  }
  return new TextDecoder('windows-1252').decode(dxf)
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

function dxfInTar(tar: Uint8Array): Uint8Array {
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = text(header.subarray(0, 100))
    const size = Number.parseInt(text(header.subarray(124, 136)).trim(), 8) || 0
    offset += 512
    const data = tar.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512
    if (name.toLowerCase().endsWith('.dxf')) return data
  }
  throw new Error('V archivu TAR není žádný soubor DXF.')
}

function text(bytes: Uint8Array): string {
  let end = bytes.indexOf(0)
  if (end < 0) end = bytes.length
  return new TextDecoder().decode(bytes.subarray(0, end))
}
