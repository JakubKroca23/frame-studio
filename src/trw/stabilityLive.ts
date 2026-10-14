/**
 * Client for the trw live stability API `trw/stability-live@2` (trw repo docs/live-stability-api.md,
 * summary in docs/trw-config-v2.md). Needs the trw document (or a saved `document_id`): without one it
 * never touches the network. Tries a WebSocket once, then a POST; if neither answers it stays silent and
 * callers keep the local `stability.angles[]` data. Requests are coalesced to one per animation frame.
 */
export interface LiveRequest { slew_deg: number; outreach_mm: number | null; hook_height_mm?: number | null; load_kg: number | null; crane_variant?: string | null }
/** `document` (CalcRequest as sent to trw on import) or `document_id` (saved_calculations id). */
export interface LiveDoc { document?: unknown; document_id?: number | string }
export type LiveLevel = 'ok' | 'warn' | 'fail'
export interface LiveReaction { id: string; kind?: string; side?: 'left' | 'right'; x_mm?: number; y_mm?: number; kN: number }
export interface LiveResponse {
  schema?: string
  /** null = no tipping line has a positive arm at this angle (cannot tip) → safe */
  factor: number | null
  pass: boolean | null
  status?: 'green' | 'orange' | 'red'
  /** use for colouring */
  level?: LiveLevel
  required_n?: number
  min_factor?: number
  active_line?: string
  stability_max_load_kg?: number | null
  /** předpoklad: static laden axle loads */
  axle_loads?: { axle: number; kg: number; x_mm?: number; limit_kg?: number }[]
  reactions?: LiveReaction[]
  cog?: { x: number; y: number | null; z: number | null; mass_kg?: number }
  tipping_lines?: { code?: string; name?: string; from: { x_mm: number; y_mm: number }; to: { x_mm: number; y_mm: number }; n?: number | null; qmax_kg?: number | null; active?: boolean }[]
  /** a sector wrapping through 0° has to_deg < from_deg */
  sectors?: { from_deg: number; to_deg: number; factor: number | null; status: 'green' | 'orange' | 'red'; level?: LiveLevel }[]
  /** null for now (no CraneWIN load charts) → keep the HiSelect table */
  max_load_kg?: number | null
  /** echo of the request slew, lets the client drop stale answers */
  slew_deg?: number
}
export type LiveMode = 'idle' | 'connecting' | 'ws' | 'http' | 'unavailable'

export const LIVE_WS_URL = 'wss://trw.propoj.app/api/stability/live'
export const LIVE_HTTP_URL = 'https://trw.propoj.app/api/stability/live'

interface Deps {
  WebSocket?: typeof WebSocket | undefined
  fetch?: typeof fetch | undefined
  raf?: (cb: () => void) => unknown
  wsUrl?: string
  httpUrl?: string
  /** ms to wait for the socket to open before falling back */
  timeoutMs?: number
}

export class StabilityLive {
  mode: LiveMode = 'idle'
  last: LiveResponse | null = null
  private ws: WebSocket | null = null
  private pending: LiveRequest | null = null
  private scheduled = false
  private inflight = false
  private listeners = new Set<(r: LiveResponse) => void>()
  private d: Required<Omit<Deps, 'WebSocket' | 'fetch'>> & Pick<Deps, 'WebSocket' | 'fetch'>

  constructor(deps: Deps = {}) {
    this.d = {
      WebSocket: 'WebSocket' in deps ? deps.WebSocket : typeof WebSocket !== 'undefined' ? WebSocket : undefined,
      fetch: 'fetch' in deps ? deps.fetch : typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
      raf: deps.raf ?? ((cb) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : setTimeout(cb, 16))),
      wsUrl: deps.wsUrl ?? LIVE_WS_URL,
      httpUrl: deps.httpUrl ?? LIVE_HTTP_URL,
      timeoutMs: deps.timeoutMs ?? 3000,
    }
  }

  get available() { return this.mode === 'ws' || this.mode === 'http' }
  onResult(cb: (r: LiveResponse) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb) }

  private doc: LiveDoc | null = null
  private docSent = false

  /** Feature-detect with the document; never throws. Without a document → 'unavailable', no network. */
  async connect(doc: LiveDoc | null | undefined, probe?: LiveRequest): Promise<LiveMode> {
    if (this.mode !== 'idle') return this.mode
    if (!doc || (doc.document == null && doc.document_id == null)) return (this.mode = 'unavailable')
    this.doc = doc.document_id != null ? { document_id: doc.document_id } : { document: doc.document }
    this.mode = 'connecting'
    if (await this.tryWs()) return (this.mode = 'ws')
    if (await this.tryHttp(probe)) return (this.mode = 'http')
    return (this.mode = 'unavailable')
  }

  /** the document goes with the first WS message; every POST carries it (stateless) */
  private body(req: LiveRequest, ws: boolean) {
    if (ws && this.docSent) return req
    if (ws) this.docSent = true
    return { ...this.doc, ...req }
  }

  private tryWs(): Promise<boolean> {
    const WS = this.d.WebSocket
    if (!WS) return Promise.resolve(false)
    return new Promise((resolve) => {
      let done = false
      const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok) } }
      try {
        const ws = new WS(this.d.wsUrl) // cookies are sent with the upgrade (same-site credentials)
        const t = setTimeout(() => { try { ws.close() } catch { /* ignore */ } finish(false) }, this.d.timeoutMs)
        ws.onopen = () => { clearTimeout(t); this.ws = ws; finish(true) }
        ws.onerror = () => { clearTimeout(t); finish(false) }
        ws.onclose = (ev?: CloseEvent) => {
          clearTimeout(t)
          if (this.ws === ws) {
            this.ws = null
            // 4401 not logged in / 4403 origin → the POST would fail the same way
            this.mode = ev && (ev.code === 4401 || ev.code === 4403) ? 'unavailable' : this.d.fetch ? 'http' : 'unavailable'
          }
          finish(false)
        }
        ws.onmessage = (ev) => { try { this.emit(JSON.parse(String(ev.data))) } catch { /* ignore bad frames */ } }
      } catch { finish(false) }
    })
  }

  private async tryHttp(probe?: LiveRequest): Promise<boolean> {
    if (!this.d.fetch) return false
    try {
      const r = await this.post(probe ?? { slew_deg: 0, outreach_mm: null, load_kg: null })
      return r != null
    } catch { return false }
  }

  private async post(req: LiveRequest): Promise<LiveResponse | null> {
    const res = await this.d.fetch!(this.d.httpUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.body(req, false)) })
    if (!res.ok) return null
    const body = (await res.json()) as LiveResponse
    if (!isResult(body)) return null
    this.emit(body)
    return body
  }

  private emit(r: LiveResponse) {
    if (!isResult(r)) return // WS error frames ({schema, error}) keep the connection, keep local data
    this.last = r
    this.listeners.forEach((l) => l(r))
  }

  /** Queue the latest request; at most one message per animation frame (and one HTTP request in flight). */
  send(req: LiveRequest) {
    if (!this.available) return
    this.pending = req
    if (this.scheduled) return
    this.scheduled = true
    this.d.raf(() => { this.scheduled = false; void this.flush() })
  }

  private async flush() {
    const req = this.pending
    if (!req) return
    if (this.mode === 'ws' && this.ws) { this.pending = null; this.ws.send(JSON.stringify(this.body(req, true))); return }
    if (this.mode === 'http' && !this.inflight) {
      this.pending = null
      this.inflight = true
      try { await this.post(req) } catch { /* keep local data */ } finally { this.inflight = false }
      if (this.pending) this.send(this.pending)
    }
  }

  close() { try { this.ws?.close() } catch { /* ignore */ } this.ws = null; this.mode = 'idle'; this.docSent = false }
}

/** A real answer: factor is a number or null (null = cannot tip, valid), no error field. */
export function isResult(r: unknown): r is LiveResponse {
  const o = r as Record<string, unknown> | null
  return !!o && typeof o === 'object' && !('error' in o) && (typeof o.factor === 'number' || (o.factor === null && 'pass' in o))
}

/** Level for colouring: response.level, else from status, else from pass (null factor = safe). */
export function liveLevel(r: LiveResponse): LiveLevel {
  if (r.level) return r.level
  if (r.status) return r.status === 'red' ? 'fail' : r.status === 'orange' ? 'warn' : 'ok'
  return r.pass === false ? 'fail' : 'ok'
}
