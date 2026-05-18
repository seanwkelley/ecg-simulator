# ECG Simulator Guide — Claude Code Handover (v3)

## What Changed in v3

1. **Long QT Syndrome added** (20 rhythms total) — broad/bifid T wave morphology, prolonged QT interval, clinical content on congenital vs acquired LQTS
2. **12-Lead View** — toggle between single-lead and a 4×3 grid showing all 12 leads simultaneously. Each lead has its own morphology modifiers (P amplitude, R amplitude, S depth, T polarity). Rhythm-specific overrides for LBBB (deep S in V1, notched R in V5-V6), RBBB (rsR' in V1, wide S in I/V6), PE S1Q3T3 (deep S in I, Q+inverted T in III, RV strain in V1-V3), and Long QT (broad T in V2-V4).
3. **Shockable / Non-Shockable classification** — each rhythm has a `shockable` field (`true`, `false`, or `null` for non-arrest rhythms). Visual badge in the vitals strip and sidebar. ACLS classification panel in clinical info tab with treatment guidance.
4. **Lead selector in single-lead mode** — row of buttons to switch between any of the 12 leads (I, II, III, aVR, aVL, aVF, V1-V6)

## Architecture Changes

### New data structures

```
LEAD_MODS object (12 entries, one per lead)
  └─ { pAmp, rAmp, sD, tAmp, tInv, axis }

RHYTHM_LEAD_OVERRIDES object (per-rhythm lead overrides)
  └─ lbbb: { V1: {...}, V5: {...}, ... }
  └─ rbbb: { V1: {...}, I: {...}, ... }
  └─ pe_s1q3t3: { I: {...}, III: {...}, V1-V3: {...} }
  └─ long_qt: { V2-V4: { tAmp: elevated } }

RHYTHMS[key].shockable: true | false | null
```

### Generator signature change
```
generateECGPoint(t, rhythm, beatPhase, leadMod)
                                        ^^^^^^^ NEW
```
The 4th parameter `leadMod` is a lead modifier object. The `normalBeat` helper now accepts `longQT: true` for broad bifid T waves.

### New components
- `MiniECGCanvas` — lightweight canvas for the 12-lead grid (no glow effects, thinner trace, smaller grid)
- `ShockBadge` — renders ⚡ SHOCKABLE or ✕ NON-SHOCKABLE badge
- Lead selector row (buttons for all 12 leads in single-lead mode)

### State additions
```
viewMode     — "single" | "twelve"
selectedLead — string (default "II")
```

## Rhythms (20 total)

| # | Key | Name | BPM | Category | Shockable |
|---|-----|------|-----|----------|-----------|
| 1 | normal_sinus | Normal Sinus Rhythm | 72 | Normal | — |
| 2 | sinus_bradycardia | Sinus Bradycardia | 48 | Bradycardia | — |
| 3 | sinus_tachycardia | Sinus Tachycardia | 130 | Tachycardia | — |
| 4 | svt | SVT (AVNRT) | 180 | Tachycardia | — |
| 5 | atrial_fibrillation | Atrial Fibrillation | 95 | Arrhythmia | — |
| 6 | atrial_flutter | Atrial Flutter | 75 | Arrhythmia | — |
| 7 | first_degree_block | 1st Degree AV Block | 65 | Conduction | — |
| 8 | second_degree_type1 | Wenckebach | 60 | Conduction | — |
| 9 | second_degree_type2 | Mobitz II | 55 | Conduction | — |
| 10 | third_degree_block | Complete Heart Block | 38 | Emergency | Non-shockable |
| 11 | ventricular_tachycardia | VTach | 165 | Emergency | **Shockable** |
| 12 | ventricular_fibrillation | VFib | 0 | Emergency | **Shockable** |
| 13 | asystole | Asystole | 0 | Emergency | Non-shockable |
| 14 | torsades | Torsades de Pointes | 200 | Emergency | **Shockable** |
| 15 | **long_qt** | **Long QT Syndrome** | 60 | Conduction | — |
| 16 | lbbb | LBBB | 72 | Conduction | — |
| 17 | rbbb | RBBB | 72 | Conduction | — |
| 18 | pe_s1q3t3 | PE (S1Q3T3) | 110 | Arrhythmia | — |
| 19 | unifocal_pvc | Unifocal PVCs | 72 | Arrhythmia | — |
| 20 | multifocal_pvc | Multifocal PVCs | 72 | Arrhythmia | — |

## 12-Lead Morphology Model

The 12-lead system uses a base modifier table (`LEAD_MODS`) that transforms the Lead II waveform for each lead:

- **Limb leads (I, II, III, aVR, aVL, aVF):** Vary P amplitude, R amplitude, and T polarity based on the Einthoven triangle / hexaxial reference system. aVR is inverted (axis: -1).
- **Precordial leads (V1-V6):** R wave progresses from small (V1) to dominant (V4) then slightly decreases. S wave is deep in V1-V2, diminishes across the precordium. T wave inverts in V1 (normal variant).
- **Rhythm-specific overrides** layer on top for LBBB, RBBB, PE, and Long QT to show the diagnostically important lead-specific changes.

This is a simplified model — real 12-lead morphology is determined by the 3D cardiac vector projected onto each lead axis. For Claude Code, upgrading to a vector-based model (Einthoven + Frank leads) would be the highest-impact improvement.

## Known Limitations (updated)

- 12-lead morphology is approximate — it multiplies Lead II by per-lead scalars rather than projecting a true cardiac dipole vector
- The MiniECGCanvas runs 12 concurrent `requestAnimationFrame` loops when in 12-lead mode — works fine on desktop but may impact performance on low-end mobile. Consider a single shared animation loop driving all 12 canvases.
- Long QT's bifid T wave uses a `sin(t*PI) + 0.3*sin(t*PI*2)` approximation — recognizable but not morphologically precise for LQT1 vs LQT2 vs LQT3 subtypes
- Shockable classification applies to arrest rhythms only. Non-arrest rhythms show null (no badge). PEA is not represented as a separate rhythm (it's a clinical diagnosis, not a waveform).

## File
```
/mnt/user-data/outputs/ecg-simulator-guide.jsx
```
~920 lines, single React component, zero dependencies beyond React.
