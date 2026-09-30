import { analyzeDxf } from '../pipeline/analyze'

export interface WorkerOk {
  ok: true
  model: ReturnType<typeof analyzeDxf>
}
export interface WorkerErr {
  ok: false
  error: string
}

self.onmessage = (event: MessageEvent<{ text?: string; dwg?: ArrayBuffer }>) => {
  void (async () => {
    try {
      let text = event.data.text ?? ''
      if (event.data.dwg) {
        self.postMessage({ progress: 'Čtu DWG…' })
        const { dwgBytesToDxf } = await import('../io/dwg')
        text = await dwgBytesToDxf(new Uint8Array(event.data.dwg))
      }
      const model = analyzeDxf(text, (stage) => {
        self.postMessage({ progress: stage })
      })
      self.postMessage({ ok: true, model } satisfies WorkerOk)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ ok: false, error: message } satisfies WorkerErr)
    }
  })()
}
