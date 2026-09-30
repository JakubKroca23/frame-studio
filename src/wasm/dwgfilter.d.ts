export interface DwgFilterModule {
  FS: {
    writeFile: (name: string, data: Uint8Array) => void
    unlink: (name: string) => void
  }
  _dwg_filtered_dxf: (path: number, minLine: number) => number
  _free: (ptr: number) => void
  UTF8ToString: (ptr: number) => string
  stringToNewUTF8: (text: string) => number
}

export default function createDwgFilter(options?: {
  locateFile?: (file: string) => string
}): Promise<DwgFilterModule>
