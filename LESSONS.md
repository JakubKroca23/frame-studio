# LESSONS

## Varianta 3D modelu z šablony + výkresu (přídavné podpěry, jeřáby)
1. Kóty vyčti z výkresu (PDF: `pdftotext -layout`, tabulky; DXF: ezdxf – texty kót jsou v geometry bloku DIMENSION, tabulky v ACAD_TABLE). Nikdy nevymýšlej rozměry; co výkres neuvádí = `null` / ponechat šablonu.
2. Tabulka šablona vs. cíl (zasunuto, vysunuto, rozteč sloupů, šířka, výška, patky) → zapiš do katalogu (`src/trw/outriggerCatalog.json`, jeřáby `craneCatalog.json`).
3. Změř GLB (trimesh, jednotky m). Díly delší než ~1 m (housing, výsuvná ramena) roztahuj po vrcholech jen v řezové zóně uprostřed (bez hustých úchytů); krátké díly (patky, válce, úchyty) posuň tuze podle středu. Žádné uniformní škálování.
4. Průřez měň jen když výkres dá jinou šířku (6m: 426 → 457.3, faktor v ose šířky pro všechny díly).
5. Ověř bbox proti kótám (tolerance ±1 mm) a vypiš odchylky (co výkres má, ale model nedrží) do `modelDeviations`.
6. Komprese: `npx @gltf-transform/cli optimize --compress draco --texture-compress false --simplify false`.
7. Výkresy (PDF/DXF) do repa nedávat – jen GLB + katalog. Skript: `scripts/outrigger/mk_variant.py` (parametry DL, X0/X1, KZ).
