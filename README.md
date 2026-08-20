# ECG Simulator — Comprehensive Rhythm Guide

Interactive ECG rhythm simulator that renders 39 clinically important rhythms in real time, with a 12-lead view, lead-specific morphology overrides (including per-lead ST shifts for STEMI territory mapping), ACLS shockable/non-shockable classification, and inline clinical reference content.

Built as a single React component, zero runtime dependencies beyond React. Educational use only — **not** a medical device.

## Features

- **42 rhythms** across 9 categories:
  - **Normal / Brady / Tachy** — NSR, sinus brady, sinus tachy, junctional escape, SVT (AVNRT).
  - **Arrhythmia** — AFib, AFlutter, PE (S1Q3T3), unifocal/multifocal PVCs, WPW pre-excitation, AIVR.
  - **Conduction** — 1°/2° Type I (Wenckebach) / 2° Type II (Mobitz) / 3° AV block, LBBB, RBBB, Long QT, Brugada Type 1.
  - **Ischemia / OMI** — Anterior, inferior, lateral, posterior, and RV STEMI; Wellens (Type A biphasic); De Winter T waves; acute pericarditis.
  - **Metabolic** — hyperkalaemia (peaked-T early stage), hypokalaemia (U waves), hypothermia (Osborn / J waves), digoxin effect (scooped ST).
  - **Paced** — RV-paced (VVI, LBBB-like), atrial-paced (AAI, spike + *narrow* QRS), dual-chamber DDD, and biventricular CRT (LV lead via coronary sinus — dominant R in V1, q in I/aVL, narrower QRS than RV-only).
  - **Emergency** — VTach, VFib, asystole, PEA, Torsades, complete heart block, hyperkalaemia sine-wave (pre-arrest).
- **12-lead view** with per-lead morphology modifiers (P amplitude, R amplitude, S depth, T polarity, **ST shift**, **PR depression**, U/J/delta waves, pacing spikes).
- **STEMI territory mapping** — every STEMI variant places ST elevation in the anatomically-correct leads with reciprocal ST depression in the opposing territory.
- **Lead selector** in single-lead mode — switch between I, II, III, aVR, aVL, aVF, V1–V6.
- **Rhythm-specific lead overrides** — LBBB (deep S V1, notched R V5–V6), RBBB (rsR' V1), PE S1Q3T3, Long QT, all 5 STEMI patterns, Wellens, De Winter, pericarditis, Brugada, hypothermia, hypokalaemia, dig effect, WPW.
- **1 mV / 200 ms calibration mark** rendered on every trace (10 mm/mV, 25 mm/s — LITFL-standard).
- **ACLS classification** — visual ⚡ SHOCKABLE / ✕ NON-SHOCKABLE badges and treatment guidance for arrest rhythms.
- **Clinical info per rhythm** — description, key features, clinical pearl, and reference (Dubin, LITFL, Goldberger, AHA/ACC).
- **Waveform guide** — expandable cards for P, PR, QRS, ST, T, QT with durations and amplitudes.
- **Medically-modelled audio** — two modes with a shared, physiologically-derived beat clock:
  - **Monitor** — a 662 Hz QRS tone (the pitch a Philips IntelliVue emits at SpO2 100%) fired on each *detected* QRS, plus IEC 60601-1-8 alarm bursts (five pulses grouped 3 + 2 for red, three for yellow). Dropped beats are silent; VF, asystole and torsades produce **no tone at all** — only the alarm.
  - **Stethoscope** — S1 (M1 + T1), S2 (A2 + P2 with a respiration-driven split), S4, S3 and the pericardial friction rub. S1 intensity tracks the PR interval or preceding R-R, so AF, complete heart block and VT all get the variable S1 they have in life.
- **Real R-R intervals** — AF is irregularly irregular, Wenckebach's R-R shortens through the group before the pause, PVCs carry a full compensatory pause, and sinus rhythm has respiratory sinus arrhythmia. Timing drives both the trace and the sound.
- **Monitor-style pacing indicators** — a real pacing spike is 0.5–2 ms wide, narrower than one sample of the sweep, so it cannot be drawn from the waveform (it lands on 0 or 1 sample and flickers). Real monitors synthesise a marker instead, and so does this: the beat clock emits spike *times* and the canvas draws them, correctly placed for atrial vs ventricular leads.
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
- `generateECGPoint(t, rhythm, beatPhase, leadMod, beat)` — per-rhythm waveform dispatcher. `leadMod` is the resolved lead modifier (base × rhythm override); `beat` comes from the beat clock and carries the beat's index within the rhythm's repeating group and its PR delay. `beatPhase` may exceed 1 — the excess renders as flat diastole after a long R-R. Ischemia rhythms delegate straight to `leadNormal` and let the per-lead ST overrides do the work.
- `RHYTHM_AUDIO` — per-rhythm auscultation profile: repeating-group length, R-wave phase, alarm priority, S1/S2/S3/S4 gains, S2 split, and the clinician-facing "what it sounds like" note shown in the UI.
- `makeBeatClock(rhythm)` — emits beats with **real R-R intervals** and the auscultation parameters that go with them, plus a per-beat list of timed sound events. Seeded, so a rhythm sounds the same every time. This is the single timebase for both the waveform and the audio.
- `qs2Seconds(hr)` — Weissler's electromechanical systole, `QS2 ≈ 546 − 2.1 × HR` ms, held at a constant 57.8% of the cycle above 110 bpm (where the regression leaves its validated range). Sets S1→S2 spacing, and produces embryocardia at tachycardic rates for free.
- `createSoundEngine()` — Web Audio synth for the monitor tone, IEC alarm bursts, and the valve sounds.
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
- Heart sounds are synthesised (filtered noise + swept sine), not sampled recordings. They carry the right *timing, intensity and splitting* — which is what the rhythms differ in — but not the timbre of a real stethoscope.
- Alarm melodies follow the IEC 60601-1-8 pulse *structure* (count, grouping, fundamental range, harmonic content). The Annex F per-application melodies are not in any freely available source, so a single fundamental is used per priority rather than a manufacturer's exact cardiac melody.
- Murmurs are not modelled — only the heart sounds, gallops and the pericardial rub. Valvular disease is a separate axis from rhythm.
- Shockable classification applies to arrest rhythms only. PEA is included despite being a clinical diagnosis rather than a waveform, because the two audio modes can express it: the monitor tones normally and raises no alarm, while the stethoscope is silent. That gap is the teaching point, and it is the one arrest rhythm the screen cannot diagnose.

## Audio: sources for the medical model

| Behaviour | Source |
|---|---|
| S1→S2 spacing; embryocardia at speed | Weissler et al., *Circulation* 1968 — electromechanical systole QS2 ≈ 546 − 2.1 × HR ms |
| S1 intensity vs PR interval; bruit de canon | *The First Heart Sound in Complete Heart Block*, Circulation 1974;50:17 |
| Variable S1 in AF, CHB, VT, Mobitz I | Clinical Methods (NCBI Bookshelf), *The First Heart Sound* |
| Split S2: <30 ms expiration, 50–60 ms end-inspiration | Physiologic splitting, standard auscultation references |
| Wide split (RBBB) / reversed split (LBBB, RV pacing) | Merck Manual Professional; Healio *S2 Heart Sound* |
| S4 near-universal in acute MI | Clinical Methods, *The Fourth Heart Sound* |
| S1/S2 duration 70–150 / 60–120 ms; 20–150 / 50–250 Hz | Phonocardiogram normal values |
| Wenckebach R-R shortens through the group | LITFL, *AV Block 2nd Degree Mobitz I* |
| PVC full compensatory pause = 2 sinus cycles | LITFL, *Premature Ventricular Complex*; StatPearls |
| AF successive R-R differ by >20 ms; VT under it | García-Alberola et al., *Circulation* 1996;93:295 |
| RSA: P-P varies but stays under ~120 ms in health | StatPearls, *Sinus Arrhythmia* |
| QRS tone pitch 662 Hz at SpO2 100% | Philips IntelliVue — f = 662 / 2^((100 − SpO2)/24) |
| Alarm pulse structure, fundamental and harmonics | IEC 60601-1-8 |
| No continuous flatline tone in real monitors | Asystole alarms as a repeating burst, not a monotone |
| PEA: organised complexes, no pulse, no heart sounds | AHA/ACLS Asystole/PEA Algorithm |
| BiV/CRT: dominant R in V1 (~65%), q in I and aVL | Ammann et al., *Indian Heart J* 2017 |
| Pseudo-RBBB in 8–22% of ordinary RV pacing | *Innovations in CRM* 2014 — RBBB pattern during RV pacing |
| AAI pacing gives a narrow, natively-conducted QRS | Bernstein et al., *PACE* 2002 (NBG code) |

## References

- Dubin, *Rapid Interpretation of EKGs* (6th ed.)
- Goldberger, *Clinical Electrocardiography* (9th ed.)
- Burns / Life in the Fast Lane (LITFL)
- AHA / ACC / HRS guidelines and ACLS algorithms

## Disclaimer

Educational tool only. Waveforms are mathematical approximations for teaching pattern recognition — they are not patient data and must not be used for clinical decision-making.

## License

MIT — see [LICENSE](LICENSE).
