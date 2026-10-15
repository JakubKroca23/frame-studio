# Crane template flow — rules and lessons

Every crane is a sample model (template 142 or 408) adapted to dimensions read from HIAB drawings. Each lesson below
is enforced in code (`rules.ts`, ids in comments). Check every new crane against all lessons; add a lesson when a
crane needs something new. Never invent a dimension: a value is from the drawing (table or dimension), derived from
drawing values, or kept from the template — and the report says which.

## Rules

- **R1 — telescopes are real.** A variant with N extensions shows exactly N extension parts. Extra template parts are
  removed, missing ones are copies of the innermost one. Each part's stroke = (hydraulic max − retracted reach) / N from
  that variant's 1-3 OUTREACH row (the drawing gives no per-section split); its length = own stroke + the template's
  overlap for that section (≥ 0.15 m). Never hide parts, never keep all template parts with short strokes, never spread
  the stroke over extra parts. Exception: the sample model's own measured variant (408 E-8, 8 measured strokes).
  Code: `extFraction`, `adaptGroups` (`realExtensions`, `minOverlap`).

## Lessons

- **L0 — template choice.** 142 for the medium class, 408 for ≥ 22 t·m (225L, 228, 232, 235L, 262, 302, 638, iQ.708,
  iQ.958/1188). Adapt a part only when the drawing differs by > 2 %.
- **L1 — scale.** Never assume 1:1. Generic dims-vs-geometry scale, confirmed by labelled dims ("3-5a" …) matching their
  table values. Detail views can sit at other scales (DL sheets gave 1:21.89 from leg details) → unconfirmed scale =
  no geometric adaptation, tables still usable (they are scale-free).
- **L2 — hook offset (142: −113 mm, 408: −8 mm).** Catalogue outreach is measured to the hook; the template's own
  kinematic tip is not. The reference reach of a derived crane is the template's kinematic reach of its own variant,
  so a derived variant reaches exactly its drawing 1-3 MAX. (`hookOffsetFromKinematics`)
- **L3 — what kóta 1-1 measures.** On the 142 sheet 1-1 is the top of the column/main boom at the slewing axis in the
  straight drawing pose (sample 2569 mm vs. drawing 2598 mm). There is no 408 drawing, and the 408-class drawings give
  2586–2634 mm against 2911 mm on the 408 mesh — the reference point cannot be calibrated, so a 408-based crane keeps
  the template column and the 1-1 difference is only reported. (`heightFrom11`)
- **L4 — iQ / X-HiPro sheets ("GEN. DIM."/dimension drawings) have no labels and no tables.** One variant per sheet
  (E-n in the title / file name). Outreach = horizontal DIMENSION with text "Min. A / Max. B" (the one with the largest
  Max; suffix "(v8)" = main boom, "(v8+v6)" = with jib). No 1-1, no 3-5 → template height and base, no manual
  extension (+MAN = hydraulic). Scale counts as confirmed when ≥ 10 dims agree (values are code-42 lengths).
- **L5 — several 1-1 dims / sheets.** Ignore "1-1 REEL", "BOOM COVER"; take the lowest 1-1 of a sheet; sheets of one
  crane must agree within 3 % (228/232 E-ES 1-3 vs 3-6: 2607 vs 2086 → template).
- **L6 — shared drawings.** Identical files (262 E = 302 E, md5) and shared drawing numbers (142/162 family 0807/0808,
  CLX ↔ iX) are aliases of one crane, not new data.
- **L7 — JIB.** No jib template exists. A jib needs its own boom + telescope + joint; building it from the 408's
  smallest telescopes would be pure geometry invention (jib length, pivot, angles are not on the sheets except the
  total reach). JIB sheets are imported as the main-boom variant (reach "(v8)"); the jib reach "(v8+v6)" is stored
  and shown, the jib itself is not modelled → flagged.
- **L8 — not derivable from 142/408.** Z-folding (Z-HiPro) and sheets without a reach table (S-HiPro 230W "W") are
  skipped. CL (forestry-line) sheets carry normal B/BS reach tables matching iX.188/228 → derived like B/BS, flagged.
- **L9 — Jonsered iZ.18R HD: one-mesh GLB split by drawing (465-1037).** The supplier GLB is a single mesh (91 606
  surface components). Segmentation = connectivity components + cutting planes, never silhouette intersection.
  Pins were found by rigid matching of drawing views (MAX OUTREACH vs CLOSE IN) and concentric ring signatures
  (P1 52/75/90, P2 52/95/100), not by naive ring detection. The boom plane in the GLB is slewed 4.5° → rotate the
  GLB first so the pin axes are parallel to one axis. Extensions are split by nested profile half-width (±116/±78/±64)
  and by axial end. Result: groups base/stabL/stabR/legL/legR/column/main/outer/ext1/ext2. Reach check: MIN 5 995
  vs 5 933, MAX 10 025 vs 9 963 (+62 mm, from P1 −243 in mesh vs −296 in drawing). Flagged assumptions: ext2 inner
  tube, slew ±207.5°, outrigger beam telescopes (beam ~0.9 m vs 1.1125 m needed), the
  slew axis 335 mm off the outrigger centre (asymmetric spread), loads (no table → null).

## Rules for splitting a one-mesh model
1. Weld + simplify + draco with gltf-transform; never `optimize` (it joins the group nodes).
2. Find the pins from the drawing first (dimension texts in DIMENSION blocks, tables in ACAD_TABLE, model space in mm), then register the GLB to the drawing view.
3. Classify each connected component by its centroid against planes and segments that come from the drawing. Each rule is in the build script with its source.
4. Every value that no drawing dimension backs is marked ASSUMED in craneKinematics.ts and in the report.
5. Check min/max reach and outrigger spread in a test against the drawing tables (tolerance ≤ 70 mm).
6. Do not commit company drawings or .trw files, only the resulting GLB.
- **L10 — outrigger spread vs. slewing-axis offset (Jonsered iZ.18R "column R").** The spread from the table / TrailerWIN
  (6-11 = 4457) is foot-to-foot and symmetric about the outrigger box, not about the slewing axis. The 335 mm
  offset of the axis is real (column R option: the column ring fit sits right of the box centre), not a measuring
  error. Splitting the spread about the axis needed 777/1447 mm per side (unreachable). About the box centre it is
  1112.5 mm on both sides = ONE telescope per side (confirmed by Jakub). Rule: always split the spread about the
  outrigger box, and keep `telescopes` in the def.
- **L11 — part split must be checked automatically, not by eye (Jonsered fix).** In the parked pose the outer boom
  box lay in the "column" band and the outer heel plates (with the P2 bore) in the "main" band → after unfolding the
  boom tube stayed next to the column and plates hung in the air. Two checks now run on every build
  (`scripts/crane/jonsered/build2.py`, `samples.py`) and in vitest (`src/trw/jonseredParts.test.ts`):
  (1) contact islands: surface samples every 6 mm hashed into 10 mm cells → contact graph; every group must be one
  contact cluster, except a documented list of islands; (2) posed contact: joint-region samples of every child/parent
  pair are posed with the app transforms (rozloženo, a1 max/min, outer −90°) and must stay within 35 mm.
  Contact alone does NOT catch a wrong pivot (a 63 mm P1 error still passed) → (3) the def pins must equal the
  concentric pin-bore ring fits of the GLB (≤ 3 mm).
- **L12 — find pins from pin bores, not from silhouettes.** Concentric ring components (algebraic circle fit, residual
  < 2 mm) at the same centre across the full boom width are the pin. P1 = 12 rings r 40–42 mm → exactly 296 mm
  behind the column spline-shaft axis = kóta 1-7 296. The earlier P1 (rigid view matching) was 73 mm off; the
  slewing axis is the column shaft ring fit (±0.1 mm), not the base housing (housing fit is 10–20 mm off-centre).
  Mounting plane = P1 − kóta 1-4. With the correct P1 the reach matches the table without fudging (5911 / 9940
  vs 5933 / 9963).
- **L13 — hydraulic cylinders as two bodies.** Barrel = parts inside the A–B envelope (r ≤ 135 mm), pivots on A
  (column) and aims at B; rod = parts near B, pivots on B (on the main boom). Both turn by the same β (barrel axis
  stays A–B). The rod tube is hidden in the barrel in the CAD → synthetic rod (ASSUMED Ø) long enough to stay in the
  barrel at max stroke (test). Link systems (Jonsered outer cylinder + knuckle links) are not articulated → ride on
  the main boom, flagged.
- **L14 — limits without a working diagram.** 465-1037 has only MAX OUTREACH / CLOSE IN / PARKED views, no angle
  limits. Typical knuckle-crane values are used and flagged ASSUMED; the outer boom goes to −90° relative so the tip
  can go below the knuckle pin. No paint colour in the CAD (materials grey + one teal) → no brand red, grey-black as
  the other models.
