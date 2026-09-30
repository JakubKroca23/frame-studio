/**
 * LibreDWG 0.13.4 reader for DWG files the published 0.13.3 wasm rejects.
 * The module is produced by scripts/link-dwgfilter.sh. GPL-3.0, same as LibreDWG.
 */

interface DwgFilterModule {
  FS: {
    writeFile: (name: string, data: Uint8Array) => void
    unlink: (name: string) => void
  }
  _dwg_filtered_dxf: (path: number, minLine: number) => number
  _free: (ptr: number) => void
  UTF8ToString: (ptr: number) => string
  stringToNewUTF8: (text: string) => number
}

export async function filteredDwgToDxf(bytes: Uint8Array): Promise<string | null> {
  let createDwgFilter: (options: { locateFile: (file: string) => string }) => Promise<DwgFilterModule>
  try {
    const glue = (await import('../wasm/dwgfilter.js')) as {
      default: (options: { locateFile: (file: string) => string }) => Promise<DwgFilterModule>
    }
    createDwgFilter = glue.default
  } catch {
    return null
  }
  const wasmUrl = new URL('../wasm/dwgfilter.wasm', import.meta.url)
  let api: DwgFilterModule
  try {
    api = await createDwgFilter({
      locateFile: () => wasmUrl.href,
    })
  } catch {
    return null
  }
  const fileName = `in-${Date.now()}.dwg`
  api.FS.writeFile(fileName, bytes)
  const path = api.stringToNewUTF8(fileName)
  try {
    const ptr = api._dwg_filtered_dxf(path, 0.4)
    if (!ptr) return null
    try {
      return api.UTF8ToString(ptr)
    } finally {
      api._free(ptr)
    }
  } finally {
    api._free(path)
    try {
      api.FS.unlink(fileName)
    } catch {
      /* already removed */
    }
  }
}
