# Podvozek

Prohlížečová aplikace, která z 2D výkresu podvozku (DXF) a z parametrů složí interaktivní 3D model rámu, náprav, kol, kabiny a hlavních komponent. Profily výrobců jsou data a malé háčky; jádro je společné.

Hotové profily:

- **Scania ICD** (Individual Chassis Drawing) — pohledy podle vrstev `201`–`218`.
- **Volvo** (Order Information / BEP) — pohledy podle přípony bloku (`SV`, `FV`, `R`, kabina `B_CAB{S|T|F}C`), včetně čelního pohledu.

Zpracování běží v prohlížeči (Web Worker). Funkce `analyzeDxf` je čisté rozhraní a může se později přesunout na server.

## Spuštění

```bash
npm install
npm run dev
```

Vývojový server poslouchá na portu **47231**.

- **Vzor Scania** načte `public/samples/scania-icd-sample.dxf` (G 360E B6x2*4NB).
- **Vzor Volvo** načte `public/samples/volvo-vssb-25-277591.dxf.gz` (FM, 8x4, objednávka VSSB-25-277591). Surový DXF má asi 35 MB, v repozitáři je gzip (asi 5 MB).

Nahrát lze `.dxf`, `.dxf.gz`, `.tgz` / `.tar.gz` a `.zip`. Archiv se rozbalí v prohlížeči (fflate). Texty se čtou jako Windows-1252.

```bash
npm test          # Scania, Volvo a syntetické případy parseru
npm run build     # kontrola typů a produkční build
```

## Co model umí

- Automatická detekce profilu Scania vs Volvo. Když nic nesedí, použije se Scania s varováním.
- Zploštění bloků. Vrstva 0 dědí vrstvu INSERT. Měřítko a natočení INSERT se promítne do oblouků i kružnic. `LWPOLYLINE` včetně bulge. Vypnuté vrstvy (záporná barva) se čtou — u Volva jsou na nich otvory.
- Skupiny otvorů Volvo v rámečku 1:10 u počátku se posunou podle insertu `B_CABSC0_`.
- Podélníky jako C profil tažený po půdorysné trase, včetně rozšíření nebo zúžení vepředu. U Volva se tloušťka a poloměry vezmou z řezu ve výkresu (300×90×8, R13/R5), ne z výchozích hodnot.
- Nápravy a kola z výkresu. Scania má tři nápravy, Volvo čtyři; zadní nápravy Volva jsou dvojmontáž. Průměr pneu z oblouků, z textu (`385/65R22.5`, `315/80R22.5`) nebo ze zadaného rozměru.
- Kabina a díly jako přibližné siluety. Čelní pohled, pokud ve výkresu je, může zúžit šířku. Scania čelní pohled nemá.
- Živá změna tlouštěk, poloměru, zatížení, pneumatik, detailu a viditelnosti skupin.
- Panel detekce s kótami a kontrolou proti geometrii.
- Náhled 2D detekce (bok, půdorys, u Volva i čelo) a export GLB a STL (milimetry, Y nahoru).

## Odchylky od návrhu

- Parser je TypeScript v prohlížeči, ne Python/ezdxf.
- Otvory se vyřezávají triangulací stojiny (earcut), ne booleovskými operacemi.
- Úroveň detailu „siluety“ je loft elips z rozsahů bokorysu a půdorysu, ne plné CSG.
- Průvodce pro neznámý výkres zatím není.
- Mezera pro párování kót Scania je 900 mm (hodnota H036 leží asi 465 mm od popisku). Volvo má kóty `CODE=hodnota` v jednom textu.
- OBJ export není. STL používá stejné souřadnice jako prohlížeč (Y nahoru), ne Z nahoru z CAD.
- `$INSUNITS=0` se bere jako milimetry a kontroluje se proti rozteči náprav.

## Omezení

Tvary kabiny a komponent jsou přibližné. Komponenty jsou oříznuté na 64 největších. Detaily mimo hlavní pohledy (řez zadního PTO u Volva) se do rámu nemíchají, ale ani se z nich nestaví zvláštní těleso — slouží jen ke čtení průřezu. Příčky jsou kvádry. Nezatížený stav jen nadzvedne rám vůči kolům, a jen když výkres má kóty H035/H036. Vnitřní výztuha je deska ve zjištěném rozsahu X, ne přesný tvar vložky.
