# Lessons: chassis from DXF / DWG / TRW

Rules learned from real body-builder drawings. Read this before you change `analyze.ts`, `kinds.ts`, `annotate.ts` or `io/dwg.ts`.

## File handling
- Detect the file type from its content, not its extension. Volvo sends DWG (AC1032) files named `.dxf`, so check the `AC10` magic (`isDwgMagic`).
- The filtered DWG reader can return an empty model space because it drops the INSERTs. Count the model-space entities (`modelSpaceCount`) and fall back to the full libredwg conversion when the count is 0.
- Some drawings are at a scale such as 1:10 with `$INSUNITS=0`. Do not guess the scale. Compare the drawing's own L012-style dimension text with the measured axle distance. When the ratio matches a standard scale k within 1.5 %, rescale (`scaleDxfText`) and tell the user.

## Classification
- Volvo BEP layers are named after components (`41_Fuel tank`, `27_AdBlue`, …). Use the layer as the strongest evidence (`kindFromLayer`). It applies only to layers matching `^\d{2}_`.
- Block prefixes collide: FE means a fifth wheel and also a rear fender, and UT means a toolbox and also a urea tank. The layer wins whenever it disagrees with the block prefix.
- Check heat shields before mufflers, because the layer names contain both words. Fenders map to shield and side underrun bars map to skirt. Pipes, springs and brackets are skipped.

## Dimensions
- Use only what the DXF or TRW gives. Anything else is `a(…)` (estimate) and must be shown as estimated.
- DXF and TRW can disagree on the frame top height. TRW "A" block row 21 = 1064, while the drawing says 1300, measured from a different datum. Use the TRW value for the height above the ground. Take the section height (300) from either source, because they agree.
- Read the cab from the files, not from pictures. The reference renders showed an FH, but both the DWG header and the TRW say FM (`FM_CAB-DAY_CABL165_CABH175`).
- TRW `*BEGIN A` values used: 1365 front overhang, 5600 wheelbase, 1370 tag-axle spacing, 300 frame height, 1064 frame top, 26000 legal GVW (`GK` 26100 is the technical value, above the EU limit for 3 axles). The rest of the block is not identified yet, so don't map it by guesswork.

## Tests
- Company drawings stay out of the public repo. Put them in `test-local/` (gitignored) and write tests as `*.local.test.ts` that skip when the fixture is missing.

## Volvo BEP – vizuál (truckDetail.ts)
- Extrudované DXF siluety BEP dílů (32_ boční ochrana, 19_ zadní nárazník, 49_ blatník) vypadají jako černé bloky → nahradit typovanými procedurálními buildery podle prefixu vrstvy.
- `Placed` (detail.ts) má y = příčně, z = nahoru; `PlacedPart` (truckDetail) y = nahoru, z = příčně → adaptér v `take()`. Ověřit debug výpisem souřadnic, ne odhadem.
- `ReviewElement` musí nést `layer`, jinak `isBep` v prohlížeči nikdy neplatí.
- Nikdy `Object.assign(mesh, {position})` – position je read-only → `position.set`.
- Barvy dle Creo: rám černý, příčky modré, boční rámy zelené, nárazník šedá trubka, spojka žlutá. Kabina: parametrická FM/FH podle hlavičky, barva `params.cabColor`.
