/**
 * Short-lived trw token (trw button "Otevřít ve frame-studio" opens frame with `#trw_token=…`, valid 12 h).
 * The trw session cookie is not sent from frame.propoj.app, so requests to trw carry `Authorization: Bearer`
 * (credentials: 'include' stays as a fallback) and the live WebSocket gets `token` in its first message.
 */
export const TRW_TOKEN_KEY = 'trw_token'
export const TRW_TOKEN_TTL_MS = 12 * 3600 * 1000
export const TRW_OPEN_HINT = 'otevřete frame tlačítkem „Otevřít ve frame-studio“ v trw'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const store = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

/** Reads `trw_token` from the hash (`#trw_token=x` or `#novy&trw_token=x`), stores it, removes it from the URL. */
export function captureTrwToken(loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location, s: Store | null = store(), hist: Pick<History, 'replaceState'> | null = typeof history !== 'undefined' ? history : null, now = Date.now()): string | null {
  const parts = loc.hash.replace(/^#/, '').split('&').filter(Boolean)
  const i = parts.findIndex((p) => p.startsWith('trw_token='))
  if (i < 0) return null
  const token = decodeURIComponent(parts[i].slice('trw_token='.length))
  parts.splice(i, 1)
  if (token) s?.setItem(TRW_TOKEN_KEY, JSON.stringify({ token, ts: now }))
  hist?.replaceState(null, '', `${loc.pathname}${loc.search}${parts.length ? `#${parts.join('&')}` : ''}`)
  return token || null
}

/** Stored token if younger than 12 h (expired ones are removed). */
export function getTrwToken(s: Store | null = store(), now = Date.now()): string | null {
  const raw = s?.getItem(TRW_TOKEN_KEY)
  if (!raw) return null
  try {
    const { token, ts } = JSON.parse(raw) as { token?: string; ts?: number }
    if (typeof token === 'string' && token && typeof ts === 'number' && now - ts < TRW_TOKEN_TTL_MS) return token
  } catch { /* corrupt */ }
  s?.removeItem(TRW_TOKEN_KEY)
  return null
}

export function trwAuthHeaders(token = getTrwToken()): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Status reason for 401 / WS 4401. */
export function trwAuthReason(token = getTrwToken()): string {
  return token ? `token trw neplatný nebo vypršel – ${TRW_OPEN_HINT}` : `nepřihlášen v trw – ${TRW_OPEN_HINT}`
}
