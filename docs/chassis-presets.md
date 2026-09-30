# Chassis presets ("Vytvořit nový")

The configurator (`#novy`) starts from a preset in `src/presets/chassisPresets.ts`.
Every value in a preset is either **read from the cited source** (a plain number) or
**estimated** (`a(value)` → `{ value, approx: true }`). Estimated values are listed per preset
in `ChassisPreset.approx` (dotted paths such as `frame.flange`) and are shown in the UI with an
"≈ odhad" badge. Everything can be edited afterwards.

## Sources per make

### Volvo (FH, FM, FMX)
- Volvo Trucks model-range specification sheets (body-builder data: wheelbases, overhangs,
  frame height/section, cab length/height, tyres, technical axle loads, GVW/GCW, fuel tanks):
  - FH 4x2 tractor: https://stpi.it.volvo.com/STPIFiles/Volvo/ModelRange/fh42t3a_gbr_eng.pdf
  - FH 6x2 tag-axle tractor: https://stpi.it.volvo.com/STPIFiles/Volvo/ModelRange/fh62tt3a_gbr_eng.pdf
  - FH 6x2 tag-axle rigid: https://stpi.it.volvo.com/STPIFiles/Volvo/ModelRange/fh62rt3a_gbr_eng.pdf
  - FM 4x2 rigid: https://stpi.it.volvo.com/STPIFiles/Volvo/ModelRange/fm42r3a_gbr_eng.pdf
  - FMX 8x4 tridem rigid: https://stpi.it.volvo.com/STPIFiles/Volvo/ModelRange/fmx84rt3a_gbr_eng.pdf
- Volvo body-builder order drawing VSSB-25-277591 (FM 8x4, in `public/samples/`) for the
  twin-steer preset and as reference for frame width / taper / rail flange.

### Scania (R, S, G)
- Scania Truck Bodybuilder, chassis frame guide (270 mm rail section, 768 mm outer frame width, front widening,
  frame heights):
  https://bodybuilder.scania.com/content/dam/bodybuilder/tbb-files/taiwan/guide/Scania_NTG_Truck_chassis_construction_main_beam_and_subframe_2026.pdf
- Scania ICD drawing 2492101765219 (G 360E B6x2*4NB, in `public/samples/`) for the 6x2*4 rigid
  (wheelbase, overhangs, axle positions, frame height, cab).
- R 4x2 tractor (LA4x2MNA) dimensions come from a **secondary source** (Scania's own spec
  configurator is not publicly fetchable): https://www.europa-lkw.de/technische-daten-modell/scania-la4x2mna
- S 450 A4x2NA: dealer-listing copy of the Scania specification (secondary), frame from the
  bodybuilder guide above. Treat the S preset as the least reliable one.

### MAN (TGX, TGS)
- MAN Truck & Bus UK body-builder spec sheets (2022 range; wheelbases, overhangs, frame height
  laden/unladen, axle loads, GVW/GCW, tyres, cab dimensions, tanks):
  - TGX 4x2 tractor: https://www.man-bodybuilder.co.uk/specs/pdf/2022/TGX/4x2-Tractor.pdf
  - TGS 6x2 rigid: https://www.man-bodybuilder.co.uk/specs/pdf/2022/TGS/6x2-Rigid.pdf
    (cross-checked with `TGX/6x2-Rigid.pdf`, `TGS/4x2-Rigid.pdf`)
  - TGS 6x4 tractor: https://www.man-bodybuilder.co.uk/specs/pdf/2022/TGS/6x4-Tractor.pdf
  - TGS 8x4 tipper: https://www.man-bodybuilder.co.uk/specs/pdf/2022/TGS/8x4-Normal-Height-Tipper.pdf

### DAF (XF, XG, XD)
- DAF UK specification sheets (wheelbases, overhangs, frame section/height, axle loads, tyres,
  cab dimensions, fuel/AdBlue, fifth-wheel lead "KA"):
  - XF FT 4x2 tractor: https://www.daf.co.uk/api/feature/specsheet/open?filename=TSGBEN016G0209AAAA202545.pdf
  - XG FT 4x2 tractor: https://www.daf.co.uk/api/feature/specsheet/open?filename=TSGBEN016G0309AAAA202545.pdf
  - XF FAN 6x2 rigid: https://www.daf.co.uk/api/feature/specsheet/open?filename=TSGBEN016F0229NAAA202545.pdf
  - XD FAD 8x4 rigid: https://www.daf.co.uk/api/feature/specsheet/open?filename=TSGBEN016F0171AAAA202545.pdf

### Legal limits
- EU Directive 96/53/EC, Annex I (max. authorised weights: 7.1–10 t steer, 11.5 t drive,
  18/19 t two-axle, 26 t three-axle, 32 t four-axle): https://eur-lex.europa.eu/eli/dir/1996/53/oj
  Used where a source gives no technical axle loads, and by the soft validation in
  `src/presets/validate.ts`.

## Wheelbase conventions
Manufacturers measure the wheelbase differently; each preset stores its convention
(`wheelbaseRef`) and the UI shows/edits it in that convention:
- `firstRear` – first front axle → first rear axle (Volvo, Scania, MAN 2/3-axle).
- `secondFrontToFirstRear` – MAN 8x4 "L1": second front axle → first rear axle.
- `rearCentre` – DAF multi-axle: first front axle → centre of the rear axle group.

## What is estimated (approx) and why
| Value | Basis |
|---|---|
| Track widths (`axles.*.track`) | Industry-typical: ~2050–2120 mm steer, ~1800–1850 mm twin-tyre drive; only some sheets list them. |
| Frame outer width front/rear, taper position, rail flange, thickness | Volvo/DAF sheets give the section height only; flanges and front widening from the Volvo BEP drawing and typical ~850 mm frames; MAN frame widths come from the MAN sheets, Scania from the bodybuilder guide. |
| Frame front end (`frame.frontEnd`) | Distance of the rail end ahead of the front axle; chosen to sit behind the bumper. |
| Cab length (Volvo, Scania, MAN) | Sheets give cab-to-axle dimensions but not always the bare cab length; typical day ≈1.65 m, sleeper ≈2.2–2.3 m. |
| Cab height (DAF, Scania S) | DAF sheets give height above frame (HA + CH), interpreted as total height; Scania S from a secondary source. |
| Tag/pusher/tridem axle load split | Sheets give the group load; split per axle estimated. |
| Axle loads / GVW for the Scania ICD, Volvo BEP presets | EU 96/53/EC limits (drawings carry no loads). |
| GCW for rigids | Typical 40–44 t; not on rigid sheets. |
| Fifth-wheel height / lead | Typical 1150–1250 mm height; lead from DAF "KA" where listed, otherwise typical. |
| Fuel / AdBlue volumes (Scania, some MAN/DAF) | Typical tank sizes when the sheet does not state the standard tank. |
| Air tank count | Always estimated (not published). |
| Cab shapes (`src/presets/cabShapes.ts`) | Parametric per-brand silhouettes: windscreen rake, roof radius, corner rounding, grille bands and roof deltas for low/normal/high roofs, ±490 mm day↔sleeper shift. These are visual approximations, not manufacturer geometry. |

The UI also shows the per-preset count of estimated values next to the source link.
