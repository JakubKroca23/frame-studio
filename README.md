# Podvozek

Prohlížečová aplikace, která z 2D výkresu podvozku (DXF) a z parametrů složí interaktivní 3D model rámu, náprav, kol, kabiny a hlavních komponent. První profil je **Scania ICD** (Individual Chassis Drawing). Zpracování běží v prohlížeči; rozhraní `analyzeDxf` je připravené na pozdější přesun do serverové funkce.

## Spuštění

```bash
npm install
npm run dev
```

Vývojový server poslouchá na portu **47231**. Vzorový výkres Scania G 360E B6x2*4NB je v `public/samples/scania-icd-sample.dxf` a v aplikaci ho otevře tlačítko **Vzor Scania ICD**.

```bash
npm test          # extrakce vzorového DXF a syntetické případy parseru
npm run build     # kontrola typů a produkční build
```

DXF se čte jako Windows-1252.

## Co umí první verze

- Rozpoznání profilu Scania ICD podle textu a vrstev `201`–`218`.
- Zploštění bloků (INSERT na vrstvě 0, geometrie na sémantických vrstvách). Vodoznak `PREL` se zahazuje.
- Spárování rozměrových kót (popisek a hodnota jsou v DXF zvlášť).
- Podélníky jako C profil tažený po půdorysné trase včetně rozšíření vepředu, s otvory ve stojině.
- Tři nápravy a kola z pozic a rozchodů ve výkresu, průměr pneumatik z výkresu nebo ze zadaného rozměru.
- Kabina a díly jako přibližné siluety z bokorysu a půdorysu.
- Živá změna tlouštěk, poloměru, zatížení, pneumatik, detailu a viditelnosti skupin.
- Náhled 2D detekce a export GLB a STL (milimetry, Y nahoru).

## Odchylky od návrhu

- Parser je TypeScript v prohlížeči, ne Python/ezdxf.
- Otvory se vyřezávají triangulací stojiny (earcut), ne booleovskými operacemi.
- Úroveň detailu „siluety“ je loft elips z rozsahů bokorysu a půdorysu, ne plné CSG.
- Průvodce pro neznámý výkres zatím není. Když profil nevyjde, použije se Scania s varováním.
- Mezera pro párování kót je 900 mm (ve vzoru leží hodnota H036 asi 465 mm od popisku).
- OBJ export není. STL používá stejné souřadnice jako prohlížeč (Y nahoru), ne Z nahoru z CAD.

## Omezení

Tvary kabiny a komponent jsou přibližné. Výkres nemá čelní pohled, takže průřez je z obdélníku nebo elipsy. Tloušťka stojiny, pásnice a poloměr ohybu ve výkresu nejsou — zadávají se ručně. Nezatížený stav jen nakloní rám vůči kolům. Příčky jsou kvádry. Levý a pravý podélník odpovídají vrstvám 211 a 212.
