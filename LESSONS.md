# LESSONS

## Varianta 3D modelu z šablony + výkresu (přídavné podpěry, jeřáby)
1. Kóty vyčti z výkresu (PDF: `pdftotext -layout`, tabulky; DXF: ezdxf – texty kót jsou v geometry bloku DIMENSION, tabulky v ACAD_TABLE). Nikdy nevymýšlej rozměry; co výkres neuvádí = `null` / ponechat šablonu.
2. Tabulka šablona vs. cíl (zasunuto, vysunuto, rozteč sloupů, šířka, výška, patky) → zapiš do katalogu (`src/trw/outriggerCatalog.json`, jeřáby `craneCatalog.json`).
3. Změř GLB (trimesh, jednotky m). Díly delší než ~1 m (housing, výsuvná ramena) roztahuj po vrcholech jen v řezové zóně uprostřed (bez hustých úchytů); krátké díly (patky, válce, úchyty) posuň tuze podle středu. Žádné uniformní škálování.
4. Průřez měň jen podle kót výkresu: šířka (faktor v Z pro všechny díly), výška nosníku (faktor v Y jen pro nosník a díly na něm, koncové sestavy beze změny), rozteč noh (tuhý posun koncových sestav v Z; vycházej z rozteče změřené v modelu, ne z výkresu šablony).
5. Ověř bbox proti kótám (tolerance ±1 mm) a vypiš odchylky (co výkres má, ale model nedrží) do `modelDeviations`.
6. Komprese: `npx @gltf-transform/cli optimize --compress draco --texture-compress false --simplify false`.
7. Výkresy (PDF/DXF) do repa nedávat – jen GLB + katalog. Skript: `scripts/outrigger/mk_variant.py` (parametry DL, X0/X1, KZ).

## Pohyblivé skupiny podpěr (výsuv do boku a dolů)
- GLB rozděl na uzly `housing` / `armL` / `armR` / `legL` / `legR` (`scripts/outrigger/mk_variant.py`): ramena = vnitřní nosníky + koncová sestava (sloup, válec, hadice; díly nad nosníkem y > 0,22 m patří ke konci), nohy = vnitřní trubka + patka.
- Reference výkresu: 2266 / 2326 = rozteč os patek zasunuto (sedí na model ±0,4 mm), 5041 / 5980 = vysunuto. Zdvih ramene = (vysunuto − zasunuto) / 2.
- Zdvih nohy = B − A z tabulky (450; Extra short 350), pod pomocným rámem F − E (450).
- Teleskopy přidávej jen pokud je výkres kreslí. 556-2067 má jedno rameno na stranu, v housingu zbývá jen 252 mm překrytí, to je k ověření.
- V app: trw reach (osa patky od osy vozu) → výsuv = reach − rozteč/2, noha dolů až k zemi (max zdvih, jinak „nedosáhne“). Ovládání: TelescopeArrows z CraneGizmos, animace přes exp. dorovnání v useFrame.
