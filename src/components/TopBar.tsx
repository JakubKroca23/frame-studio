import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useApp } from '../state'
import { OPEN_ACCEPT, isProjectFile, queueProjectFile } from '../openProject'
import { TRW_ORIGIN } from '../trw/links'

/** Gate session for the logout button (provided by auth/Gate). */
export const SessionCtx = createContext<{ loggedIn: boolean; logout: () => void }>({ loggedIn: false, logout: () => {} })

const P: Record<string, ReactNode> = {
  plus: <><path d="M12 5v14M5 12h14" /></>,
  open: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" /><path d="M3 7v11a2 2 0 0 0 2 2h13l3-8H7l-3 8" /></>,
  drawing: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 17l3-3 2 2 3-4" /></>,
  cube: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  hooklift: <><path d="M2 18h14l2-3h4" /><path d="M6 18v-4l9-7 3 4" /><path d="M18 11v4M16 7h3v3" /><circle cx="6" cy="20" r="1.5" /><circle cx="15" cy="20" r="1.5" /></>,
  crane: <><path d="M12 2v6" /><circle cx="12" cy="9.5" r="1.5" /><path d="M12 11v3.5a4 4 0 1 1-4-4" /><path d="M8 10.5 6.5 9" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  save: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
}
export function Icon({ name }: { name: keyof typeof P | string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
}

const SHORT: Record<string, string> = { plus: 'Nový', open: 'Otevřít', drawing: 'Výkres', cube: 'DXF→3D', crane: 'Jeřáby', hooklift: 'Multilift', save: 'Export', panel: 'Panel', link: 'trw', logout: 'Odhlásit' }
export type BarAction = { icon: string; label: string; short?: string; onClick?: () => void; href?: string; active?: boolean; disabled?: boolean; external?: boolean }
export function IconButton({ icon, label, short, onClick, href, active, disabled, external }: BarAction) {
  const cls = active ? 'icon-btn is-active' : 'icon-btn'
  const txt = short ?? SHORT[icon]
  const inner = <><Icon name={icon} />{txt ? <span className="icon-btn-text">{txt}</span> : null}</>
  if (href) return <a className={cls} href={href} title={label} aria-label={label} aria-current={active ? 'page' : undefined} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>
  return <button type="button" className={cls} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>{inner}</button>
}

/** Hidden file input + open(): drawings → #vykres, .trw/.json → configurator. */
export function useOpenAny() {
  const ref = useRef<HTMLInputElement>(null)
  const { loadFile } = useApp()
  const input = (
    <input ref={ref} hidden type="file" accept={OPEN_ACCEPT} onChange={(e) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (!f) return
      if (isProjectFile(f.name) || window.location.hash.startsWith('#novy')) { queueProjectFile(f); if (!window.location.hash.startsWith('#novy')) window.location.hash = '#novy' } else { window.location.hash = '#vykres'; void loadFile(f) }
    }} />
  )
  return { input, open: () => ref.current?.click() }
}

const togglePanels = () => document.body.classList.toggle('hide-side')

/** Top bar on every screen: logo only, then icon buttons (global + page actions). */
export function TopBar({ page, actions = [] }: { page: 'start' | 'novy' | 'vykres' | 'dxf3d' | 'jeraby' | 'multilift'; actions?: BarAction[] }) {
  const { input, open } = useOpenAny()
  const session = useContext(SessionCtx)
  return (
    <header className="app-header topbar">
      <a className="topbar-logo" href="#" title="Úvod" aria-label="Úvod – CS Studio"><img src="/cs-mark.svg" alt="CS Studio" width="40" height="40" /></a>
      <nav className="topbar-actions" aria-label="Hlavní ovládání">
        <IconButton icon="plus" label="Nový projekt (konfigurátor)" href="#novy" active={page === 'novy'} />
        <IconButton icon="open" label="Otevřít projekt nebo výkres (.trw, .json, DXF, DWG)" onClick={open} />
        <IconButton icon="drawing" label="Výkres podvozku → 3D rám" href="#vykres" active={page === 'vykres'} />
        <IconButton icon="cube" label="Import DXF → 3D" href="#dxf3d" active={page === 'dxf3d'} />
        <IconButton icon="crane" label="Jeřáby HIAB" href="#jeraby" active={page === 'jeraby'} />
        <IconButton icon="hooklift" label="Nástavby Multilift (hákové nosiče)" href="#multilift" active={page === 'multilift'} />
        {actions.length ? <span className="topbar-sep" aria-hidden="true" /> : null}
        {actions.map((a) => <IconButton key={a.label} {...a} />)}
        <span className="topbar-grow" />
        {page !== 'start' ? <IconButton icon="panel" label="Zobrazit / skrýt boční panel" onClick={togglePanels} /> : null}
        <IconButton icon="link" label="Otevřít trw (TrailerWIN) v nové kartě" href={TRW_ORIGIN} external />
        {session.loggedIn ? <IconButton icon="logout" label="Odhlásit" onClick={session.logout} /> : null}
      </nav>
      {input}
    </header>
  )
}
