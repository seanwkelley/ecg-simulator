# ECG Simulator — Comprehensive Rhythm Guide

Interactive ECG rhythm simulator that renders 20 clinically important rhythms in real time, with a 12-lead view, lead-specific morphology overrides, ACLS shockable/non-shockable classification, and inline clinical reference content.

Built as a single ~760-line React component, zero runtime dependencies beyond React. Educational use only — **not** a medical device.

## Features

- **20 rhythms** — Normal sinus, sinus brady/tachy, SVT (AVNRT), AFib, AFlutter, 1°/2° Type I/II/3° AV block, VTach, VFib, Asystole, Torsades, Long QT, LBBB, RBBB, PE (S1Q3T3), unifocal and multifocal PVCs.
- **12-lead view** — Toggle between single-lead and a 4×3 grid showing all 12 leads simultaneously. Per-lead morphology modifiers (P amplitude, R amplitude, S depth, T polarity).
- **Lead selector** in single-lead mode — switch between I, II, III, aVR, aVL, aVF, V1–V6.
- **Rhythm-specific lead overrides** for LBBB (deep S in V1, notched R in V5–V6), RBBB (rsR' in V1, wide S in I/V6), PE S1Q3T3 (deep S in I, Q + inverted T in III, RV strain in V1–V3), and Long QT (broad T in V2–V4).
- **ACLS classification** — visual ⚡ SHOCKABLE / ✕ NON-SHOCKABLE badges and treatment guidance for arrest rhythms.
- **Clinical info per rhythm** — description, key features, clinical pearl, and reference (Dubin, LITFL, Goldberger, AHA/ACC).
- **Waveform guide** — expandable cards for P, PR, QRS, ST, T, QT with durations and amplitudes.
- **Speed control**, play/pause, category filter, mobile-friendly layout.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

### Production build

```bash
npm run build
npm run preview
```

## Architecture

The whole UI lives in `src/ECGSimulatorGuide.jsx`. The pieces:

- `LEAD_MODS` — 12-entry table of per-lead scalars (P amp, R amp, S depth, T amp/inversion, axis) applied on top of the Lead II baseline waveform.
- `RHYTHM_LEAD_OVERRIDES` — sparse per-rhythm overrides that replace selected `LEAD_MODS` entries for rhythms with diagnostically important lead-specific changes (LBBB, RBBB, PE, Long QT).
- `RHYTHMS` — 20-entry rhythm catalog: BPM, category, color, description, key features, clinical note, reference, and `shockable: true | false | null`.
- `normalBeat(phase, opts)` — synthesizes one PQRST cycle from a normalized beat phase; supports PR delay, QRS width, R amplitude, P amplitude, T amplitude, deep S, big Q, notched QRS, inverted T, and broad/bifid T (Long QT).
- `generateECGPoint(t, rhythm, beatPhase, leadMod)` — per-rhythm waveform dispatcher. The 4th `leadMod` parameter is the resolved lead modifier (base × rhythm override).
- `ECGCanvas` — the main monitor with glow + fade trail.
- `MiniECGCanvas` — lightweight per-lead canvas for the 12-lead grid (no glow, thinner trace, smaller grid).

State:

```
rhythm        — current rhythm key
isRunning     — play/pause
speed         — 0.5× / 1× / 1.5× / 2×
viewMode      — "single" | "twelve"
selectedLead  — current single-lead choice (default "II")
category      — sidebar filter
tab           — "clinical" | "waves"
```

## Known limitations

- 12-lead morphology is a **scalar-multiplier approximation** of the Lead II waveform, not a true 3D cardiac dipole projected onto each lead axis. The biggest single upgrade would be a vector-based model (Einthoven + Frank leads).
- In 12-lead mode the grid runs 12 concurrent `requestAnimationFrame` loops. Fine on desktop, may struggle on low-end mobile — a single shared animation loop driving all 12 canvases would be the fix.
- Long QT's bifid T wave uses a `sin(t·π) + 0.3·sin(t·2π)` approximation — recognizable but not morphologically precise for LQT1/LQT2/LQT3 subtypes.
- Shockable classification applies to arrest rhythms only; PEA is a clinical diagnosis, not a waveform, so it's not represented as a separate rhythm.

## References

- Dubin, *Rapid Interpretation of EKGs* (6th ed.)
- Goldberger, *Clinical Electrocardiography* (9th ed.)
- Burns / Life in the Fast Lane (LITFL)
- AHA / ACC / HRS guidelines and ACLS algorithms

## Disclaimer

Educational tool only. Waveforms are mathematical approximations for teaching pattern recognition — they are not patient data and must not be used for clinical decision-making.

## License

MIT — see [LICENSE](LICENSE).
