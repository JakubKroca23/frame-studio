import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../components/ui/button'
import { checkGate, loginWithPassword, logout, type GateState } from './trwGate'

/** Password gate in front of the whole app (password goes only to trw; never stored). */
export function Gate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState | null>(null)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recheck = () => checkGate().then(setState)
  useEffect(() => { void recheck() }, [])
  if (!state) return <div className="gate" style={{ padding: 40, fontFamily: 'sans-serif' }}>Ověřuji přístup…</div>
  if (state.kind === 'locked') {
    const submit = async (e: FormEvent) => {
      e.preventDefault()
      setBusy(true)
      const m = await loginWithPassword(pw)
      setPw('')
      setBusy(false)
      setErr(m)
      if (!m) {
        const s = await checkGate()
        if (s.kind === 'locked') setErr('Přihlášení se nepodařilo ověřit (cookie trw nebyla přijata).')
        setState(s)
      }
    }
    return (
      <form className="gate" onSubmit={submit} style={{ maxWidth: 320, margin: '15vh auto', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'sans-serif' }}>
        <strong>Frame Studio</strong>
        <label htmlFor="gate-pw">Heslo</label>
        <input id="gate-pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" variant="rust" disabled={busy || !pw}>Přihlásit</Button>
        {err ? <div role="alert" style={{ color: '#b3261e' }}>{err}</div> : null}
      </form>
    )
  }
  return (
    <>
      {children}
      {state.loggedIn ? (
        <button type="button" className="gate-logout" onClick={async () => { await logout(); await recheck() }}
          style={{ position: 'fixed', right: 8, bottom: 8, zIndex: 1000, fontSize: 11, opacity: 0.7 }}>Odhlásit</button>
      ) : null}
    </>
  )
}
