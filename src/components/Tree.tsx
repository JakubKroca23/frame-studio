import { useEffect, useState, type ReactNode } from 'react'

/** Collapsible tree for the catalogue side columns: chevron rows with indentation, counts per group, the selected
 *  leaf in the company blue. Nodes are expanded by default when they lie on the selected path (`open`), and re-open
 *  when the selection moves into them; the user can collapse / expand anything. */
export function TreeNode({ label, count, open = false, selected = false, onSelect, children, testid, hint }: {
  label: ReactNode; count?: number; open?: boolean; selected?: boolean; onSelect?: () => void; children?: ReactNode; testid?: string; hint?: ReactNode
}) {
  const [isOpen, setOpen] = useState(open)
  useEffect(() => { if (open) setOpen(true) }, [open])
  const leaf = !children
  const click = () => { if (onSelect) { onSelect(); if (!leaf) setOpen(true) } else setOpen((o) => !o) }
  return (
    <li className="tree-node" role="treeitem" aria-expanded={leaf ? undefined : isOpen} aria-selected={selected || undefined}>
      <div className={`tree-row${selected ? ' is-sel' : ''}${onSelect ? ' is-pick' : ''}`} data-testid={testid}>
        {leaf ? <span className="tree-chev is-leaf" aria-hidden="true" /> : (
          <button type="button" className="tree-chev" aria-label={isOpen ? 'Sbalit' : 'Rozbalit'} onClick={() => setOpen((o) => !o)}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button type="button" className="tree-label" onClick={click}>
          <span className="tree-text">{label}</span>
          {hint ? <span className="tree-hint">{hint}</span> : null}
          {count != null ? <span className="tree-count">{count}</span> : null}
        </button>
      </div>
      {!leaf && isOpen ? <ul className="tree-children" role="group">{children}</ul> : null}
    </li>
  )
}

/** Free content (controls, tables, text) inside an expanded node. */
export function TreeContent({ children }: { children: ReactNode }) {
  return <li className="tree-content">{children}</li>
}

export function Tree({ children, label }: { children: ReactNode; label: string }) {
  return <ul className="tree" role="tree" aria-label={label}>{children}</ul>
}
