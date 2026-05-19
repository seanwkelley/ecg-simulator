# ECG Simulator — Comprehensive Rhythm Guide

Interactive ECG rhythm simulator that renders 39 clinically important rhythms in real time, with a 12-lead view, lead-specific morphology overrides (including per-lead ST shifts for STEMI territory mapping), ACLS shockable/non-shockable classification, and inline clinical reference content.

Built as a single React component, zero runtime dependencies beyond React. Educational use only — **not** a medical device.

## Features

- **39 rhythms** across 9 categories:
  - **Normal / Brady / Tachy** — NSR, sinus brady, sinus tachy, junctional escape, SVT (AVNRT).
  - **Arrhythmia** — AFib, AFlutter, PE (S1Q3T3), unifocal/multifocal PVCs, WPW pre-excitation, AIVR.
  - **Conduction** — 1°/2° Type I (Wenckebach) / 2° Type II (Mobitz) / 3° AV block, LBBB, RBBB, Long QT, Brugada Type 1.
  - **Ischemia / OMI** — Anterior, inferior, lateral, posterior, and RV STEMI; Wellens (Type A biphasic); De Winter T waves; acute pericarditis.
  - **Metabolic** — hyperkalaemia (peaked-T early stage), hypokalaemia (U waves), hypothermia (Osborn / J waves), digoxin effect (scooped ST).
  - **Paced** — RV-paced (LBBB-like + spike), dual-chamber DDD.
  - **Emergency** — VTach, VFib, asystole, Torsades, complete heart block, hyperkalaemia sine-wave (pre-arrest).
- **12-lead view** with per-lead morphology modifiers (P amplitude, R amplitude, S depth, T polarity, **ST shift**, **PR depression**, U/J/delta waves, pacing spikes).
- **STEMI territory mapping** — every STEMI variant places ST elevation in the anatomically-correct leads with reciprocal ST depression in the opposing territory.
- **Lead selector** in single-lead mode — switch between I, II, III, aVR, aVL, aVF, V1–V6.
- **Rhythm-specific lead overrides** — LBBB (deep S V1, notched R V5–V6), RBBB (rsR' V1), PE S1Q3T3, Long QT, all 5 STEMI patterns, Wellens, De Winter, pericarditis, Brugada, hypothermia, hypokalaemia, dig effect, WPW.
- **1 mV / 200 ms calibration mark** rendered on every trace (10 mm/mV, 25 mm/s — LITFL-standard).
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
- `RHYTHM_LEAD_OVERRIDES` — sparse per-rhythm overrides that replace selected `LEAD_MODS` entries; now also encodes per-lead `stShift`, `stShape`, `prDepress`, `uWave`, `jWave`, `deltaWave`, `biphasicT`, and `peakedT` for ischemia/electrolyte/channelopathy rhythms.
- `RHYTHMS` — 39-entry rhythm catalog: BPM, category, color, description, key features, clinical note, reference, and `shockable: true | false | null`.
- `normalBeat(phase, opts)` — synthesizes one PQRST cycle from a normalized beat phase. Polarity is internal (so ST shifts in aVR aren't accidentally axis-flipped). Supports PR delay, QRS width, R/P/T amplitude, deep S, big Q, notched QRS, inverted T, broad/bifid T (Long QT), **ST shift with `flat | concave | convex | scoop | coved | upslope` shapes**, PR depression, U wave, Osborn J wave, WPW delta wave, atrial/ventricular pacing spikes, biphasic T (Wellens), and sine-wave QRS (severe hyperK).
- `generateECGPoint(t, rhythm, beatPhase, leadMod)` — per-rhythm waveform dispatcher. The 4th `leadMod` parameter is the resolved lead modifier (base × rhythm override). Ischemia rhythms delegate straight to `leadNormal` and let the per-lead ST overrides do the work.
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

- 12-lead morphology is a **scalar-multiplier approximation** of the Lead II waveform with explicit per-lead ST overlays — not a true 3D cardiac dipole projected onto each lead axis. The biggest remaining upgrade would be a vector-based model (Einthoven + Frank leads) so ST shifts in unspecified leads emerge automatically from the angle of injury.
- In 12-lead mode the grid runs 12 concurrent `requestAnimationFrame` loops. Fine on desktop, may struggle on low-end mobile — a single shared animation loop driving all 12 canvases would be the fix.
- Long QT's bifid T wave uses a `sin(t·π) + 0.3·sin(t·2π)` approximation — recognizable but not morphologically precise for LQT1/LQT2/LQT3 subtypes.
- Posterior STEMI is rendered as its mirror in V1–V3; the simulator does not include true posterior leads (V7–V9).
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
