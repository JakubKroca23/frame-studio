import { analyzeDxf } from '../pipeline/analyze'

export interface WorkerOk {
  ok: true
  model: ReturnType<typeof analyzeDxf>
}
export interface WorkerErr {
  ok: false
  error: string
}

self.onmessage = (event: MessageEvent<{ text: string }>) => {
  try {
    const model = analyzeDxf(event.data.text, (stage) => {
      self.postMessage({ progress: stage })
    })
    self.postMessage({ ok: true, model } satisfies WorkerOk)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    self.postMessage({ ok: false, error: message } satisfies WorkerErr)
  }
}
