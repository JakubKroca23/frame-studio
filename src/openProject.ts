/** "Otevřít" from the top bar / start page: drawings go to #vykres, trw projects / JSON to the configurator. */
let pending: File | null = null
export const OPEN_ACCEPT = '.trw,.json,.pdf,application/pdf,.dxf,.dwg,.gz,.tgz,.zip,application/json,application/dxf,application/acad,application/gzip,application/zip,application/octet-stream'
export const isProjectFile = (name: string) => /\.(trw|json|pdf)$/i.test(name)
/** Configurator picks the file up on mount (or right away when it is already open, via the event). */
export function queueProjectFile(file: File) {
  pending = file
  window.dispatchEvent(new CustomEvent('fs-open-project'))
}
export function takePendingProject(): File | null {
  const f = pending
  pending = null
  return f
}
