# Modely jeřábů (crane definitions)

Every crane model is one `CraneDef` in `src/trw/craneKinematics.ts` (`CRANE_DEFS`). Gizmos, IK, readouts, stability
labels and the panel read only from it, so a new model needs **data plus a mesh**, not new code.

| field | meaning |
|---|---|
| `match` | regex for the trw crane name (`craneDefFor`; 408: `408`, `X-HiPro 408`, `408E8`, `408 E-8`) |
| `file` / `foldedFile` | articulated GLB (groups `base`, `column`, `cyl1?`, `main`, `outer`, `ext1…extN`) / optional separate folded GLB |
| `geom` | boom plane of the mesh pose [m]: `p1` main pivot, `p2` knuckle, `tipRetracted`, `lateralOffset` of the outer boom, `extDir` (when the telescopes do not run along p2→tip) |
| `limits` | a1, rel, slew [°] |
| `variants` | id, extension count, min/max hydraulic and manual outreach [mm] |
| `loads` | load table per variant (`sor` [m, kg], `hors`, `mor1`, `mlc1`), or `null` → "nosnost n/a" |
| `meshExtSections` | telescopic profiles in the mesh (they are spread over the variant's stroke) |
| `folded` / `unfolded` | presets (folded = mesh pose, when there is no separate folded GLB) |

Mesh frame: x lateral, y up, z = r (boom direction of the mesh pose), origin on the slewing axis at the crane underside.
The base group is stored in the slew-0 frame (z = forward), so the boom groups at `folded.slew` match the CAD.

## HIAB X-HiPro 408 E-8 (from the user's GLB)

* GLB: SolidWorks export, Draco, metres, 1824 parts named only by part number (`408E8_ASM_<n>_`), 1 grey material, 1.44 M tris, folded transport pose with **up = −Y**.
  Segmented geometrically (`scripts/crane/408/`): nested box profiles along the boom axis, pins = cylindrical parts with the axis along the vehicle.
  95 duplicate instances and 252 parts < 25 mm dropped, meshopt-simplified → 104 k tris, 371 kB (`public/models/crane/hiab-x-hipro-408e8-articulated.glb`).
* Measured (±5 mm, pin centres): main pivot P1 r −0.310 / h 2.384 m, knuckle P2 r 1.244 / h 0.555 m → main boom 2.400 m;
  retracted outer boom P2 → hook pin 2.787 m; extension axis 4.4° off P2 → tip; outer boom 0.44 m beside the main boom plane;
  folded pose a1 −49.6°, rel −167.0°; folded envelope 1.33 × 2.51 (h) × 2.60 (w) m (datasheet 1.406 / 2.458 / 2.542).
* Telescopes: 6 nested profiles in the GLB (258…123 mm); the missing ~166 mm and ~101 mm sections were modelled (approved) by cloning + scaling the neighbour profile incl. pads/end plates, nested, tip 90 mm beyond the neighbour; hook moved to the 8th. 8 sections × ≈2.0 m (15.93 m). E-4…E-7 show only their first n sections (retracted length assumed = E-8).
* Datasheet (Hiab): hydraulic outreach 20.9 m, manual 22.4 m. Stroke = 20.9 − 4.877 (measured retracted straight reach) = 16.0 m ≈ 8 × 2.0 m.
* **Assumed**: joint limits (a1 −52…80°, rel −170…30°, slew ±360° continuous), mounting plane = lowest point of the GLB, booms fold over the right side and GLB +x = forward, unfolded preset a1 15° / rel −10°, cylinders move with the booms (not re-aimed).
* No load table → "nosnost n/a" (the public datasheet has a reach/load chart — add it as `loads` once approved).

## Proportional generator (design, not implemented)

Goal: a crane without CAD, drawn from a handful of dimensions, scaled from the nearest meshed model of the same family.

1. Pick a template (`142` for small E/ES, `408` for mid-range E) by lifting moment and number of extensions.
2. Scale each group separately: column/base by pivot height and folded width; main boom along its axis to L1; outer boom
   to L2; each telescope profile to `stroke + overlap`; remove/duplicate telescope meshes to match the extension count.
3. Place pivots at the given heights; fold pose from the folded envelope (solve a1/rel so the package fits the height × width).
4. Kinematics come straight from the numbers (no mesh measuring), loads from the drawing's load table.

Dimensions needed per crane (from drawings / data sheets):

| | |
|---|---|
| pivot heights | main pivot P1 (r, h above the mounting plane), knuckle P2 in a known pose, slewing axis position in the base |
| boom lengths | L1 (P1→P2), retracted outer boom P2→hook, lateral offset of the outer boom |
| extensions | count, stroke per extension (or retracted + max hydraulic outreach), manual extension length |
| angles | a1 min/max, outer boom rel min/max, slewing range |
| folded size | height, width, installation length; side the booms fold to |
| outriggers | beam width / spread, leg position |
| loads | outreach/load table per variant (SOR/SLC, manual) |
