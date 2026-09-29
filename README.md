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

Nahrát lze `.dxf`, `.dwg`, `.dxf.gz`, `.tgz` / `.tar.gz` a `.zip`. Archiv se rozbalí v prohlížeči (fflate). Texty se čtou jako Windows-1252.

DWG čte v prohlížeči knihovna [LibreDWG](https://www.gnu.org/software/libredwg/) (`@mlightcad/libredwg-web`, licence GPL-3.0) přes WebAssembly. Podporované čtení je AutoCAD 2000 až 2018 (hlavičky AC1015, AC1018, AC1021, AC1024, AC1027, AC1032). Starší soubor, třeba R12 (AC1009), skončí českou hláškou a model se nesloží. DWG se uvnitř převede na DXF a dál jde stejnou detekcí jako nahraný DXF. Po `npm install` se na čtečku aplikuje malá oprava řetězu entit bloku (`scripts/patch-libredwg.mjs`), protože některé soubory mají řetěz entit delší než vlastní blok.

Po načtení výkresu je krok **Kontrola detekce**. V bokorysu a půdorysu jsou popsané podélníky, profil C, otvory, výztuha, příčky, nápravy, kola (průměr, jedno/dvojmontáž, rozchod), blatníky, obrys kabiny a výbava kolem rámu (nádrž, AdBlue, vzduchojem, akumulátor, výfuk, schránka, schůdky, bočnice a další) s délkou, výškou a staničením. Prvek lze vybrat, opravit číslem, změnit mu typ, smazat ho, nebo doplnit tažením oblasti či výběrem entit. Nízká jistota je oranžově. 3D se generuje až po potvrzení a používá tyto opravy. Zůstanou v projektu, i když se vrátíte z 3D zpět ke kontrole.

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
- Živá změna tlouštěk, poloměru, zatížení, pneumatik, odpružení (listy, vzduch, smíšené), detailu a viditelnosti skupin. Odpružení a hnací ústrojí jsou ve výchozím stavu skryté.
- Podvozek má tvar skutečného rámu: tmavý C profil, příčky s výztuhami a šrouby, výztuha, ocelová kola s plnou pneumatikou a blatníky. Poloha rámu, otvorů a náprav zůstává z výkresu. Nádrže, akumulátor, vzduchojemy, výfuk, schránky a boční kryty se kreslí ve velikosti a poloze dílu z výkresu; chybí-li díl, použije se typická poloha vedle rámu.
- Panel detekce s kótami a kontrolou proti geometrii. Hodnoty z kót, textů, názvů bloků a uzavřených obrysů jsou označené jako naměřené. Tvar, který z výkresu neplyne (typická nádrž, odhad dvojmontáže Scania), je odhad a v kontrole má nižší jistotu.
- Náhled 2D detekce (bok, půdorys, u Volva i čelo) a export GLB a STL (milimetry, Y nahoru).

## Odchylky od návrhu

- Parser je TypeScript v prohlížeči, ne Python/ezdxf.
- Otvory se vyřezávají triangulací stojiny (earcut), ne booleovskými operacemi.
- Úroveň detailu „siluety“ je loft elips z rozsahů bokorysu a půdorysu, ne plné CSG.
- Průvodce pro neznámý výkres zatím není.
- Mezera pro párování kót Scania je 900 mm (hodnota H036 leží asi 465 mm od popisku). Volvo má kóty `CODE=hodnota` v jednom textu.
- OBJ export není. STL používá stejné souřadnice jako prohlížeč (Y nahoru), ne Z nahoru z CAD.
- `$INSUNITS=0` se bere jako milimetry a kontroluje se proti rozteči náprav.

## DWG

Testovací DWG vznikl z výřezu vzoru Scania převodem `dxf2dwg` (LibreDWG 0.13.3) do AutoCAD 2000. Stejný výkres v DXF i DWG dá stejné nápravy, výšku rámu a stejné díly. Zápis novějších verzí (2004–2018) umí `dxf2dwg` jen částečně, proto jsou zkušební soubory R2000; čtení AC1015–AC1032 zkouší prohlížeč a při poškozeném souboru hlásí verzi česky. Svislý text kóty (skupina 50 a zarovnání FIT) LibreDWG 0.13.3 ve výchozím stavu do DWG nezapsal; pro testovací soubor je převodník opravený, aby rotace zůstala. Starý `POLYLINE`+`VERTEX` kodér zapíše jen první lomenou čáru bloku, proto jsou v testovacím DWG tyto čáry rozložené na úsečky a oblouky. Plný 20 MB vzor Scania se na DWG nepřevádí — kodér na něm nedoběhne. Řetěz entit v DWG občas přesáhne konec bloku; čtečka v aplikaci si ponechá jen entity, jejichž vlastník je daný blok.

## Omezení

Kabina, nádrže a blatníky jsou typizované tvary usazené na rozměry z výkresu, ne naskenovaná geometrie každého dílu. Objemné díly vedle rámu drží délku a výšku z výkresu; když je půdorys širší než nádrž, těleso se posune těsně vedle podélníku, aby rám zůstal čitelný. Drobné díly z DXF jsou oříznuté na 64 největších. Detaily mimo hlavní pohledy (řez zadního PTO u Volva) se do rámu nemíchají — slouží jen ke čtení průřezu. Nezatížený stav jen nadzvedne rám vůči kolům, a jen když výkres má kóty H035/H036. Vnitřní výztuha je deska ve zjištěném rozsahu X, ne přesný tvar vložky. Točnice se nekreslí: vzorové podvozky jsou solo, ne tahač. Listová pera, měchy a hnací ústrojí v modelu jsou, ve výchozím pohledu jsou vypnuté.
