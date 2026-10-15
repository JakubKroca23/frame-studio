/** PDF → plain text lines in the browser (pdf.js). Columns are kept apart by runs of spaces. */
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

type PdfJs = typeof import('pdfjs-dist')

let lib: Promise<PdfJs> | null = null
async function loadPdfJs(): Promise<PdfJs> {
  lib ??= (async () => {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })()
  return lib
}

interface Item { x: number; y: number; w: number; s: string; h: number }

/** Groups positioned text runs into lines (top → bottom) with gap-dependent spacing. */
export function itemsToText(items: Item[]): string {
  const rows: { y: number; items: Item[] }[] = []
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.35))
    if (row) row.items.push(it)
    else rows.push({ y: it.y, items: [it] })
  }
  return rows
    .map((r) => {
      let out = ''
      let end = -Infinity
      for (const it of r.items.sort((a, b) => a.x - b.x)) {
        const gap = it.x - end
        if (out) out += gap > Math.max(it.h, 4) * 1.2 ? '     ' : gap > it.h * 0.15 ? ' ' : ''
        out += it.s
        end = it.x + it.w
      }
      return out
    })
    .join('\n')
}

export async function pdfToText(data: ArrayBuffer | Uint8Array, pdfjs?: PdfJs): Promise<string> {
  const lib = pdfjs ?? (await loadPdfJs())
  const doc = await lib.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data), isEvalSupported: false }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items: Item[] = []
    for (const raw of content.items) {
      const it = raw as TextItem
      if (!('str' in it) || !it.str.trim()) continue
      items.push({ x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 8, s: it.str })
    }
    pages.push(itemsToText(items))
  }
  await doc.destroy()
  return pages.join('\n\n')
}
