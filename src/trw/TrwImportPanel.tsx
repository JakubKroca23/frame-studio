import { useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { TRW_URL, TrwAuthError, fetchTrwExport, mapTrwExport, type TrwImport } from './trwConfig'

/** "Načíst z trw": JSON export file, or a request body ({ document, meziram }) sent to the trw API. */
export function TrwImportPanel({ onImport }: { onImport: (result: TrwImport) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needLogin, setNeedLogin] = useState(false)

  async function run(task: () => Promise<TrwImport> | TrwImport) {
    setBusy(true)
    setError(null)
    setNeedLogin(false)
    try {
      onImport(await task())
    } catch (err) {
      if (err instanceof TrwAuthError) setNeedLogin(true)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function loadFile(file: File) {
    await run(async () => {
      let data: unknown
      try {
        data = JSON.parse(await file.text())
      } catch {
        throw new Error('Soubor není platný JSON.')
      }
      const doc = data as { schema?: string; document?: unknown }
      if (doc && typeof doc === 'object' && !doc.schema && doc.document) {
        try {
          return await fetchTrwExport(data)
        } catch (err) {
          if (err instanceof TypeError) throw new Error('trw není dostupný (síť nebo CORS).')
          throw err
        }
      }
      return mapTrwExport(data)
    })
  }

  return (
    <div>
      <div className="row">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Načítám…' : 'Načíst z trw (JSON)'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void loadFile(file)
          }}
        />
      </div>
      <p className="source-note">
        Soubor <code>trw-config-*.json</code> ze záložky Mezirám → „Export pro 3D / analýzu mezirámu“. Soubor s tělem výpočtu (<code>{'{ document, meziram }'}</code>) se odešle
        do trw (<code>/api/config/export</code>) s vaším přihlášením.
      </p>
      {needLogin ? (
        <p className="status error">
          Nejste přihlášeni v trw.{' '}
          <a href={TRW_URL} target="_blank" rel="noreferrer">
            Přihlásit se na trw.propoj.app
          </a>{' '}
          a zkusit znovu.
        </p>
      ) : null}
      {error ? <p className="status error">{error}</p> : null}
    </div>
  )
}
