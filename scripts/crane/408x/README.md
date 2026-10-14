# HIAB X-HiPro 408 E-8 — extended GLB (reference / template calibration)

Source: user's SolidWorks export `408e8_asm-20_extrared_asm` (16.3 MB, Draco, 3541 nodes, 2750 parts in
`408E8_ASM_1__ASM_2.stp-1`). Same assembly frame as the folded GLB (`scripts/crane/408`): slewing axis GLB
x −0.485 / z −0.107, mounting plane y 0.419 (up = −y). Booms straight along +x, **all 8 telescopes out**, stabiliser
legs lowered (lowest point 0.80 m below the mounting plane).

Measured (r from the slewing axis, h above the mounting plane):

| item | value |
|---|---|
| main pivot P1 (pin part 75) | r −0.310, h 2.384 (= folded GLB) |
| knuckle P2 (pin part 298) | r 2.091, h 2.385 → main boom 2.401 m (folded GLB 2.400) |
| outer boom profile | r 1.720 … 4.082 (2.362 m) |
| top at the slewing axis (±0.2 m) | 2.911 m |
| stabilisers retracted, lateral span | 2.533 m |
| innermost profile end (ext8) | r 20.930 → datasheet hydraulic outreach 20.9 m ✔ |

Telescopes (profile width / length / outer end r, extended) and stroke = extended overlap − retracted overlap
(retracted from the folded GLB):

| sec | width | length | end r | ext. step | retr. step | stroke |
|---|---|---|---|---|---|---|
| ext1 | 0.270 | 2.353 | 5.855 | 1.773 | 0.268 | 1.505 |
| ext2 | 0.246 | 2.373 | 7.717 | 1.862 | 0.038 | 1.824 |
| ext3 | 0.222 | 2.398 | 9.580 | 1.863 | 0.038 | 1.825 |
| ext4 | 0.201 | 2.483 | 11.674 | 2.094 | 0.095 | 1.999 |
| ext5 | 0.179 | 2.562 | 13.864 | 2.190 | 0.090* | 2.100 |
| ext6 | 0.158 | 2.642 | 16.154 | 2.290 | 0.090* | 2.200 |
| ext7 | 0.137 | 2.717 | 18.544 | 2.390 | 0.090 | 2.300 |
| ext8 | 0.115 | 2.764 | 20.930 | 2.386 | 0.090* | 2.296 |

\* the folded GLB had only 6 real profiles; ext5 and ext8 there are approved clones (ext4/ext7 scaled), their
retracted overlap is the 90 mm used for the clones — ASSUMED. Sum of strokes 16.05 m vs. 15.93 m from the datasheet
(20.9 m − measured retracted reach 4.967 m): 0.7 %.

The extended GLB confirms the clone sizes (ext5 real 179 mm vs. clone 166 mm·k, ext8 115 vs. 101·k — same −12 mm
offset as all real profiles between the two measurements) but the real ext5 is 2.562 m long (clone 2.483) and ext8
2.764 m (clone 2.717). `extStrokes` in `src/trw/craneKinematics.ts` uses the table above. The GLB itself is not
committed (16 MB); the articulated mesh still uses the folded-GLB parts.
