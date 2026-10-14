/** Start hero: the FS logo without the letters — teal cab, gradient truss with nodes and arrows, orange crane. */
export function HeroArt() {
  const nodes: [number, number][] = [[200, 60], [280, 60], [360, 60], [440, 60], [520, 60], [200, 130], [280, 130], [360, 130], [440, 130], [520, 130], [200, 200], [280, 200], [360, 200], [440, 200], [520, 200]]
  return (
    <svg className="hero-art" viewBox="0 0 640 290" role="img" aria-label="Nákladní vůz s příhradovým rámem a jeřábem">
      <defs>
        <linearGradient id="hg" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="540" y2="0"><stop offset="0" stopColor="#3EE6C4" /><stop offset=".5" stopColor="#1F6FE0" /><stop offset="1" stopColor="#FF6A2B" /></linearGradient>
        <pattern id="hgrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#3EE6C4" strokeOpacity=".09" strokeWidth=".6" /></pattern>
      </defs>
      <rect x="200" y="60" width="320" height="140" fill="url(#hgrid)" />
      {/* cab */}
      <g className="hero-cab" fill="none" stroke="#3EE6C4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M40 222v-48l22-46c4-8 10-12 18-12h70l14-34c22-14 30-14 30-14v154" />
        <path d="M82 138h56v44H68z" strokeWidth="2.2" />
        <path d="M104 72c18-12 40-16 76-16" strokeWidth="2" />
        <path d="M40 200h30M150 192h-20" strokeWidth="2" />
      </g>
      {/* chassis */}
      <path d="M40 222h560M150 236h450" stroke="#1F6FE0" strokeWidth="3" strokeLinecap="round" />
      <path d="M190 222v14M560 222v14" stroke="#1F6FE0" strokeWidth="2" />
      {/* truss */}
      <g className="hero-truss" fill="none" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path pathLength="1" d="M200 60H520V200H200Z" />
        <path pathLength="1" d="M200 130H520M280 60V200M360 60V200M440 60V200" />
        <path pathLength="1" d="M200 200L280 60M280 130L360 60M440 60L520 130M440 200L520 130M360 200L440 130" />
      </g>
      <g className="hero-nodes" fill="#141A24" stroke="#e6edf5" strokeWidth="1.8">{nodes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" />)}</g>
      {/* load arrows */}
      <g className="hero-arrows" stroke="#FF6A2B" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path d="M400 26v22M396 42l4 6 4-6M470 30h28M492 26l6 4-6 4M540 100h22M556 96l6 4-6 4" />
        <path d="M200 20v28" stroke="#3EE6C4" /><circle cx="200" cy="16" r="4" stroke="#3EE6C4" />
      </g>
      {/* crane */}
      <g className="hero-crane" fill="none" stroke="#FF6A2B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M585 222V170M568 170h34M572 222h26" />
        <g className="hero-boom"><path d="M585 170L556 92l40-22" /><path d="M560 104l26 54" strokeWidth="2.2" /><path d="M596 70v26" strokeWidth="2" /></g>
      </g>
      {/* wheels */}
      <g fill="none" stroke="url(#hg)" strokeWidth="3.5">
        <circle cx="105" cy="246" r="24" /><circle cx="440" cy="246" r="24" /><circle cx="500" cy="246" r="24" />
      </g>
    </svg>
  )
}

/** Small looping previews for the feature cards (CSS animated, static with prefers-reduced-motion). */
export function MiniArt({ kind }: { kind: 'config' | 'hooklift' | 'crane' | 'stability' | 'dxf' }) {
  const s = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg className={`mini-art mini-${kind}`} viewBox="0 0 120 70" aria-hidden="true" {...s}>
      {kind === 'config' ? (
        <g stroke="url(#mg)" strokeWidth="2.4">
          <path className="draw" pathLength="1" d="M20 20h80v30H20zM20 35h80M47 20v30M73 20v30M20 50l27-30M73 20l27 30" />
          <path d="M10 58h100" stroke="#1F6FE0" />
        </g>
      ) : kind === 'hooklift' ? (
        <g strokeWidth="2.4">
          <path d="M8 56h104" stroke="#1F6FE0" />
          <g className="tilt"><path d="M30 50h70v-6H30z" stroke="#3EE6C4" /><path d="M34 44l8-24h6" stroke="#3EE6C4" /><path d="M48 20v6" stroke="#FF6A2B" /></g>
          <circle cx="28" cy="60" r="5" stroke="#3EE6C4" /><circle cx="92" cy="60" r="5" stroke="#3EE6C4" />
        </g>
      ) : kind === 'crane' ? (
        <g strokeWidth="2.6">
          <path d="M20 60h80" stroke="#1F6FE0" /><path d="M40 60V40" stroke="#FF6A2B" />
          <g className="swing"><path d="M40 40l26-18" stroke="#FF6A2B" /><g className="swing2"><path d="M66 22l26 10" stroke="#F6A04A" /><path d="M92 32v10" stroke="#3EE6C4" strokeWidth="1.6" /></g></g>
        </g>
      ) : kind === 'stability' ? (
        <g>
          <path d="M20 46h80" stroke="#1F6FE0" strokeWidth="2.4" />
          <path className="pulse" d="M60 46L60 8A38 38 0 0 1 96 34Z" fill="#3EE6C4" fillOpacity=".25" stroke="#3EE6C4" strokeWidth="1.4" />
          <path className="pulse2" d="M60 46L96 34A38 38 0 0 1 92 66Z" fill="#FF6A2B" fillOpacity=".2" stroke="#FF6A2B" strokeWidth="1.4" />
          <circle cx="60" cy="46" r="3" fill="#e6edf5" />
        </g>
      ) : (
        <g strokeWidth="1.8">
          <path d="M10 14h30v20H10zM10 44h30v14H10zM48 44h20v14H48z" stroke="#93a1b4" />
          <path className="draw" pathLength="1" d="M84 30l18-10 14 8v20l-18 10-14-8zM84 30l14 8 18-10M98 38v20" stroke="#3EE6C4" strokeWidth="2.2" />
          <path d="M70 36h8M75 33l3 3-3 3" stroke="#FF6A2B" />
        </g>
      )}
      <defs><linearGradient id="mg" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="100" y2="0"><stop offset="0" stopColor="#3EE6C4" /><stop offset=".5" stopColor="#1F6FE0" /><stop offset="1" stopColor="#FF6A2B" /></linearGradient></defs>
    </svg>
  )
}
