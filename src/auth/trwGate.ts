/**
 * Single-password gate shared with trw (cookie trw_session, Domain=propoj.app).
 * GET  /api/auth/me       → 200 {authenticated, password_required} | 401 {authenticated:false, password_required:true}
 * POST /api/auth/password → {"password"} → 200 {ok:true} | 401 {error:"bad_password"} | 429
 * POST /api/auth/logout
 * The password is never stored; only the cookie (set by trw) authenticates.
 *
 * Transition safety (trw not deployed yet): the gate only locks when trw answers in the NEW contract
 * (401 with password_required:true). Network/CORS errors, other statuses and the old 401 {"detail":…} open the app.
 */
import { TRW_URL } from '../trw/trwConfig'

export const TRW_AUTH_ME_URL = `${TRW_URL}/api/auth/me`
export const TRW_AUTH_PASSWORD_URL = `${TRW_URL}/api/auth/password`
export const TRW_AUTH_LOGOUT_URL = `${TRW_URL}/api/auth/logout`

export type GateState =
  | { kind: 'open'; loggedIn: boolean; note?: string } // loggedIn = password set and accepted (show "Odhlásit")
  | { kind: 'locked' }

const json = async (r: Response) => { try { return (await r.json()) as Record<string, unknown> } catch { return null } }

export async function checkGate(fetcher: typeof fetch = fetch): Promise<GateState> {
  let res: Response
  try {
    res = await fetcher(TRW_AUTH_ME_URL, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    return { kind: 'open', loggedIn: false, note: 'trw nedostupný – ověření hesla přeskočeno' }
  }
  const b = await json(res)
  if (res.ok) return { kind: 'open', loggedIn: b?.authenticated === true && b?.password_required === true }
  if (res.status === 401 && b?.password_required === true) return { kind: 'locked' }
  return { kind: 'open', loggedIn: false, note: `trw /api/auth/me ${res.status} (přechodná verze) – ověření hesla přeskočeno` }
}

/** null = ok, else Czech error message. */
export async function loginWithPassword(password: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  let res: Response
  try {
    res = await fetcher(TRW_AUTH_PASSWORD_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
  } catch {
    return 'trw není dostupný (síť nebo CORS).'
  }
  if (res.ok) return null
  const b = await json(res)
  if (res.status === 429) return 'Příliš mnoho pokusů. Zkuste to za chvíli znovu.'
  if (res.status === 401 || b?.error === 'bad_password') return 'Špatné heslo.'
  return `Přihlášení selhalo (trw ${res.status}).`
}

export async function logout(fetcher: typeof fetch = fetch): Promise<void> {
  try { await fetcher(TRW_AUTH_LOGOUT_URL, { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
}
