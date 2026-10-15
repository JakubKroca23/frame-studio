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
- Kola 2. kolo: oblouk blatníku „před kabinou“ byl blatník kabinové sady – `ParametricCabSpec` má x relativně k přední nápravě (blatník je na x = 0), ne v absolutních x výkresu. Spec posílat relativně + offset `a0.x − originX`.
- BEP: dvojmontáž jen na první `dual` nápravě (hnací), vlečná náprava singl. Defaultní `addRearBar`/profilové blatníky z výkresu u BEP vypnout – jinak vznikají duplicitní černé bloky.
- Vrstvy 45_ (vzduch), 21_ (baterie), 27_ (AdBlue) mají vlastní buildery; zadní světla se kreslí na koncích trubky nárazníku (výška = horní hrana 19_ − 60 mm).
- Srovnávací snímky: `pwnode/shots.sh` – skryje `env`, bílé pozadí, ořez na obsah (jako Creo).

## Specifikace výrobce (PDF, MAN „Popis vozidla“) → podvozek (src/spec)
- PDF číst v prohlížeči přes pdf.js (`pdfjs-dist`, worker přes `?url`). Text skládat po řádcích podle y, mezery mezi sloupci = víc mezer – MAN má dvousloupcová TD data na jednom řádku.
- TD řádky: hodnota je poslední číslo/`-` segmentu; `TD078 270 x 85` pokračuje `x 10` na dalším řádku. `-` = hodnota není (null), nikdy 0.
- MAN 6x4: TD057 = 0, rozvor je v „Rozvor kol“ (1. → 1. zadní), rozteč zadních náprav TD059. TD071 ≠ TD063 + rozvory + TD064 (o 355 mm – přesah spojky/ochrany) → jen varování, rám kreslit podle TD064.
- TD035 = výška rámu nenaložené, TD036 naložené. TD072 = 1. náprava → nástavba (ne zadní stěna kabiny) → kabina = TD072 − 100 mm jako předpoklad.
- Průměr kola z ISO rozměru je přesná matematika (rim·25.4 + 2·šířka·profil), ne odhad. Dvojmontáž MAN neuvádí → odvozená, označená jako předpoklad.
- Strany výbavy (nádrž, AdBlue, tlumič, baterie, rezerva) jsou ve výbavových řádcích; podélné polohy a rozměry nejsou nikde → vždy seznam předpokladů v UI (`SpecImport.assumptions`) + `approx` v předloze.
- Firemní PDF jen v `test-local/` (`*.local.test.ts`); do repa jen syntetický fixture s TD řádky.
- Volvo „Technická specifikace“: font PDF ztrácí glyf „á“ (mezera/nic) a ligaturu „fi“ (→ „R“). Vzory psát přes `rx()` – nikdy nedávat „á“ dovnitř `[...]` (rx ho nahrazuje třídou). Rozvor, zadní převis, profil 300/8 a výška „cca 1000“ (= odhad, `approx`) jsou v odrážkách; přední převis, šířka rámu, délka kabiny chybí → předpoklady.
- DAF (NAPA): prosté věty zalomené přes řádky → spojit vše kromě odrážek „-  “. Rozvor „5,60 m / zadní převis 3,15m“, „Délka kabiny: 2360 mm; šířka kabiny: 2500 mm“, nosník „výška 310 mm, tloušťka 7,0 mm“. Zatížení hnané = skupina − vlečená (odvozeno, ve zdroji tak označeno).
- Značka: MAN = řádky TDxxx, Volvo = „Volvo Group“ + „Technická specifikace“, DAF = „Specifikace XF/XG/XD/CF…“. Společný mezimodel `SpecData` (src/spec/specModel.ts) → `specToConfig`.

## 3D podlaha
- Jediná podlaha všude: `ConcreteFloor` (src/view/ConcreteFloor.tsx) – jedna šedá rovina, polygonOffset +2, mírně pod 0. Žádné `Grid`/`gridHelper`/`ContactShadows` přes podlahu (nekonečná mřížka nad rovinou = moiré/z-fighting). Značení na podlaze (pruhy, kruhy, stíny) zvednout o ≥ 10 mm a dát polygonOffset záporný + depthWrite false.
