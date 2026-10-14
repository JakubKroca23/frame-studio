# trw/config@2 + live stability API (proposal)

Status: §1 (static export @2) is a **proposal**; §2 (live API) is **deployed** by trw as
`trw/stability-live@2`. frame-studio reads `trw/config@1` and uses the live API through
`src/trw/stabilityLive.ts`; without it, it falls back silently to the static `stability.angles[]`.

Units: mm, kg, kN, degrees. Coordinates as in config@1: `x` along the vehicle (trw origin, see
`x_origin`), `y` lateral (+ right), `z` up. Slew convention: `0° = forward`, clockwise seen from above,
`90° = right` (`stability.angle_convention`).

## 1. Static export: `trw/config@2`

Backwards compatible with @1 (all @1 fields keep their meaning). Changes in `stability`:

```jsonc
"stability": {
  "schema": "trw/stability@2",
  "verified": false,                 // true only once checked against CraneWIN
  "required_n": 1.4,                 // required stability factor n
  "dynamic": 1.3,
  "min_factor": 0.36,                // worst k over all angles
  "pass": false,
  "warn_utilisation": 0.85,          // optional, default 0.85 (see §3)
  "load_case": { "outreach_mm": 8000, "hook_height_mm": 3000, "load_kg": 2000, "crane_variant": "X-HiPro 142 E-4" },
  "angles": [                        // 361 entries, 0…360 step 1° (360 = 0 repeated, eases interpolation)
    { "angle_deg": 0, "factor": 9.42, "pass": true,
      "line": "FR",
      "tipping_lines": [ { "from": { "x_mm": 3760, "y_mm": 2894 }, "to": { "x_mm": 7775, "y_mm": 1250 } } ],
      "reactions": [ { "id": "L", "kind": "outrigger", "side": "left", "x_mm": 3760, "y_mm": -2894, "kN": 77.0 } ],
      "axle_loads": [ { "axle": 1, "kg": 7100 } ],
      "max_load_kg": 2600 }           // optional: max hook load at this angle for load_case outreach
  ],
  "reactions": [],                   // angle-independent reactions (as in @1)
  "sectors": [                       // optional, pre-merged by trw (frame merges itself when missing)
    { "from_deg": 60, "to_deg": 120, "factor": 0.36, "status": "fail" }
  ]
}
```

## 2. Live API — `trw/stability-live@2` (deployed)

The authoritative spec is in the trw repo: `docs/live-stability-api.md` (implementation
`backend/app/stability_live.py`). Summary of how frame-studio uses it:

| | |
|---|---|
| WebSocket | `wss://trw.propoj.app/api/stability/live`: one JSON message in, one out |
| HTTP fallback | `POST https://trw.propoj.app/api/stability/live`, JSON, `credentials: 'include'` |
| Auth | `trw_session` cookie. WS close **4401** = not logged in, **4403** = origin not allowed |
| CORS | `https://frame.propoj.app` (and `sim.propoj.app`) |

### Request

```json
{ "document": { "...": "CalcRequest (trw document, as sent to trw on import)" },
  "document_id": 12,
  "slew_deg": 90, "outreach_mm": 8000, "hook_height_mm": 3000, "load_kg": 1000, "crane_variant": null }
```

* `document` **or** `document_id` is required. On a WebSocket it goes only in the **first** message; later
  messages are just `{slew_deg, outreach_mm, load_kg}`. Every POST carries it (stateless).
* `load_kg` / `outreach_mm` null → document `crane.hook_kg` / `crane.radius_m`.
* `hook_height_mm`, `crane_variant` are only echoed (no hook-height input in the model).
* `slew_deg` is rounded to the 1° grid (`slew_deg_used`).

### Response

| field | meaning |
|---|---|
| `schema` | `"trw/stability-live@2"` |
| `slew_deg` | echo of the request (client drops answers > 2° off the current slew) |
| `factor` | n at the angle; **`null` = cannot tip at this angle (valid, shown as safe)** |
| `pass` | `factor >= required_n` (`true` when factor is null) |
| `status` | `green` / `orange` / `red` |
| `level` | `ok` / `warn` / `fail`, **used for colouring** |
| `required_n`, `dynamic`, `min_factor`, `active_line` | engine crane report |
| `axle_loads[]` | `{axle, kg, x_mm, limit_kg}`, **předpoklad**: static laden axle loads |
| `reactions[]` | `{id, kind:"outrigger", side, x_mm, y_mm, kN}` (independent of slew) |
| `cog` | `{x, y:null, z:null, mass_kg}`, **předpoklad** |
| `tipping_lines[]` | `{code, name, from{x_mm,y_mm}, to{x_mm,y_mm}, n, qmax_kg, active}` |
| `sectors[]` | `{from_deg, to_deg, factor, status, level}`; a sector wrapping through 0° has `to_deg < from_deg` |
| `max_load_kg` | **null** for now (no CraneWIN load charts) → frame keeps the HiSelect table |
| `stability_max_load_kg` | min Qmax over tipping lines at n_req |

Errors: POST 422 (missing document / no crane / bad input), 404 (unknown `document_id`);
WS `{"schema","error"}` with the connection kept open → client ignores the frame and keeps local data.

## 3. Sector status (frame-studio, `src/trw/stabilitySectors.ts`)

Utilisation `u = n / k` (`n = required_n`, `k = factor`):

| status | condition | colour |
|---|---|---|
| `ok` (bezpečné) | `k ≥ n / 0.85` (u ≤ 85 %) | green |
| `warn` (blízko limitu) | `n ≤ k < n / 0.85` (85 % < u ≤ 100 %) | orange |
| `fail` (nevyhovuje) | `k < n` or `pass: false` | red |
| `unknown` | no factor | grey |

Without `required_n` only `pass` decides (no warn band). Between trw angles the factor is linearly
interpolated (wrapping at 360°).

## 4. Client behaviour (`src/trw/stabilityLive.ts`)

1. Only with a document: the import keeps `document` (body sent to `/api/config/export`) or
   `document_id`; without one the client does **not** touch the network (a doc-less probe would get 422).
2. Try the WebSocket (3 s timeout) → else one probe `POST` with the document → else `unavailable`
   (silent, local data). WS 4401/4403 → `unavailable`.
3. Every crane move (slew / IK / protractor) updates a mutable store (`liveCrane`); the stability layer
   reads it in `useFrame` and sends one request per frame.
4. A response whose `slew_deg` is within 2° of the current slew overrides factor, pass, tipping lines and
   reactions and the status (`level`); live `sectors[]` replace the locally merged fan. Otherwise the
   local `angles[]` values are shown. Null factor → label "nepřeklopí se", green.
