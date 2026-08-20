import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   ECG SIMULATOR — COMPREHENSIVE RHYTHM GUIDE v3
   References: Dubin (6th ed.), LITFL, Goldberger (9th ed.), AHA/ACC
   ═══════════════════════════════════════════════════════════════ */

// 12-lead morphology modifiers per lead (relative to Lead II baseline)
// Each lead has: pAmp, rAmp, sDepth, tAmp, tInvert, axis (polarity flip)
const LEAD_MODS = {
  I:    { pAmp:0.8, rAmp:0.7, sD:0.1, tAmp:0.9, tInv:false, axis:1 },
  II:   { pAmp:1.0, rAmp:1.0, sD:0.17, tAmp:1.0, tInv:false, axis:1 },
  III:  { pAmp:0.3, rAmp:0.5, sD:0.2, tAmp:0.5, tInv:false, axis:1 },
  aVR:  { pAmp:0.7, rAmp:0.3, sD:0.5, tAmp:0.7, tInv:true, axis:-1 },
  aVL:  { pAmp:0.5, rAmp:0.6, sD:0.15, tAmp:0.6, tInv:false, axis:1 },
  aVF:  { pAmp:0.7, rAmp:0.7, sD:0.18, tAmp:0.7, tInv:false, axis:1 },
  V1:   { pAmp:0.6, rAmp:0.3, sD:0.6, tAmp:0.5, tInv:true, axis:1 },
  V2:   { pAmp:0.5, rAmp:0.5, sD:0.5, tAmp:0.8, tInv:false, axis:1 },
  V3:   { pAmp:0.4, rAmp:0.8, sD:0.3, tAmp:0.9, tInv:false, axis:1 },
  V4:   { pAmp:0.3, rAmp:1.1, sD:0.15, tAmp:1.0, tInv:false, axis:1 },
  V5:   { pAmp:0.3, rAmp:1.0, sD:0.1, tAmp:0.9, tInv:false, axis:1 },
  V6:   { pAmp:0.3, rAmp:0.85, sD:0.08, tAmp:0.8, tInv:false, axis:1 },
};
const LEAD_NAMES = ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"];

// Anatomical territory each lead "looks at" — drives the 12-lead grid colour coding,
// the lead-view diagrams, and the culprit-artery mapping.
//   zone     — myocardial wall the lead faces
//   angle    — frontal-plane axis in degrees (limb leads only; null for precordial)
//   artery   — usual culprit vessel when this territory infarcts
//   place    — electrode position (precordial) or derivation (limb)
const LEAD_TERRITORY = {
  I:   { zone:"Lateral",  color:"#f5a623", angle:0,    artery:"LCx", arteryAlt:"D1",  place:"LA (+) − RA (−)", pos:"LA", neg:"RA" },
  II:  { zone:"Inferior", color:"#f2712c", angle:60,   artery:"RCA", arteryAlt:"LCx", place:"LL (+) − RA (−)", pos:"LL", neg:"RA" },
  III: { zone:"Inferior", color:"#f2712c", angle:120,  artery:"RCA", arteryAlt:"LCx", place:"LL (+) − LA (−)", pos:"LL", neg:"LA" },
  aVR: { zone:"",         color:"#94a3b8", angle:-150, artery:"LMCA",arteryAlt:null,  place:"RA (+) vs. mean of LA & LL", pos:"RA", neg:null },
  aVL: { zone:"Lateral",  color:"#f5a623", angle:-30,  artery:"LCx", arteryAlt:"D1",  place:"LA (+) vs. mean of RA & LL", pos:"LA", neg:null },
  aVF: { zone:"Inferior", color:"#f2712c", angle:90,   artery:"RCA", arteryAlt:"LCx", place:"LL (+) vs. mean of RA & LA", pos:"LL", neg:null },
  V1:  { zone:"Septal",   color:"#8cc63e", angle:null, artery:"LAD", arteryAlt:null,  place:"4th ICS, right sternal border" },
  V2:  { zone:"Septal",   color:"#8cc63e", angle:null, artery:"LAD", arteryAlt:null,  place:"4th ICS, left sternal border" },
  V3:  { zone:"Anterior", color:"#0077b6", angle:null, artery:"LAD", arteryAlt:null,  place:"midway between V2 and V4" },
  V4:  { zone:"Anterior", color:"#0077b6", angle:null, artery:"LAD", arteryAlt:null,  place:"5th ICS, midclavicular line" },
  V5:  { zone:"Lateral",  color:"#f5a623", angle:null, artery:"LCx", arteryAlt:"D1",  place:"level with V4, anterior axillary line" },
  V6:  { zone:"Lateral",  color:"#f5a623", angle:null, artery:"LCx", arteryAlt:null,  place:"level with V5, midaxillary line" },
};

const ARTERIES = {
  LAD:  { name:"Left Anterior Descending", color:"#e11d48", supplies:"Anterior wall, anterior 2/3 of septum, apex" },
  LCx:  { name:"Left Circumflex",          color:"#a855f7", supplies:"Lateral and posterolateral LV wall" },
  RCA:  { name:"Right Coronary Artery",    color:"#0ea5e9", supplies:"Inferior wall, RV, SA/AV nodes (most people)" },
  D1:   { name:"First Diagonal (of LAD)",  color:"#f43f5e", supplies:"High lateral wall" },
  LMCA: { name:"Left Main",                color:"#dc2626", supplies:"LAD + LCx — aVR ST elevation suggests left main or triple-vessel disease" },
};

const ZONE_ORDER = ["Septal","Anterior","Lateral","Inferior"];
// Standard 12-lead print layout: 4 columns × 3 rows, read down each column.
const LEAD_GRID = [
  ["I","aVR","V1","V4"],
  ["II","aVL","V2","V5"],
  ["III","aVF","V3","V6"],
];

// Special 12-lead overrides per rhythm (which leads look different)
const RHYTHM_LEAD_OVERRIDES = {
  lbbb: {
    V1: { rAmp:0.15, sD:0.9, tAmp:0.7, tInv:false, axis:1 }, // Deep S in V1
    V2: { rAmp:0.2, sD:0.8, tAmp:0.6, tInv:false, axis:1 },
    V5: { rAmp:1.1, sD:0.05, tAmp:0.7, tInv:true, axis:1 },  // Tall notched R, inverted T
    V6: { rAmp:1.0, sD:0.05, tAmp:0.7, tInv:true, axis:1 },  // M-shaped R
    I:  { rAmp:0.9, sD:0.05, tAmp:0.6, tInv:true, axis:1 },
  },
  rbbb: {
    V1: { rAmp:0.9, sD:0.1, tAmp:0.6, tInv:true, axis:1 },   // rsR' pattern
    V2: { rAmp:0.7, sD:0.2, tAmp:0.5, tInv:true, axis:1 },
    V5: { rAmp:0.9, sD:0.35, tAmp:0.8, tInv:false, axis:1 },  // Wide S
    V6: { rAmp:0.85, sD:0.3, tAmp:0.8, tInv:false, axis:1 },
    I:  { rAmp:0.7, sD:0.3, tAmp:0.8, tInv:false, axis:1 },
  },
  pe_s1q3t3: {
    I:   { rAmp:0.5, sD:0.45, tAmp:0.8, tInv:false, axis:1 },  // Deep S in I
    III: { rAmp:0.3, sD:0.1, tAmp:0.6, tInv:true, axis:1 },    // Q + inverted T in III
    V1:  { rAmp:0.4, sD:0.3, tAmp:0.5, tInv:true, axis:1 },    // RV strain T inversions
    V2:  { rAmp:0.5, sD:0.3, tAmp:0.6, tInv:true, axis:1 },
    V3:  { rAmp:0.7, sD:0.2, tAmp:0.7, tInv:true, axis:1 },
  },
  long_qt: {
    V2: { tAmp:1.4, tInv:false },
    V3: { tAmp:1.5, tInv:false },
    V4: { tAmp:1.3, tInv:false },
  },

  // ── STEMI: anterior wall (LAD) — ST↑ V1-V4, reciprocal ST↓ inferior ──
  stemi_anterior: {
    V1: { stShift: 0.35, stShape: "convex", tAmp: 0.6 },
    V2: { stShift: 0.55, stShape: "convex", tAmp: 0.9, rAmp: 0.4 },
    V3: { stShift: 0.60, stShape: "convex", tAmp: 1.0, rAmp: 0.5 },
    V4: { stShift: 0.45, stShape: "convex", tAmp: 0.9 },
    II:  { stShift: -0.15 },
    III: { stShift: -0.20 },
    aVF: { stShift: -0.18 },
    aVR: { stShift: -0.10 },
  },
  // ── STEMI: inferior wall (RCA) — ST↑ II/III/aVF, reciprocal ST↓ I/aVL ──
  stemi_inferior: {
    II:  { stShift: 0.40, stShape: "convex", bigQ: true, tAmp: 0.9 },
    III: { stShift: 0.55, stShape: "convex", bigQ: true, tAmp: 1.0 },
    aVF: { stShift: 0.45, stShape: "convex", bigQ: true, tAmp: 0.9 },
    I:   { stShift: -0.25 },
    aVL: { stShift: -0.30 },
    V1:  { stShift: -0.10 },
    V2:  { stShift: -0.15 },
  },
  // ── STEMI: lateral (Cx/D1) — ST↑ I/aVL/V5/V6 ──
  stemi_lateral: {
    I:   { stShift: 0.30, stShape: "convex", tAmp: 0.9 },
    aVL: { stShift: 0.40, stShape: "convex", tAmp: 1.0, bigQ: true },
    V5:  { stShift: 0.30, stShape: "convex", tAmp: 0.9 },
    V6:  { stShift: 0.28, stShape: "convex", tAmp: 0.9 },
    II:  { stShift: -0.15 },
    III: { stShift: -0.25 },
    aVF: { stShift: -0.20 },
  },
  // ── STEMI: posterior — tall R + ST↓ + upright T in V1-V3 (mirror) ──
  stemi_posterior: {
    V1: { rAmp: 1.0, sD: 0.05, stShift: -0.35, stShape: "flat", tAmp: 0.9, tInv: false },
    V2: { rAmp: 1.2, sD: 0.05, stShift: -0.45, stShape: "flat", tAmp: 1.0, tInv: false },
    V3: { rAmp: 1.0, sD: 0.10, stShift: -0.30, stShape: "flat", tAmp: 0.9, tInv: false },
    II:  { stShift: 0.10, bigQ: true },  // often co-existing inferior
    III: { stShift: 0.15, bigQ: true },
    aVF: { stShift: 0.12, bigQ: true },
  },
  // ── STEMI: right ventricular (proximal RCA) — ST↑ V1 + inferior ──
  stemi_rv: {
    V1: { stShift: 0.35, stShape: "convex", tAmp: 0.7, rAmp: 0.4 },
    II:  { stShift: 0.35, stShape: "convex", bigQ: true, tAmp: 0.8 },
    III: { stShift: 0.50, stShape: "convex", bigQ: true, tAmp: 1.0 }, // III ↑ > II ↑
    aVF: { stShift: 0.40, stShape: "convex", bigQ: true, tAmp: 0.9 },
    I:   { stShift: -0.20 },
    aVL: { stShift: -0.25 },
  },
  // ── Wellens (LAD critical stenosis, pain-free) ──
  // Type A biphasic in V2-V3; type B deep symmetric inversion V1-V4
  wellens: {
    V2: { biphasicT: true, tAmp: 1.4 },
    V3: { biphasicT: true, tAmp: 1.4 },
    V1: { tInv: true, tAmp: 0.8 },
    V4: { tInv: true, tAmp: 0.7 },
  },
  // ── De Winter T waves (LAD occlusion equivalent) ──
  // Upsloping ST↓ at J-point with tall symmetric T in precordials
  dewinter: {
    V1: { stShift: -0.20, stShape: "upslope", peakedT: true, tAmp: 1.2 },
    V2: { stShift: -0.25, stShape: "upslope", peakedT: true, tAmp: 1.5 },
    V3: { stShift: -0.25, stShape: "upslope", peakedT: true, tAmp: 1.6 },
    V4: { stShift: -0.20, stShape: "upslope", peakedT: true, tAmp: 1.4 },
    V5: { stShift: -0.15, stShape: "upslope", peakedT: true, tAmp: 1.1 },
  },
  // ── Pericarditis — diffuse concave ST↑ + PR depression ──
  pericarditis: {
    I:   { stShift: 0.18, stShape: "concave", prDepress: 0.06 },
    II:  { stShift: 0.22, stShape: "concave", prDepress: 0.08 },
    III: { stShift: 0.12, stShape: "concave", prDepress: 0.06 },
    aVF: { stShift: 0.18, stShape: "concave", prDepress: 0.06 },
    aVL: { stShift: 0.10, stShape: "concave", prDepress: 0.05 },
    aVR: { stShift: -0.18, prDepress: -0.10 }, // PR elevation in aVR — knuckle sign
    V2:  { stShift: 0.18, stShape: "concave", prDepress: 0.06 },
    V3:  { stShift: 0.25, stShape: "concave", prDepress: 0.07 },
    V4:  { stShift: 0.22, stShape: "concave", prDepress: 0.06 },
    V5:  { stShift: 0.18, stShape: "concave", prDepress: 0.05 },
    V6:  { stShift: 0.14, stShape: "concave", prDepress: 0.05 },
  },
  // ── Brugada Type 1 — coved ST↑ + TWI in V1-V2 ──
  brugada: {
    V1: { stShift: 0.30, stShape: "coved", tInv: true, tAmp: 0.7, rAmp: 0.5, sD: 0.1 },
    V2: { stShift: 0.35, stShape: "coved", tInv: true, tAmp: 0.7, rAmp: 0.6, sD: 0.1 },
  },
  // ── Hypothermia — Osborn / J wave in lateral leads ──
  hypothermia: {
    I:   { jWave: 0.20 },
    II:  { jWave: 0.25 },
    aVF: { jWave: 0.18 },
    V4:  { jWave: 0.25 },
    V5:  { jWave: 0.28 },
    V6:  { jWave: 0.25 },
  },
  // ── Hypokalaemia — flat T + prominent U + mild ST↓ ──
  hypokalemia: {
    II: { tAmp: 0.4, stShift: -0.06, uWave: 0.16 },
    V2: { tAmp: 0.4, stShift: -0.08, uWave: 0.20 },
    V3: { tAmp: 0.4, stShift: -0.08, uWave: 0.22 },
    V4: { tAmp: 0.4, stShift: -0.06, uWave: 0.18 },
    V5: { tAmp: 0.5, stShift: -0.05, uWave: 0.14 },
  },
  // ── Digoxin effect — scooped/sagging ST↓ ("Salvador Dalí mustache") ──
  digoxin_effect: {
    II: { stShift: -0.12, stShape: "scoop", tAmp: 0.5 },
    V5: { stShift: -0.15, stShape: "scoop", tAmp: 0.5 },
    V6: { stShift: -0.13, stShape: "scoop", tAmp: 0.5 },
  },
  // ── WPW — delta wave (lateral leads have biggest delta with LV-side accessory) ──
  wpw: {
    I:   { deltaWave: 0.6 },
    II:  { deltaWave: 0.7 },
    aVL: { deltaWave: 0.5 },
    V4:  { deltaWave: 0.8 },
    V5:  { deltaWave: 0.7 },
    V6:  { deltaWave: 0.6 },
  },
  // ── RV-paced (LBBB-like wide QRS + spike) ──
  paced_ventricular: {
    V1: { rAmp: 0.2, sD: 0.8, tInv: false, tAmp: 0.6 },
    V6: { rAmp: 1.0, sD: 0.05, tInv: true, tAmp: 0.6 },
  },
};

const RHYTHMS = {
  normal_sinus: {
    name: "Normal Sinus Rhythm", abbr: "NSR", bpm: 72, category: "Normal", color: "#34d399",
    shockable: null,
    description: "Regular rhythm from the SA node at 60–100 bpm. Each QRS preceded by an upright P wave in Lead II, constant PR interval (120–200 ms), narrow QRS (< 120 ms).",
    keyFeatures: ["Rate 60–100 bpm","Regular R-R intervals","Upright P before every QRS","PR 120–200 ms, QRS < 120 ms"],
    clinicalNote: "The reference standard for ECG interpretation. Confirms intact conduction through SA node → AV node → His → Purkinje system.",
    reference: "Dubin, Rapid Interpretation of EKGs, Ch. 3",
  },
  sinus_bradycardia: {
    name: "Sinus Bradycardia", abbr: "SB", bpm: 48, category: "Bradycardia", color: "#60a5fa",
    shockable: null,
    description: "Sinus rhythm with all normal morphologic features but rate < 60 bpm. P-wave axis and PR interval remain normal.",
    keyFeatures: ["Rate < 60 bpm","Normal P-QRS-T morphology","Regular rhythm","1:1 AV conduction preserved"],
    clinicalNote: "Physiologic in athletes/sleep. Pathologic: hypothyroidism, raised ICP, inferior MI, sick sinus. Atropine or pacing only if symptomatic.",
    reference: "AHA/ACLS Bradycardia Algorithm",
  },
  sinus_tachycardia: {
    name: "Sinus Tachycardia", abbr: "SinusTach", bpm: 130, category: "Tachycardia", color: "#fbbf24",
    shockable: null,
    description: "Normal sinus morphology at rate > 100 bpm with gradual onset/offset. At high rates the P wave may merge with the preceding T wave.",
    keyFeatures: ["Rate 100–160 bpm","Normal P-QRS-T","Gradual onset/offset","P may overlap T wave"],
    clinicalNote: "Physiologic response — treat the cause (fever, pain, hypovolemia, PE, anxiety, thyrotoxicosis, sepsis), not the rhythm.",
    reference: "Goldberger, Clinical ECG, Ch. 13",
  },
  svt: {
    name: "SVT (AVNRT)", abbr: "SVT", bpm: 180, category: "Tachycardia", color: "#f472b6",
    shockable: null,
    description: "Narrow-complex tachycardia from a reentrant circuit in/near the AV node. Abrupt onset and termination. P waves typically hidden within or just after QRS.",
    keyFeatures: ["Rate 150–250 bpm","Narrow QRS","Very regular R-R","P waves buried in QRS"],
    clinicalNote: "First-line: vagal maneuvers (modified Valsalva). Then IV adenosine 6 mg rapid push. Definitive: catheter ablation of the slow pathway.",
    reference: "Burns, LITFL — SVT Overview",
  },
  atrial_fibrillation: {
    name: "Atrial Fibrillation", abbr: "AFib", bpm: 95, category: "Arrhythmia", color: "#f87171",
    shockable: null,
    description: "Chaotic atrial activity (350–600/min) producing an irregularly irregular ventricular response. No discernible P waves; fibrillatory baseline.",
    keyFeatures: ["Irregularly irregular R-R","No P waves","Fibrillatory baseline","Narrow QRS unless aberrancy"],
    clinicalNote: "Most common sustained arrhythmia (~2%). CHA₂DS₂-VASc for stroke risk. Rate vs. rhythm control. Anticoagulation is the priority.",
    reference: "AHA/ACC/HRS 2014 AFib Guidelines",
  },
  atrial_flutter: {
    name: "Atrial Flutter", abbr: "AFlutter", bpm: 75, category: "Arrhythmia", color: "#fb923c",
    shockable: null,
    description: "Macro-reentrant circuit producing sawtooth flutter waves (F waves) at ~300 bpm. Best seen in II, III, aVF, V1. Ventricular rate depends on AV conduction ratio.",
    keyFeatures: ["Sawtooth F waves ~300/min","Regular atrial activity","Fixed or variable AV block","Regular ventricular rate (fixed block)"],
    clinicalNote: "Curable with cavotricuspid isthmus ablation (>95% success). Regular narrow tachycardia at 150 bpm → suspect flutter with 2:1 block.",
    reference: "Burns, LITFL — Atrial Flutter",
  },
  first_degree_block: {
    name: "1st Degree AV Block", abbr: "1°AVB", bpm: 65, category: "Conduction", color: "#a78bfa",
    shockable: null,
    description: "Prolonged PR interval (> 200 ms) with every P wave conducted. More accurately 'AV conduction delay' than true block.",
    keyFeatures: ["PR > 200 ms","Every P wave conducted","Regular rhythm","Constant PR interval"],
    clinicalNote: "Almost always benign. Common in athletes, with aging, and AV-nodal blocking drugs. May progress in acute MI.",
    reference: "Dubin, Rapid Interpretation of EKGs, Ch. 7",
  },
  second_degree_type1: {
    name: "2nd Degree Type I (Wenckebach)", abbr: "Wenck", bpm: 60, category: "Conduction", color: "#818cf8",
    shockable: null,
    description: "Progressive PR prolongation until a P wave fails to conduct (dropped QRS), then the cycle resets. Block is at the AV node (supra-Hisian).",
    keyFeatures: ["Progressive PR prolongation","Dropped QRS after longest PR","Group beating pattern","Irregular R-R with repeating cycle"],
    clinicalNote: "Usually benign. Common in athletes/sleep (high vagal tone). Supra-Hisian block = favorable prognosis. Rarely needs pacing.",
    reference: "Burns, LITFL — AV Block: 2nd Degree Type 1",
  },
  second_degree_type2: {
    name: "2nd Degree Type II (Mobitz II)", abbr: "MobII", bpm: 55, category: "Conduction", color: "#6366f1",
    shockable: null,
    description: "Intermittent non-conducted P waves WITHOUT progressive PR prolongation. Constant PR for conducted beats. QRS often wide (infra-nodal block).",
    keyFeatures: ["Constant PR for conducted beats","Sudden dropped QRS","Often wide QRS > 120 ms","No PR prolongation before drop"],
    clinicalNote: "Dangerous — infra-nodal block with high risk of progression to complete heart block. Usually requires permanent pacemaker.",
    reference: "AHA/ACLS Bradycardia Algorithm; Dubin Ch. 7",
  },
  third_degree_block: {
    name: "3rd Degree (Complete) Heart Block", abbr: "CHB", bpm: 38, category: "Emergency", color: "#ef4444",
    shockable: false,
    description: "Complete AV dissociation — P waves march independently at sinus rate while ventricles are driven by a slow escape pacemaker (junctional 40–60 or ventricular 20–40 bpm).",
    keyFeatures: ["Complete AV dissociation","P waves independent of QRS","Regular P-P and R-R (different rates)","Escape rhythm (junctional/ventricular)"],
    clinicalNote: "Symptomatic = emergency. Atropine (junctional escape) or transcutaneous pacing. Definitive: permanent dual-chamber pacemaker.",
    reference: "AHA/ACLS; Burns, LITFL — Complete Heart Block",
  },
  ventricular_tachycardia: {
    name: "Ventricular Tachycardia", abbr: "VTach", bpm: 165, category: "Emergency", color: "#dc2626",
    shockable: true,
    description: "Wide-complex tachycardia (QRS > 120 ms) originating from a single ventricular focus. Uniform beat-to-beat morphology. AV dissociation, fusion/capture beats may be present.",
    keyFeatures: ["Wide QRS > 120 ms","Regular rate 100–250 bpm","Uniform QRS morphology","AV dissociation common"],
    clinicalNote: "Pulseless VTach → defibrillation. Stable VTach → amiodarone or synchronized cardioversion. When in doubt: treat as VT.",
    reference: "Brugada et al., Circulation 1991; AHA/ACLS",
  },
  ventricular_fibrillation: {
    name: "Ventricular Fibrillation", abbr: "VFib", bpm: 0, category: "Emergency", color: "#b91c1c",
    shockable: true,
    description: "Chaotic, disorganized ventricular activity with no identifiable QRS. No cardiac output — this is cardiac arrest. Irregular rapid oscillations of varying amplitude.",
    keyFeatures: ["No identifiable QRS, P, or T","Chaotic irregular waveform","No cardiac output","Coarse → fine as energy depletes"],
    clinicalNote: "SHOCKABLE — immediate defibrillation. Every minute without defib reduces survival ~10%. CPR + epi + amiodarone per ACLS.",
    reference: "AHA/ACLS VFib/pVT Algorithm",
  },
  asystole: {
    name: "Asystole", abbr: "Asystole", bpm: 0, category: "Emergency", color: "#991b1b",
    shockable: false,
    description: "Absence of ventricular electrical activity — flat line with possible residual P waves. NOT a shockable rhythm. Confirm in 2 leads.",
    keyFeatures: ["Flat line (< 0.1 mV)","No QRS complexes","Possible residual P waves","Confirm in 2 leads + check connections"],
    clinicalNote: "NON-SHOCKABLE. CPR + epinephrine. Rule out 5 H's and 5 T's. Prognosis is extremely poor. Do NOT defibrillate.",
    reference: "AHA/ACLS Asystole/PEA Algorithm",
  },
  torsades: {
    name: "Torsades de Pointes", abbr: "TdP", bpm: 200, category: "Emergency", color: "#e11d48",
    shockable: true,
    description: "Polymorphic VT in the setting of prolonged QT. 'Twisting of the points' — QRS axis rotates around the baseline producing spindle-shaped waxing/waning amplitude.",
    keyFeatures: ["Spindle-shaped amplitude modulation","QRS axis twists around baseline","Associated with prolonged QT","Short-long-short initiation"],
    clinicalNote: "IV magnesium 2g is first-line. Overdrive pacing or isoproterenol to shorten QT. STOP QT-prolonging drugs. Defib if pulseless.",
    reference: "Dessertenne, 1966; Burns, LITFL — Torsades",
  },
  long_qt: {
    name: "Long QT Syndrome", abbr: "LQTS", bpm: 60, category: "Conduction", color: "#e879f9",
    shockable: null,
    description: "Prolonged QT interval (QTc > 470 ms male, > 480 ms female) with normal sinus rhythm. The T wave is often broad, bifid, or notched. Creates a substrate for early afterdepolarizations and Torsades de Pointes. May be congenital (ion channelopathies: LQT1, LQT2, LQT3) or acquired (drugs, electrolytes).",
    keyFeatures: ["Prolonged QTc (> 470–480 ms)","Broad or notched T waves","Normal sinus P-QRS","Risk of Torsades de Pointes"],
    clinicalNote: "Congenital: beta-blockers (LQT1/2), mexiletine (LQT3), ICD for high risk. Acquired: STOP offending drug, correct K⁺/Mg²⁺. Common culprits: QTc-prolonging antibiotics (azithromycin, fluoroquinolones), antipsychotics, methadone, ondansetron.",
    reference: "Schwartz et al., Circulation 2013; CredibleMeds.org",
  },
  lbbb: {
    name: "Left Bundle Branch Block", abbr: "LBBB", bpm: 72, category: "Conduction", color: "#c084fc",
    shockable: null,
    description: "LV depolarizes late via cell-to-cell conduction after RV. QRS ≥ 120 ms. V1: deep S (rS/QS). V5-V6/I/aVL: broad notched R ('M-shaped'). Appropriate ST-T discordance.",
    keyFeatures: ["QRS ≥ 120 ms","Broad notched R in I, aVL, V5–V6","Deep S in V1","Appropriate ST-T discordance"],
    clinicalNote: "New LBBB + chest pain: use modified Sgarbossa (Smith) criteria. LBBB makes ischemia assessment difficult. May indicate structural heart disease.",
    reference: "Sgarbossa et al., NEJM 1996; Burns, LITFL — LBBB",
  },
  rbbb: {
    name: "Right Bundle Branch Block", abbr: "RBBB", bpm: 72, category: "Conduction", color: "#d946ef",
    shockable: null,
    description: "RV depolarizes late after normal LV activation. QRS ≥ 120 ms. V1: rsR' ('M-shaped'). I/V6: wide slurred S wave. Initial forces unchanged — MI diagnosis not impaired.",
    keyFeatures: ["QRS ≥ 120 ms","rsR' in V1 ('M-shaped')","Wide slurred S in I, V6","ST-T changes secondary to RBBB"],
    clinicalNote: "Can be normal variant. Pathologic: PE, RV strain, ASD, Brugada, myocarditis. Unlike LBBB, initial depolarization is normal so acute MI diagnosis is preserved.",
    reference: "Goldberger, Clinical ECG, Ch. 7; Burns, LITFL — RBBB",
  },
  pe_s1q3t3: {
    name: "PE Pattern (S1Q3T3)", abbr: "S1Q3T3", bpm: 110, category: "Arrhythmia", color: "#f59e0b",
    shockable: null,
    description: "Classic pattern of acute PE (though only ~20% sensitive): deep S in Lead I, Q in Lead III, inverted T in Lead III. Reflects acute right heart strain. Often with sinus tach and right precordial T inversions.",
    keyFeatures: ["Deep S wave in Lead I","Q wave in Lead III","T-wave inversion in Lead III","Sinus tachycardia common"],
    clinicalNote: "Absence does NOT exclude PE. Most common PE finding is sinus tachycardia. Right heart strain T inversions (V1–V4) may be more prognostic than S1Q3T3.",
    reference: "McGinn & White, JAMA 1935; Dubin Ch. 15",
  },
  unifocal_pvc: {
    name: "Unifocal PVCs", abbr: "UniPVC", bpm: 72, category: "Arrhythmia", color: "#38bdf8",
    shockable: null,
    description: "Premature ventricular complexes from a single ectopic focus — each PVC has identical wide QRS morphology. Appear early without preceding P wave, followed by compensatory pause.",
    keyFeatures: ["Premature wide QRS (same morphology)","No preceding P wave","Compensatory pause","Fixed coupling interval"],
    clinicalNote: "Usually benign. PVC burden >10–15% on Holter → risk of cardiomyopathy. Beta-blockers first; catheter ablation if refractory.",
    reference: "Dubin Ch. 10; Latchamsetty & Bogun, JACC 2019",
  },
  multifocal_pvc: {
    name: "Multifocal PVCs", abbr: "MultiPVC", bpm: 72, category: "Arrhythmia", color: "#2dd4bf",
    shockable: null,
    description: "PVCs from ≥2 ectopic foci producing varying QRS morphologies. Different shapes = different origins. Varying coupling intervals.",
    keyFeatures: ["≥ 2 different PVC morphologies","Varying coupling intervals","Wide QRS without preceding P","Compensatory pauses"],
    clinicalNote: "Suggests greater myocardial irritability. More common in structural heart disease, electrolyte abnormalities (K⁺, Mg²⁺), drug toxicity. Requires workup.",
    reference: "Goldberger, Clinical ECG, Ch. 17",
  },

  /* ═══ ISCHEMIA / INFARCTION ═══ */
  stemi_anterior: {
    name: "Anterior STEMI (LAD)", abbr: "Ant-STEMI", bpm: 88, category: "Ischemia", color: "#ef4444",
    shockable: null,
    description: "Occlusion of the LAD. Convex ('tombstone') ST elevation across the precordial leads V1–V4 with reciprocal ST depression inferiorly (II, III, aVF). R-wave amplitude is reduced over the infarct zone.",
    keyFeatures: ["ST↑ V1–V4 (convex / tombstone)","Reciprocal ST↓ in II, III, aVF","Loss of R wave progression","High mortality — large myocardial territory"],
    clinicalNote: "Time = muscle. Activate cath lab; goal door-to-balloon < 90 min. Dual antiplatelet + anticoagulation per guidelines. Anterior STEMI has the worst prognosis of all STEMI territories.",
    reference: "AHA/ACC 2013 STEMI Guidelines; Burns, LITFL — Anterior STEMI",
  },
  stemi_inferior: {
    name: "Inferior STEMI (RCA)", abbr: "Inf-STEMI", bpm: 70, category: "Ischemia", color: "#dc2626",
    shockable: null,
    description: "Occlusion of the right coronary artery (or LCx in left-dominant). ST elevation in II, III, aVF with reciprocal ST depression in I and aVL. III > II elevation suggests RCA over LCx.",
    keyFeatures: ["ST↑ in II, III, aVF","Reciprocal ST↓ in I, aVL","III ↑ > II ↑ → RCA culprit","Check V4R for RV involvement"],
    clinicalNote: "Often bradycardic (RCA supplies SA/AV nodes). AVOID nitrates if RV infarct (preload-dependent → hypotension). Atropine for symptomatic brady. Get right-sided leads (V4R).",
    reference: "Burns, LITFL — Inferior STEMI",
  },
  stemi_lateral: {
    name: "Lateral STEMI (Cx / D1)", abbr: "Lat-STEMI", bpm: 85, category: "Ischemia", color: "#f43f5e",
    shockable: null,
    description: "Occlusion of the circumflex or first diagonal branch. ST elevation in lateral leads (I, aVL ± V5–V6) with reciprocal depression in inferior leads.",
    keyFeatures: ["ST↑ in I, aVL, V5, V6","Reciprocal ST↓ in II, III, aVF","Q wave in aVL with first diagonal occlusion","Often subtle — easy to miss"],
    clinicalNote: "Isolated high-lateral STEMI (I + aVL only) is the most commonly missed STEMI on initial ECG read. South African flag sign: ST↑ I, aVL, V2 + ST↓ III → first diagonal occlusion.",
    reference: "Littmann, J Electrocardiol 2016 (S.A. flag sign); LITFL — Lateral STEMI",
  },
  stemi_posterior: {
    name: "Posterior STEMI", abbr: "Post-STEMI", bpm: 80, category: "Ischemia", color: "#be123c",
    shockable: null,
    description: "Posterior wall infarct (LCx or RPDA branch). Shows as 'mirror image' in anterior leads: tall R, ST depression, and upright T in V1–V3. Confirm with posterior leads V7–V9 (ST↑ ≥ 0.5 mm).",
    keyFeatures: ["Tall R wave in V1–V2 (R > S)","Horizontal ST↓ in V1–V3","Upright T waves in V1–V3","Confirm with V7–V9 (ST↑)"],
    clinicalNote: "ST depression in V1–V3 should always prompt posterior lead placement. ~15–20% of inferior STEMIs extend posteriorly. Treat as STEMI — get to cath lab.",
    reference: "Burns, LITFL — Posterior STEMI",
  },
  stemi_rv: {
    name: "RV STEMI (proximal RCA)", abbr: "RV-STEMI", bpm: 70, category: "Ischemia", color: "#9f1239",
    shockable: null,
    description: "Right ventricular infarct from proximal RCA occlusion. Inferior STEMI pattern PLUS ST↑ in V1 (and confirmed in V4R). III ↑ > II ↑ is the giveaway.",
    keyFeatures: ["Inferior STEMI features","ST↑ in V1 (anterior precordial)","III ↑ > II ↑","ST↑ in V4R confirms diagnosis"],
    clinicalNote: "RV infarct = preload-dependent state. AVOID nitrates and opioids. Give IV fluids for hypotension. Pacing may be needed for bradyarrhythmias.",
    reference: "Wellens, Heart 1999; LITFL — RV Infarction",
  },
  wellens: {
    name: "Wellens Syndrome", abbr: "Wellens", bpm: 75, category: "Ischemia", color: "#fb7185",
    shockable: null,
    description: "Critical proximal LAD stenosis with pain-free interval. Type A (25%): biphasic T waves in V2–V3. Type B (75%): deeply symmetric inverted T waves in V2–V3 (sometimes V1–V4). Preserved R waves, no Q waves, no ST elevation.",
    keyFeatures: ["Biphasic or deep symmetric TWI in V2–V3","Recent angina (now pain-free)","Preserved R wave progression","No Q waves, minimal/no ST↑"],
    clinicalNote: "High-risk pattern — impending anterior STEMI within days. Stress testing is contraindicated. Patient needs urgent coronary angiography, not a treadmill.",
    reference: "de Zwaan, Wellens, Am Heart J 1982; LITFL — Wellens",
  },
  dewinter: {
    name: "De Winter T Waves", abbr: "DeWinter", bpm: 95, category: "Ischemia", color: "#f87171",
    shockable: null,
    description: "Anterior STEMI equivalent: ~2% of LAD occlusions. Upsloping ST depression at the J point in V1–V6, continuing into tall, prominent, symmetric T waves. Often with subtle ST↑ in aVR.",
    keyFeatures: ["Upsloping ST↓ at J point in precordials","Tall symmetric T waves V1–V6","Often subtle ST↑ in aVR","No frank ST↑ — easy to miss"],
    clinicalNote: "Treat as STEMI — activate cath lab. Considered a STEMI equivalent in current OMI/NOMI paradigm. May persist throughout occlusion without evolving into classic ST↑.",
    reference: "de Winter et al., NEJM 2008; LITFL — De Winter T waves",
  },
  pericarditis: {
    name: "Acute Pericarditis", abbr: "Pericard", bpm: 95, category: "Ischemia", color: "#fb923c",
    shockable: null,
    description: "Inflammation of the pericardium. Stage 1 ECG: diffuse concave-up ST elevation (excluding aVR and V1) with PR depression. Reciprocal changes in aVR (ST↓ and PR↑ — 'knuckle sign'). No reciprocal ST↓ otherwise; no Q waves.",
    keyFeatures: ["Diffuse concave-up ST↑","PR depression (PR↑ in aVR)","No reciprocal ST↓","No Q waves, preserved R waves"],
    clinicalNote: "Spodick sign (downsloping TP segment) supports diagnosis. NSAIDs + colchicine first-line. Look for effusion / tamponade. Distinguish from STEMI (focal, convex ST↑) and benign early repolarisation (J-point notch).",
    reference: "Imazio et al., NEJM 2013; LITFL — Pericarditis",
  },

  /* ═══ CHANNELOPATHIES / METABOLIC ═══ */
  brugada: {
    name: "Brugada Syndrome (Type 1)", abbr: "Brugada", bpm: 75, category: "Conduction", color: "#a855f7",
    shockable: null,
    description: "Sodium channel (SCN5A) loss-of-function channelopathy. Type 1 ('coved'): ≥ 2 mm coved ST elevation in V1–V2 descending into a negative T wave. May be unmasked by fever, sodium-channel blockers, vagal tone.",
    keyFeatures: ["Coved ST↑ ≥ 2 mm in V1–V2","T-wave inversion follows ST","Pseudo-RBBB pattern (no wide S in V6)","Risk of polymorphic VT / SCD"],
    clinicalNote: "ICD for symptomatic patients (syncope, aborted SCD) or inducible VF on EP study. AVOID Brugada-aggravating drugs (Class I antiarrhythmics, propofol, TCAs). Treat fever aggressively.",
    reference: "Brugada & Brugada, JACC 1992; Priori et al., 2015 HRS Consensus",
  },
  hyperkalemia_mild: {
    name: "Hyperkalaemia — Tall T Waves", abbr: "K↑ mild", bpm: 75, category: "Metabolic", color: "#fbbf24",
    shockable: null,
    description: "K⁺ ~5.5–6.5 mmol/L. Early ECG change: tall, narrow, peaked ('tented') T waves with a narrow base. Best seen in precordial leads. Repolarisation accelerates.",
    keyFeatures: ["Tall narrow peaked T waves","Symmetric, pointed peak","Shortened QT","Best seen in V2–V4"],
    clinicalNote: "Verify K⁺ urgently. Treat if symptomatic or K⁺ > 6.0: IV calcium (membrane stabilisation), insulin/dextrose, salbutamol, then K⁺ removal (resin / dialysis / loop diuretic).",
    reference: "Mattu et al., Am J Emerg Med 2000; LITFL — Hyperkalaemia",
  },
  hyperkalemia_severe: {
    name: "Hyperkalaemia — Sine Wave", abbr: "K↑ pre-arrest", bpm: 60, category: "Emergency", color: "#dc2626",
    shockable: false,
    description: "K⁺ > 8 mmol/L. Pre-arrest pattern. P waves disappear, QRS broadens progressively, eventually fusing with the T wave to form a sine wave. Imminent VF or asystole.",
    keyFeatures: ["No P waves","Very wide QRS fused with T","Sinusoidal pattern","Imminent cardiac arrest"],
    clinicalNote: "Immediate IV calcium chloride 1 g (or gluconate 3 g) — works in seconds. Then insulin/dextrose, salbutamol, bicarbonate, urgent dialysis. Cardiac monitoring continuously. CPR if arrest.",
    reference: "Burns, LITFL — Hyperkalaemia: Sine Wave",
  },
  hypokalemia: {
    name: "Hypokalaemia", abbr: "K↓", bpm: 80, category: "Metabolic", color: "#fcd34d",
    shockable: null,
    description: "K⁺ < 3.5 mmol/L. Repolarisation is delayed: flattening / inversion of T waves, ST depression, and the appearance of prominent U waves (best seen in V2–V3). Apparent QT prolongation (actually merged QU interval).",
    keyFeatures: ["Flat / inverted T waves","ST depression","Prominent U waves (V2–V3)","Apparent long QT (QU fusion)"],
    clinicalNote: "Replace K⁺ — orally if possible, IV if severe / symptomatic / arrhythmia. Always check Mg²⁺ (hypokalaemia is refractory until Mg²⁺ is replaced). Risk of digoxin toxicity, torsades.",
    reference: "Diercks et al., J Emerg Med 2004; LITFL — Hypokalaemia",
  },
  hypothermia: {
    name: "Hypothermia (Osborn Waves)", abbr: "Hypotherm", bpm: 45, category: "Metabolic", color: "#22d3ee",
    shockable: null,
    description: "Core temp < 32 °C produces the Osborn (J) wave: a positive deflection at the J point, like a 'camel hump' on the end of the QRS. Amplitude proportional to severity. Bradycardia, prolonged intervals, and shivering artefact common.",
    keyFeatures: ["Osborn (J) wave at end of QRS","Bradycardia, slow AF common","Prolonged PR, QRS, QT","Shivering artefact on baseline"],
    clinicalNote: "Handle gently — irritable myocardium prone to VF. Rewarm (passive → active external → core). Defibrillation often unsuccessful until temp > 30 °C. 'Not dead until warm and dead.'",
    reference: "Osborn, Am J Physiol 1953; LITFL — Hypothermia",
  },
  digoxin_effect: {
    name: "Digoxin Effect (Therapeutic)", abbr: "Dig effect", bpm: 65, category: "Metabolic", color: "#86efac",
    shockable: null,
    description: "Therapeutic digoxin produces a characteristic scooped, downsloping ('Salvador Dalí mustache') ST depression — best seen in lateral leads — with shortened QT and flattened/inverted T waves. NOT a sign of toxicity.",
    keyFeatures: ["Scooped / sagging ST↓","Flat or inverted T waves","Shortened QT interval","Prominent U waves possible"],
    clinicalNote: "Reflects therapeutic effect, NOT toxicity. Dig TOXICITY is suggested by any arrhythmia in a patient on dig (classically: atrial tach with block, bidirectional VT, junctional rhythms). Check level, treat with DigiFab.",
    reference: "Ma et al., Crit Care Med 2001; LITFL — Digoxin Effect / Toxicity",
  },

  /* ═══ PRE-EXCITATION / PACED / ESCAPE ═══ */
  wpw: {
    name: "WPW Pre-excitation", abbr: "WPW", bpm: 75, category: "Arrhythmia", color: "#c084fc",
    shockable: null,
    description: "Accessory pathway (bundle of Kent) bypasses the AV node. Triad: short PR (< 120 ms), delta wave (slurred QRS upstroke), wide QRS (> 110 ms). Predisposes to AVRT (orthodromic narrow / antidromic wide) and pre-excited AF.",
    keyFeatures: ["Short PR < 120 ms","Delta wave (slurred upstroke)","Wide QRS > 110 ms","Secondary ST-T changes"],
    clinicalNote: "Pre-excited AF (irregular, broad, fast — sometimes > 250 bpm) is a medical emergency: AV-nodal blockers (adenosine, verapamil, digoxin) are CONTRAINDICATED — they accelerate accessory pathway conduction → VF. Use procainamide / cardioversion.",
    reference: "Wolff, Parkinson, White, Am Heart J 1930; LITFL — WPW",
  },
  paced_ventricular: {
    name: "Ventricular Paced Rhythm", abbr: "V-paced", bpm: 70, category: "Paced", color: "#60a5fa",
    shockable: null,
    description: "RV apical pacing produces a sharp pacing spike followed by a wide QRS with an LBBB-like morphology (RV is depolarised first, LV follows late via cell-to-cell conduction). Underlying intrinsic rhythm may or may not be visible.",
    keyFeatures: ["Pacing spike before every QRS","Wide QRS, LBBB-like morphology","Appropriate ST-T discordance","Capture confirmed by QRS after each spike"],
    clinicalNote: "Modified Sgarbossa (Smith) criteria are used to diagnose acute MI in paced rhythm. Failure to capture (spike without QRS), failure to sense (spikes in inappropriate places), or no spikes at all all suggest pacemaker malfunction.",
    reference: "Sgarbossa et al., NEJM 1996; LITFL — Pacemaker Rhythms",
  },
  paced_dual: {
    name: "Dual-Chamber Paced (DDD)", abbr: "DDD", bpm: 75, category: "Paced", color: "#3b82f6",
    shockable: null,
    description: "Atrial pacing spike → P wave → ventricular pacing spike → wide QRS. Both chambers are paced sequentially, preserving AV synchrony.",
    keyFeatures: ["Atrial spike before each P","Ventricular spike before each QRS","Wide LBBB-like QRS","AV delay preserved"],
    clinicalNote: "Indications: AV block with preserved sinus node function, sinus node dysfunction. Mode-switching prevents tracking of atrial arrhythmias. Pacemaker syndrome occurs with loss of AV synchrony in single-chamber pacing.",
    reference: "Bernstein et al., PACE 2002 (NBG code); LITFL — DDD pacing",
  },
  junctional_escape: {
    name: "Junctional Escape", abbr: "Junct", bpm: 45, category: "Bradycardia", color: "#94a3b8",
    shockable: null,
    description: "AV junctional pacemaker takes over when the SA node fails or AV conduction is blocked. Rate 40–60 bpm. Narrow QRS. P waves either absent, inverted (retrograde, after QRS), or buried in the QRS.",
    keyFeatures: ["Rate 40–60 bpm","Narrow QRS","Inverted / absent / retrograde P","Regular rhythm"],
    clinicalNote: "Symptomatic? Atropine first. Look for the cause: drug effect (β-blocker, dig), inferior MI, sick sinus, hyperkalaemia. May need pacing if persistent and symptomatic.",
    reference: "Goldberger, Clinical ECG, Ch. 14; LITFL — Junctional Escape",
  },
  aivr: {
    name: "AIVR (Accelerated Idioventricular)", abbr: "AIVR", bpm: 75, category: "Arrhythmia", color: "#fb923c",
    shockable: null,
    description: "Ventricular escape rhythm at 40–110 bpm (faster than the intrinsic ventricular rate of 20–40, slower than VT > 100). Regular, wide QRS, no P waves. Classic 'reperfusion rhythm' after successful thrombolysis or PCI.",
    keyFeatures: ["Rate 40–110 bpm","Wide regular QRS","No P waves","Often self-terminating"],
    clinicalNote: "Usually benign and self-limiting — DO NOT treat as VT. Hallmark sign of successful reperfusion in acute MI. Avoid antiarrhythmics: suppressing AIVR may unmask a slower escape that's haemodynamically worse.",
    reference: "Riera et al., Indian Pacing Electrophysiol J 2010; LITFL — AIVR",
  },
};

const WAVE_COMPONENTS = [
  { id:"P", label:"P Wave", color:"#60a5fa", desc:"Atrial depolarization from SA node. Upright in Lead II, inverted in aVR. Bifid P (P mitrale) = LA enlargement; peaked P (P pulmonale) = RA enlargement.", duration:"< 120 ms", amplitude:"< 2.5 mm" },
  { id:"PR", label:"PR Interval", color:"#a78bfa", desc:"SA node → AV node → His conduction time. Prolonged (> 200 ms) = 1° AV block. Short (< 120 ms) = pre-excitation (WPW) or junctional rhythm.", duration:"120–200 ms", amplitude:"—" },
  { id:"QRS", label:"QRS Complex", color:"#34d399", desc:"Ventricular depolarization. Q = septal (L→R); R = free wall; S = basal. Wide (≥ 120 ms) = BBB, ventricular origin, or pre-excitation.", duration:"< 120 ms", amplitude:"5–20 mm" },
  { id:"ST", label:"ST Segment", color:"#22d3ee", desc:"J point to T-wave onset. Should be isoelectric. Elevation = STEMI, pericarditis, Brugada, benign early repol. Depression = ischemia, reciprocal, dig effect.", duration:"80–120 ms", amplitude:"Isoelectric ±1mm" },
  { id:"T", label:"T Wave", color:"#fb923c", desc:"Ventricular repolarization. Peaked T = hyperkalemia. Flat/inverted = ischemia, LVH strain, PE. Should be asymmetric (slow up, fast down).", duration:"~160 ms", amplitude:"< 5 mm (limb)" },
  { id:"QT", label:"QT Interval", color:"#f472b6", desc:"Total ventricular electrical systole. QTc = QT/√RR. Prolonged QTc (>440M, >460F) → Torsades risk. Causes: drugs, electrolytes, congenital LQTS.", duration:"QTc < 440–460 ms", amplitude:"—" },
];

const CATEGORIES = ["All","Normal","Bradycardia","Tachycardia","Arrhythmia","Conduction","Ischemia","Metabolic","Paced","Emergency"];

/* ═══════════════ BEAT TIMING & AUSCULTATION MODEL ═══════════════
   One clock drives both the trace and the sound, so what you hear always
   lines up with what is drawn. The constants below are the medical content
   of the audio — sources are cited per rhythm in RHYTHM_AUDIO.note.

   Three findings drove this model:

   1. S1→S2 is NOT a fixed fraction of the cardiac cycle. Weissler's
      electromechanical systole QS2 (ms) ≈ 546 − 2.1 × HR (Weissler et al.,
      Circulation 1968). Systole shortens far less than diastole as the rate
      climbs: 395 ms of a 833 ms cycle at 72 bpm (47%), but 168 ms of a 333 ms
      cycle at 180 bpm (50%). That is why a fast rhythm collapses from
      "lub-dub … lub-dub" into the evenly spaced tic-toc of embryocardia.

   2. S1 intensity tracks where the mitral leaflets sit at the onset of
      systole, i.e. the PR interval — or, when there is no fixed PR, the
      preceding R-R. Short PR / short cycle → leaflets still wide open →
      loud S1. Long PR → soft S1. Beyond PR ≈ 0.50 s the valve reopens
      (Circulation 1974;50:17). This is the mechanism behind variable S1 in
      AF, complete heart block, VT and Mobitz I.

   3. A monitor's QRS tone fires on a DETECTED QRS. A dropped beat is
      silent; VF, asystole and torsades produce no tone at all — they
      produce an alarm. The continuous flatline tone is a Hollywood
      invention, not something a real monitor does.                        */

const RESP_PERIOD = 4.0;    // s — ~15 breaths/min; drives split S2 and RSA
const MORPH_EXTENT = 0.80;  // fraction of the reference cycle the drawn P-QRS-T occupies

// Weissler: total electromechanical systole, Q wave to the aortic component of
// S2. The regression was derived over roughly 40–110 bpm; extrapolated past
// that it eventually predicts systole shrinking faster than the cycle, which is
// wrong. Above 110 we hold QS2 at the fraction of the cycle the regression
// itself reaches there (57.8%) — continuous at the join, and it reproduces the
// equal-spaced tic-toc of embryocardia at tachycardic rates.
const qs2Seconds = (hr) => {
  const h = Math.min(230, Math.max(35, hr));
  return h <= 110 ? (546 - 2.1 * h) / 1000 : (546 - 2.1 * 110) / 1000 * (110 / h);
};

/* Per-rhythm audio profile.
   group    — length of the repeating beat pattern (drives morphology + timing)
   rPhase   — phase of the R peak inside the drawn beat (where the tone fires)
   alarm    — "high" | "medium" | null, per IEC 60601-1-8 priority
   tone     — false when the monitor cannot derive a QRS (no tone at all)
   note     — what a clinician should actually hear, shown in the UI          */
const RHYTHM_AUDIO = {
  normal_sinus: { rsa: 0.045,
    note: "Even lub-dub at 72. Not metronomic — respiratory sinus arrhythmia speeds the rate on inspiration and slows it on expiration (P-P varies < 120 ms in health). S2 splits into A2-P2 at end-inspiration and fuses on expiration." },
  sinus_bradycardia: { rsa: 0.05, alarm: "medium",
    note: "Slow and regular. Systole barely lengthens (QS2 ≈ 445 ms at 48 bpm) so diastole does all the stretching — a long silent gap between dub and the next lub. A HR-low alarm fires below the usual 50 bpm limit." },
  sinus_tachycardia: { rsa: 0.015, alarm: "medium",
    note: "Fast, regular, gradual onset. Systole (QS2 ≈ 266 ms) now fills well over half the cycle, so lub-dub starts to sound evenly spaced — early embryocardia. HR-high alarm above the 120 bpm limit." },
  svt: { rPhase: 0.327, s1: 1.2, s4: 0, alarm: "medium",
    note: "Abrupt onset, unvarying, 180 bpm. Full embryocardia: QS2 ≈ 192 ms of a 333 ms cycle, so S1 and S2 fall almost equally spaced — a tic-toc, not a lub-dub. In AVNRT the atria contract against shut AV valves (cannon a-waves, 'frog sign') and there is no S4." },
  atrial_fibrillation: { rPhase: 0.365, af: true, s4: 0,
    note: "Irregularly irregular — no two cycles alike, successive R-R differing by well over 20 ms. S1 intensity varies beat to beat because the preceding cycle sets leaflet position: a short cycle gives a loud S1, a long one a soft S1. Beats following a very short cycle eject little and produce a weak S2 — the pulse deficit. No S4: the atria never organise." },
  atrial_flutter: { rPhase: 0.389, s4: 0,
    note: "Regular at 75 (300 bpm flutter with fixed 4:1 block). Sounds indistinguishable from sinus at the bedside — the sawtooth is a visual diagnosis, not an audible one. No S4, because atrial contraction is not effective." },
  first_degree_block: { prDelay: 1, s1: 0.5, rsa: 0.03, s4: 0.6,
    note: "Regular, but S1 is SOFT. The long PR lets the mitral leaflets drift back toward closed before the ventricle contracts, so there is less left to slam shut. The atrial kick separates out as an audible S4 ahead of S1." },
  second_degree_type1: { group: 4, wenckebach: true,
    note: "Group beating. The R-R intervals get progressively SHORTER through the group — PR lengthens by shrinking increments — and S1 gets progressively softer as PR grows. Then a beat is simply missing: no tone, no sound, a gap, and the cycle resets loud again." },
  second_degree_type2: { group: 3, qrsWidth: 1.4,
    note: "Regular, constant-intensity beats, then one is silently dropped and the gap is exactly two cycles long. Nothing warns you it is coming — unlike Wenckebach, the cadence does not tighten first." },
  third_degree_block: { rPhase: 0.2025, chb: true, atrialRate: 75, alarm: "medium",
    note: "Slow and metronomically regular, with S1 intensity wandering at random — the atria fire independently at 75, so the PR relationship is different every beat. When a P happens to land 0.10–0.20 s ahead of the QRS you get a bruit de canon: a single startlingly loud S1, the audible partner of the cannon a-wave in the neck." },
  ventricular_tachycardia: { rPhase: 0.157, dissoc: true, jitter: 0.008, s2: 0.55, s4: 0, alarm: "high",
    note: "Fast, wide and nearly regular — successive R-R vary by under 20 ms, which is what separates it from AF. AV dissociation makes S1 vary randomly, and the poorly filled ventricle ejects badly so S2 is faint. Red high-priority alarm." },
  ventricular_fibrillation: { tone: false, silent: true, alarm: "high",
    note: "NO QRS tone and NO heart sounds — there is no coordinated contraction to make any. What you hear is the monitor's red high-priority alarm: five pulses, repeated. Silence where the beeps were is itself the finding." },
  asystole: { tone: false, silent: true, alarm: "high",
    note: "Silence, then the red alarm. Real monitors do NOT emit the continuous flatline tone of film and television — that sound does not exist in clinical practice. Asystole announces itself as a repeating high-priority burst." },
  torsades: { tone: false, silent: true, alarm: "high",
    note: "No discrete QRS for the monitor to track, so no tone — only the red alarm. There is no organised mechanical systole, so there are no heart sounds." },
  long_qt: { s4: 0.4,
    note: "Sounds entirely normal — regular sinus at 60. The danger is silent: prolonged repolarisation is invisible to auscultation, and the first audible sign is the chaos of the torsades it causes." },
  lbbb: { qrsWidth: 2.0, split: -45, s1: 0.85,
    note: "Regular, but S2 splits PARADOXICALLY: the delayed left ventricle closes the aortic valve after the pulmonic, so P2 comes first. The split is audible on EXPIRATION and fuses on inspiration — the reverse of the normal pattern." },
  rbbb: { qrsWidth: 1.8, split: 70,
    note: "Regular, with WIDE splitting of S2. Late right ventricular emptying delays P2, so A2-P2 stays split through the whole respiratory cycle (~70 ms) and widens further on inspiration." },
  pe_s1q3t3: { s4: 0.5, alarm: null,
    note: "Sinus tachycardia is the real auscultatory finding in PE — S1Q3T3 is an ECG pattern, not a sound. Acute right heart strain may add a loud P2 and a right-sided S4." },
  unifocal_pvc: { group: 5, pvcAt: [3], coupling: [0.55],
    note: "Regular … then an EARLY beat with a sharp, loud S1 and little or no S2 — the premature ventricle ejects almost nothing, which is why the beat is often missing at the wrist. Then a full compensatory pause (the surrounding R-R is exactly two sinus cycles), and the post-pause beat lands with an extra-loud S1 from the long filling time." },
  multifocal_pvc: { group: 7, pvcAt: [2, 5], coupling: [0.52, 0.66],
    note: "Same early-beat-then-pause cadence as unifocal PVCs, but the coupling intervals DIFFER between ectopics — the ectopics arise from different foci, so they do not fall at the same distance after the sinus beat each time." },
  stemi_anterior: { s4: 1.0, note: "Regular sinus with an S4 gallop. An audible atrial gallop is a near-universal finding in the acute phase of infarction while sinus rhythm persists — the stiff, ischaemic ventricle resists the atrial kick." },
  stemi_inferior: { s4: 1.0, note: "Regular, often slow (vagal tone / RCA supply to the SA and AV nodes), with an S4 gallop of acute ischaemia. Watch for the rate falling as block develops." },
  stemi_lateral: { s4: 1.0, note: "Regular sinus with the S4 gallop of acute ischaemia." },
  stemi_posterior: { s4: 1.0, note: "Regular sinus with the S4 gallop of acute ischaemia — nothing audible distinguishes the posterior territory." },
  stemi_rv: { s4: 1.0, note: "Regular with an S4. RV infarction is preload-dependent — a right-sided S4 and raised JVP with clear lungs is the classic bedside triad." },
  wellens: { s4: 0.7, note: "Sounds normal, and that is the trap. Wellens is a pain-free interval with a critical LAD lesion behind it — the ECG is the only thing shouting." },
  dewinter: { s4: 0.9, note: "Regular sinus, often mildly tachycardic, with an S4. As with Wellens, the emergency is entirely electrical — auscultation will not find it." },
  pericarditis: { rub: true, s4: 0,
    note: "The finding is a PERICARDIAL FRICTION RUB — a scratchy, leathery, high-pitched sound with up to three components per cycle (atrial systole, ventricular systole, early diastole). It is superficial, closest to the chest wall, and loudest sitting forward in expiration." },
  brugada: { note: "Sounds completely normal. Brugada is a channelopathy — the only warning is the coved ST in V1-V2 and the arrhythmic history." },
  hyperkalemia_mild: { s4: 0, note: "Regular, unremarkable. The flattening P waves mean atrial contraction is already failing, so the S4 disappears before anything else changes." },
  hyperkalemia_severe: { rPhase: 0.25, s1: 0.3, s2: 0.15, s4: 0, alarm: "high",
    note: "Barely audible. The sine wave is pre-arrest: the myocardium is depolarised and contracting feebly, so the heart sounds fade to almost nothing even though the monitor still counts a rate. Red alarm." },
  hypokalemia: { s4: 0.5, note: "Regular; the U wave is electrical only. What matters is that this substrate breaks into torsades — which is audible only as an alarm." },
  hypothermia: { s1: 0.7, s2: 0.7, rsa: 0.02, alarm: "medium",
    note: "Slow and quiet. Cold myocardium contracts sluggishly and the sounds are distant; the J waves are silent. HR-low alarm below the 50 bpm limit." },
  digoxin_effect: { s4: 0.5, note: "Regular and unremarkable at therapeutic levels. Toxicity is what becomes audible — variable S1 as AV block and ectopy appear." },
  wpw: { qrsWidth: 1.4, s1: 1.3,
    note: "Regular with a LOUD S1 — the short PR means the AV valves are still fully open when the ventricle fires. Pre-excitation shortens the mechanical PR just as it shortens the electrical one." },
  paced_ventricular: { qrsWidth: 2.0, split: -40, s4: 0,
    note: "Machine-perfect regularity — no respiratory variation at all, which is itself the giveaway. The pacing spike makes no sound. RV pacing activates the ventricles like an LBBB, so S2 splits paradoxically, and with no AV synchrony there is no S4." },
  paced_dual: { qrsWidth: 1.9, split: -35, s4: 0.6,
    note: "Machine-regular, but AV synchrony is restored — the atrial kick is timed, so an S4-like atrial sound returns ahead of S1. RV pacing still reverses the S2 split." },
  junctional_escape: { s1: 1.15, s4: 0, alarm: "medium",
    note: "Slow, regular, and S1 is loud: retrograde atrial activation contracts the atria almost simultaneously with the ventricles, so the valves are still wide open. Cannon a-waves are visible in the neck on every beat. HR-low alarm." },
  aivr: { rPhase: 0.165, dissoc: true, s4: 0,
    note: "Slow, wide and regular at 75 with a randomly varying S1 — the atria are dissociated, so leaflet position differs each beat. Occasional cannon sounds. Benign reperfusion rhythm: it sounds far less alarming than VT because it is." },
};

/* Beat clock. Emits beats with real R-R intervals and the auscultation
   parameters that go with them. Deterministic (seeded) so a rhythm sounds
   the same every time it is selected. */
function makeBeatClock(rhythm) {
  const def = RHYTHMS[rhythm] || RHYTHMS.normal_sinus;
  const prof = RHYTHM_AUDIO[rhythm] || {};
  const nominal = def.bpm > 0 ? 60 / def.bpm : 1;
  let seed = 0x1f2e3d4;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.82; // ≈ N(0,1)

  let idx = -1, tNow = 0, prevDur = nominal;

  function build(i, startT) {
    const g = prof.group || 1;
    const n = ((i % g) + g) % g;
    const priorDur = prevDur;   // length of the beat before this one
    const resp = Math.sin((startT / RESP_PERIOD) * Math.PI * 2); // +1 = peak inspiration
    const b = {
      i, n, t: startT, dur: nominal,
      qrs: !prof.silent, kind: "sinus",
      prDelay: prof.prDelay || 0,
      qrsWidth: prof.qrsWidth || 1,
      s1: prof.s1 !== undefined ? prof.s1 : 1,
      s2: prof.s2 !== undefined ? prof.s2 : 1,
      s3: 0,
      s4: prof.s4 !== undefined ? prof.s4 : 0,
      rub: !!prof.rub,
      // S2 split. Physiologic: near-fused on expiration, 50–60 ms at end-
      // inspiration. A fixed positive value (RBBB) is a wide split that widens
      // further with inspiration; a negative value (LBBB, RV pacing) is the
      // reversed split, audible on expiration and narrowing on inspiration.
      split: prof.split === undefined ? 12 + 45 * Math.max(0, resp)
           : prof.split < 0 ? prof.split * (1 - 0.75 * Math.max(0, resp))
           : prof.split * (1 + 0.3 * Math.max(0, resp)),
      resp,
    };

    // Respiratory sinus arrhythmia — inspiration shortens the cycle.
    if (prof.rsa) b.dur = nominal * (1 - prof.rsa * resp);

    // Atrial fibrillation: irregularly irregular, log-normal R-R about the mean,
    // floored at the AV node's refractory period, with concealed-conduction pauses.
    if (prof.af) {
      // 0.87 compensates for the upward skew of the log-normal plus the
      // concealed-conduction pauses, so the mean R-R still lands on the rate.
      let d = nominal * 0.87 * Math.exp(0.21 * gauss());
      if (rnd() < 0.22) d *= 1.25 + 0.35 * rnd();          // concealed conduction
      d = Math.min(1.7, Math.max(0.30, d));
      if (Math.abs(d - priorDur) < 0.02) d += (d >= priorDur ? 0.03 : -0.03); // always > 20 ms apart
      b.dur = Math.min(1.7, Math.max(0.30, d));
      // Preceding cycle sets leaflet position (S1) and filling (S2 / pulse).
      const f = priorDur / nominal;
      b.s1 = Math.min(1.6, Math.max(0.40, 2.0 - 1.05 * f));
      b.s2 = Math.min(1.15, Math.max(0, (f - 0.30) / 0.85));
    }

    // Wenckebach: PR grows by shrinking increments, so R-R progressively shortens
    // before the dropped beat. P-P stays constant.
    if (prof.wenckebach) {
      const PP = nominal, PR = [0.16, 0.28, 0.34];
      if (n === 3) { b.qrs = false; b.kind = "dropped"; b.dur = PP; b.s1 = 0; b.s2 = 0; b.s4 = 0; }
      else {
        b.prDelay = [0, 0.4, 0.8][n];
        b.dur = n === 0 ? PP + (PR[1] - PR[0])
              : n === 1 ? PP + (PR[2] - PR[1])
              :           PP - (PR[2] - PR[0]);
        b.s1 = 1.25 - 0.55 * (PR[n] - PR[0]) / 0.18;  // softer as PR lengthens
        b.s4 = 0.4;
      }
    }

    // Mobitz II: constant PR, sudden dropped beat, pause = exactly two cycles.
    if (prof.group === 3 && rhythm === "second_degree_type2" && n === 2) {
      b.qrs = false; b.kind = "dropped"; b.s1 = 0; b.s2 = 0; b.s4 = 0;
    }

    // Complete heart block: S1 intensity set by wherever the dissociated P
    // happens to fall relative to this QRS. Matches the P waves being drawn.
    if (prof.chb) {
      const aP = 60 / (prof.atrialRate || 75);
      const tQRS = startT + b.dur * (prof.rPhase || 0.2);
      const lastP = Math.floor((tQRS - aP * 0.115) / aP) * aP + aP * 0.115;
      const pr = tQRS - lastP;
      // S1 intensity vs PR (Circulation 1974;50:17): loudest when the leaflets
      // are still maximally open at ~0.14 s, falling away as PR lengthens, and
      // rising slightly again past 0.50 s when the mitral valve reopens.
      b.s1 = pr < 0.05  ? 0.60 + 6.0 * pr
           : pr <= 0.14 ? 0.90 + 7.8 * (pr - 0.05)
           : pr <= 0.50 ? Math.max(0.35, 1.60 - 2.9 * (pr - 0.14))
           :              0.70;
      if (b.s1 > 1.45) b.kind = "cannon";              // bruit de canon
      b.pr = pr;
    }

    // AV dissociation without a modelled atrial trace (VT, AIVR): S1 wanders.
    if (prof.dissoc) {
      b.s1 = 0.45 + 1.15 * rnd();
      if (b.s1 > 1.45) b.kind = "cannon";
    }
    if (prof.jitter) b.dur = nominal + (rnd() - 0.5) * 2 * prof.jitter;

    // PVCs: early beat, then a FULL compensatory pause — the interval spanning
    // the ectopic equals two sinus cycles.
    if (prof.pvcAt) {
      const k = prof.pvcAt.indexOf(n);
      const nextIsPvc = prof.pvcAt.indexOf((n + 1) % g);
      const prevWasPvc = prof.pvcAt.includes((n - 1 + g) % g);
      if (k >= 0) {
        b.kind = "pvc";
        b.dur = 2 * nominal - nominal * prof.coupling[k];  // full compensatory pause
        b.s1 = 1.35;                                       // sharp, loud
        b.s2 = 0.15;                                       // ejects almost nothing
        b.s4 = 0;
        b.rPhase = n === 5 ? 0.128 : 0.117;
      } else if (nextIsPvc >= 0) {
        // sinus beat immediately before the ectopic — cut short by it
        b.dur = nominal * prof.coupling[nextIsPvc];
      } else if (prevWasPvc) {
        b.s1 = 1.3;   // post-extrasystolic potentiation after the long pause
        b.s2 = 1.15;
      }
    }

    // Morphology reference: long beats keep normal wave widths and gain flat
    // diastole; genuinely early beats compress rather than truncate mid-T.
    b.ref = Math.min(nominal, Math.max(b.dur / MORPH_EXTENT, nominal * 0.55));
    if (b.rPhase === undefined) {
      b.rPhase = prof.rPhase !== undefined ? prof.rPhase
               : 0.24 + b.prDelay * 0.1 + 0.026 * b.qrsWidth;
    }
    // Weissler QS2 from the PRECEDING cycle — filling time sets ejection time.
    b.qs2 = qs2Seconds(60 / Math.max(0.25, priorDur));
    prevDur = b.dur;
    return schedule(b);
  }

  /* Turn a beat into a list of [seconds-after-beat-start, sound] events.
     A beat with no QRS produces none at all — that is the point. */
  function schedule(b) {
    b.ev = [];
    if (!b.qrs) return b;
    const r = b.rPhase * b.ref;                       // R wave / S1
    if (b.s4 > 0 && r - 0.065 > 0.002) b.ev.push([r - 0.065, "s4"]);
    b.ev.push([r, "s1"]);
    // S1 → S2 is Weissler's QS2 measured from QRS ONSET, and S1 lags onset ~30 ms.
    const s2t = Math.min(r + b.qs2 - 0.03, b.dur * 0.94);
    if (b.s2 > 0.01 && s2t > r) b.ev.push([s2t, "s2"]);
    if (b.s3 > 0) {
      const t3 = Math.min(s2t + 0.14, b.dur * 0.97);
      if (t3 > s2t) b.ev.push([t3, "s3"]);
    }
    if (b.rub) {  // triphasic: atrial systole, ventricular systole, early diastole
      b.ev.push([Math.max(0.002, r - 0.05), "rub"]);
      b.ev.push([r + 0.07, "rub"]);
      b.ev.push([Math.min(s2t + 0.09, b.dur * 0.96), "rub"]);
    }
    b.ev.sort((x, y) => x[0] - y[0]);
    return b;
  }

  return {
    nominal,
    profile: prof,
    next() { idx += 1; const b = build(idx, tNow); tNow += b.dur; return b; },
    reset() { idx = -1; tNow = 0; prevDur = nominal; seed = 0x1f2e3d4; },
  };
}

/* ═══════════════════ WAVEFORM GENERATOR ═══════════════════ */

// Polarity controls QRS/P/T flip (axis-driven, e.g. aVR).
// ST shift / U / J / delta / pacing-spike overlays are absolute — they encode
// the directly-visible-on-screen direction in that lead, so they are NOT
// multiplied by polarity (otherwise a manually specified reciprocal ST↓ in
// aVR would invert and read as elevation).
function normalBeat(phase, opts = {}) {
  const {
    prDelay = 0, qrsWidth = 1, rAmp = 1, pAmp = 1, tAmp = 1,
    qrsNotch = false, deepS = false, bigQ = false, tInvert = false, longQT = false,
    polarity = 1,
    stShift = 0,           // mV-equivalent vertical ST baseline offset (+ = elevation)
    stShape = "flat",      // "flat" | "concave" | "convex" | "scoop" | "coved" | "upslope"
    prDepress = 0,         // PR-segment depression (pericarditis)
    uWave = 0,             // U-wave amplitude (hypokalaemia)
    jWave = 0,             // Osborn wave amplitude (hypothermia)
    deltaWave = 0,         // pre-excitation slurred upstroke (WPW)
    pacingSpike = false,   // ventricular pacing spike before QRS
    atrialSpike = false,   // atrial pacing spike before P
    biphasicT = false,     // Wellens Type A biphasic T
    deWinter = false,      // upsloping ST↓ + tall symmetric T
    sineWaveQRS = false,   // late hyperK fused QRS-T sine
    peakedT = false,       // hyperK tall narrow T
    pWaveInverted = false, // junctional retrograde P
    suppressP = false,
  } = opts;

  if (sineWaveQRS) {
    // Severe hyperkalaemia: QRS and T merge into a sine wave at ~rate
    return polarity * (Math.sin(phase * Math.PI * 2) * 0.55 * rAmp);
  }

  let val = 0;
  const pS = 0.06 + prDelay * 0.08;
  const pE = 0.17 + prDelay * 0.04;

  if (!suppressP && phase >= pS && phase <= pE) {
    const pSign = pWaveInverted ? -1 : 1;
    val = polarity * pSign * 0.15 * pAmp * Math.sin(((phase - pS) / (pE - pS)) * Math.PI);
  }
  if (atrialSpike && phase >= pS - 0.014 && phase < pS - 0.006) {
    val += 0.55;
  }
  // PR-segment depression (pericarditis): pulls baseline down from P-end to QRS
  if (prDepress > 0 && phase > pE && phase < (0.24 + prDelay * 0.1)) {
    val -= prDepress;
  }

  const qS = 0.24 + prDelay * 0.1;
  const qE = qS + 0.065 * qrsWidth;

  // Delta wave (WPW): slurred upstroke that begins before normal Q
  if (deltaWave > 0 && phase >= qS - 0.035 && phase < qS) {
    const dp = (phase - (qS - 0.035)) / 0.035;
    val += polarity * deltaWave * 0.45 * dp;
  }
  // Ventricular pacing spike — sharp narrow positive spike at QRS onset
  if (pacingSpike && phase >= qS - 0.014 && phase < qS - 0.006) {
    val += 0.7;
  }

  if (phase >= qS && phase <= qE) {
    const q = (phase - qS) / (qE - qS);
    const qD = bigQ ? 0.25 : 0.1;
    let qv = 0;
    if (q < 0.15) qv = -qD * (q / 0.15);
    else if (q < 0.4) qv = -qD + (rAmp + qD) * ((q - 0.15) / 0.25);
    else if (q < 0.65) { qv = rAmp * (1 - (q - 0.4) / 0.25); if (qrsNotch && q > 0.48 && q < 0.58) qv += 0.15 * rAmp; }
    else { const sD = deepS ? 0.35 : 0.17; qv = -sD * (1 - (q - 0.65) / 0.35); }
    val = polarity * qv;
  }

  // Osborn / J wave — small positive notch at end of QRS (lateral leads in hypothermia)
  if (jWave > 0 && phase >= qE - 0.006 && phase <= qE + 0.028) {
    const jp = (phase - (qE - 0.006)) / 0.034;
    val += jWave * Math.sin(jp * Math.PI);
  }

  const tGap = longQT ? 0.10 : 0.06;
  const tWidth = longQT ? 0.28 : (peakedT ? 0.13 : 0.17);
  const tS = qE + tGap;
  const tE = tS + tWidth;

  // ST segment baseline (between J point and T onset)
  if (phase >= qE && phase < tS) {
    const stp = (phase - qE) / tGap;
    let stBase = stShift;
    if (stShape === "concave") stBase = stShift * (0.5 + 0.5 * stp);              // pericarditis concave up
    else if (stShape === "convex") stBase = stShift * (1.0 - 0.15 * (1 - stp));   // tombstone
    else if (stShape === "coved") stBase = stShift * (1.0 - 0.45 * stp);          // Brugada coved descent
    else if (stShape === "scoop") stBase = stShift - 0.08 * Math.sin(stp * Math.PI); // dig effect
    else if (stShape === "upslope" || deWinter) stBase = stShift * (1 - stp);
    val += stBase;
  }

  // T wave
  if (phase >= tS && phase <= tE) {
    const tp = (phase - tS) / (tE - tS);
    let tVal;
    if (longQT) {
      tVal = polarity * (tInvert ? -1 : 1) * 0.24 * tAmp * (Math.sin(tp * Math.PI) + 0.3 * Math.sin(tp * Math.PI * 2));
    } else if (biphasicT) {
      // Wellens Type A: small initial positive then deep symmetric negative
      tVal = polarity * (0.12 * tAmp * Math.sin(tp * Math.PI) - 0.45 * tAmp * Math.sin(tp * Math.PI * 2));
    } else if (peakedT) {
      // Hyperkalaemia: tall narrow symmetric T with pointed peak
      const t2 = tp * 2 - 1; // -1..1
      tVal = polarity * (tInvert ? -1 : 1) * 0.55 * tAmp * Math.max(0, 1 - t2 * t2);
    } else {
      tVal = polarity * (tInvert ? -1 : 1) * 0.24 * tAmp * Math.sin(tp * Math.PI);
    }
    // ST shift carries into T as a decaying baseline offset (J-point lift trails into T)
    let stCarry;
    if (stShape === "coved") stCarry = stShift * 0.4 * (1 - tp);
    else if (stShape === "convex") stCarry = stShift * 0.6 * (1 - tp);
    else stCarry = stShift * Math.max(0, 1 - tp * 1.4);
    val = tVal + stCarry;
  }

  // U wave (after T) — hypokalaemia, bradycardia
  if (uWave !== 0) {
    const uS = tE + 0.02;
    const uE = uS + 0.13;
    if (phase >= uS && phase <= uE) {
      val += uWave * Math.sin(((phase - uS) / (uE - uS)) * Math.PI);
    }
  }

  return val;
}

// `beat` comes from makeBeatClock: it carries the beat's index within the
// rhythm's repeating group and its PR delay, so morphology and audio agree.
// `beatPhase` may exceed 1 — the excess is flat diastole after a long R-R.
function generateECGPoint(t, rhythm, beatPhase, leadMod, beat) {
  const ph = beatPhase;
  const bn = beat ? beat.n : 0;
  const lm = leadMod || LEAD_MODS.II;
  const ax = lm.axis || 1;

  // pick(extraVal, leadVal, default) — prefer per-call override, fall back to per-lead mod
  const pick = (a, b, d = 0) => (a !== undefined ? a : (b !== undefined ? b : d));

  // Apply lead modifiers to normalBeat. ST/U/J/delta/spike overlays come from
  // the rhythm-lead override (lm.stShift etc.) unless explicitly overridden.
  function leadNormal(phase, extra = {}) {
    return normalBeat(phase, {
      polarity: ax,
      pAmp: (extra.pAmp || 1) * (lm.pAmp || 1),
      rAmp: (extra.rAmp || 1) * (lm.rAmp || 1),
      deepS: extra.deepS || lm.sD > 0.3,
      tAmp: (extra.tAmp || 1) * (lm.tAmp || 1),
      tInvert: extra.tInvert || lm.tInv || false,
      prDelay: extra.prDelay || 0,
      qrsWidth: extra.qrsWidth || 1,
      qrsNotch: extra.qrsNotch || lm.qrsNotch || false,
      bigQ: extra.bigQ || lm.bigQ || false,
      longQT: extra.longQT || false,
      stShift: pick(extra.stShift, lm.stShift, 0),
      stShape: extra.stShape || lm.stShape || "flat",
      prDepress: pick(extra.prDepress, lm.prDepress, 0),
      uWave: pick(extra.uWave, lm.uWave, 0),
      jWave: pick(extra.jWave, lm.jWave, 0),
      deltaWave: pick(extra.deltaWave, lm.deltaWave, 0),
      pacingSpike: extra.pacingSpike || lm.pacingSpike || false,
      atrialSpike: extra.atrialSpike || lm.atrialSpike || false,
      biphasicT: extra.biphasicT || lm.biphasicT || false,
      deWinter: extra.deWinter || lm.deWinter || false,
      sineWaveQRS: extra.sineWaveQRS || false,
      peakedT: extra.peakedT || lm.peakedT || false,
      pWaveInverted: extra.pWaveInverted || false,
      suppressP: extra.suppressP || false,
    });
  }

  if (rhythm === "normal_sinus" || rhythm === "sinus_bradycardia" || rhythm === "sinus_tachycardia") {
    return leadNormal(ph);
  }

  if (rhythm === "long_qt") {
    return leadNormal(ph, { longQT: true, tAmp: 1.2 });
  }

  if (rhythm === "svt") {
    if (ph > 0.30 && ph < 0.36) {
      const q = (ph-0.30)/0.06;
      const v = q<0.15 ? -0.08*(q/0.15) : q<0.45 ? -0.08+1.15*((q-0.15)/0.3) : q<0.75 ? 1.07*(1-(q-0.45)/0.3) : -0.1*(1-(q-0.75)/0.25);
      return ax * v * (lm.rAmp||1);
    }
    if (ph > 0.40 && ph < 0.55) return ax * 0.22 * (lm.tAmp||1) * Math.sin(((ph-0.40)/0.15)*Math.PI);
    return 0;
  }

  if (rhythm === "atrial_fibrillation") {
    const fib = (Math.sin(t*37)*0.022+Math.sin(t*61)*0.018+Math.sin(t*89)*0.012+Math.sin(t*127)*0.008+Math.sin(t*173)*0.006) * (lm.pAmp||1);
    if (ph > 0.34 && ph < 0.40) {
      const q = (ph-0.34)/0.06;
      const v = q<0.15 ? -0.1*(q/0.15) : q<0.42 ? -0.1+1.1*((q-0.15)/0.27) : q<0.7 ? 1.0*(1-(q-0.42)/0.28) : -0.18*(1-(q-0.7)/0.3);
      return fib + ax * v * (lm.rAmp||1);
    }
    if (ph > 0.47 && ph < 0.62) return fib + ax * 0.2*(lm.tAmp||1)*Math.sin(((ph-0.47)/0.15)*Math.PI);
    return fib;
  }

  if (rhythm === "atrial_flutter") {
    const cp = (ph*8)%1;
    const fl = (cp<0.65 ? -0.14*(cp/0.65) : -0.14+0.14*((cp-0.65)/0.35)+0.06*Math.sin(((cp-0.65)/0.35)*Math.PI)) * (lm.pAmp||1);
    if (ph > 0.36 && ph < 0.42) {
      const q = (ph-0.36)/0.06;
      const v = q<0.18 ? -0.08*(q/0.18) : q<0.48 ? -0.08+1.0*((q-0.18)/0.3) : q<0.78 ? 0.92*(1-(q-0.48)/0.3) : -0.12*(1-(q-0.78)/0.22);
      return fl + ax*v*(lm.rAmp||1);
    }
    if (ph > 0.50 && ph < 0.63) return fl + ax*0.16*(lm.tAmp||1)*Math.sin(((ph-0.50)/0.13)*Math.PI);
    return fl;
  }

  if (rhythm === "first_degree_block") return leadNormal(ph, { prDelay:1 });

  if (rhythm === "second_degree_type1") {
    // Beat 3 of the group is the dropped one: a P wave with no QRS behind it.
    if (bn===3) { if (ph>0.06&&ph<0.17) return ax*0.15*(lm.pAmp||1)*Math.sin(((ph-0.06)/0.11)*Math.PI); return 0; }
    return leadNormal(ph, { prDelay: beat ? beat.prDelay : [0,0.4,0.8][bn] });
  }

  if (rhythm === "second_degree_type2") {
    if (bn===2) { if (ph>0.06&&ph<0.17) return ax*0.15*(lm.pAmp||1)*Math.sin(((ph-0.06)/0.11)*Math.PI); return 0; }
    return leadNormal(ph, { qrsWidth:1.4 });
  }

  if (rhythm === "third_degree_block") {
    const pPh = (t*75/60)%1;
    let pV = 0;
    if (pPh>0.05&&pPh<0.18) pV = ax*0.15*(lm.pAmp||1)*Math.sin(((pPh-0.05)/0.13)*Math.PI);
    let vV = 0;
    if (ph>0.15&&ph<0.30) { const q=(ph-0.15)/0.15; vV = q<0.1?-0.12*(q/0.1):q<0.35?-0.12+0.92*((q-0.1)/0.25):q<0.65?0.8*(1-(q-0.35)/0.3):-0.2*(1-(q-0.65)/0.35); vV *= ax*(lm.rAmp||1); }
    if (ph>0.40&&ph<0.60) vV = ax*0.2*(lm.tAmp||1)*Math.sin(((ph-0.40)/0.20)*Math.PI);
    return pV+vV;
  }

  if (rhythm === "ventricular_tachycardia") {
    if (ph<0.58) { const p=ph/0.58; return ax*(Math.sin(p*Math.PI*1.7-0.2)*0.55+((p>0.12&&p<0.42)?Math.sin(((p-0.12)/0.3)*Math.PI)*0.6:0))*(lm.rAmp||1); }
    return Math.sin(ph*14)*0.02;
  }

  if (rhythm === "ventricular_fibrillation") {
    return (Math.sin(t*15.3)*0.35*Math.sin(t*1.7+0.5)+Math.sin(t*22.7)*0.25*Math.cos(t*2.3)+Math.sin(t*8.1)*0.15+Math.sin(t*37.4)*0.08+Math.sin(t*51.2)*0.04)*(lm.rAmp||1);
  }

  if (rhythm === "asystole") return (Math.sin(t*47)*0.008+Math.sin(t*91)*0.004+Math.sin(t*23)*0.003);

  if (rhythm === "torsades") {
    const env = 0.3+0.7*Math.abs(Math.sin(t*0.8));
    const axR = Math.sin(t*1.2);
    return (Math.sin(t*18+axR*2)*env*0.7+Math.sin(t*25)*0.1*env)*(lm.rAmp||1);
  }

  if (rhythm === "lbbb") return leadNormal(ph, { qrsWidth:2.0, qrsNotch:true, rAmp:0.85, tInvert:true, tAmp:0.6 });
  if (rhythm === "rbbb") return leadNormal(ph, { qrsWidth:1.8, deepS:true, rAmp:0.9, tAmp:0.8 });
  if (rhythm === "pe_s1q3t3") return leadNormal(ph, { rAmp:0.75, bigQ:true, tInvert:true, tAmp:0.5 });

  if (rhythm === "unifocal_pvc") {
    if (bn===3) {
      if (ph<0.06) return 0;
      if (ph>0.06&&ph<0.22) { const q=(ph-0.06)/0.16; const v = q<0.08?-0.25*(q/0.08):q<0.35?-0.25+1.35*((q-0.08)/0.27):q<0.65?1.1*(1-(q-0.35)/0.3):-0.3*(1-(q-0.65)/0.35); return ax*v*(lm.rAmp||1); }
      if (ph>0.26&&ph<0.40) return ax*-0.3*(lm.tAmp||1)*Math.sin(((ph-0.26)/0.14)*Math.PI);
      return 0;
    }
    return leadNormal(ph);
  }

  /* ── Ischemia / infarction ───────────────────────────
     ST shifts and reciprocal changes live in RHYTHM_LEAD_OVERRIDES;
     the engine just delegates to leadNormal which picks them up via lm. ── */
  if (rhythm === "stemi_anterior" || rhythm === "stemi_inferior" ||
      rhythm === "stemi_lateral"  || rhythm === "stemi_posterior" ||
      rhythm === "stemi_rv"       || rhythm === "wellens" ||
      rhythm === "dewinter"       || rhythm === "pericarditis" ||
      rhythm === "brugada"        || rhythm === "hypothermia" ||
      rhythm === "hypokalemia"    || rhythm === "digoxin_effect") {
    return leadNormal(ph);
  }

  /* ── Hyperkalaemia: mild = tall peaked T globally ── */
  if (rhythm === "hyperkalemia_mild") {
    return leadNormal(ph, { peakedT: true, tAmp: 1.6, pAmp: 0.6 });
  }
  /* ── Hyperkalaemia: severe = sine wave (no P, fused QRS-T) ── */
  if (rhythm === "hyperkalemia_severe") {
    return leadNormal(ph, { sineWaveQRS: true, suppressP: true });
  }

  /* ── WPW: short PR + delta wave + slightly wide QRS ── */
  if (rhythm === "wpw") {
    return leadNormal(ph, { qrsWidth: 1.4, deltaWave: 0.6 });
  }

  /* ── Ventricular paced: pacing spike + wide LBBB-like QRS, no native P ── */
  if (rhythm === "paced_ventricular") {
    return leadNormal(ph, {
      suppressP: true,
      pacingSpike: true,
      qrsWidth: 2.0,
      qrsNotch: true,
      rAmp: 0.85,
      tInvert: true,
      tAmp: 0.6,
    });
  }

  /* ── Dual-chamber (DDD) paced: atrial spike + P + V spike + wide QRS ── */
  if (rhythm === "paced_dual") {
    return leadNormal(ph, {
      atrialSpike: true,
      pacingSpike: true,
      qrsWidth: 1.9,
      qrsNotch: true,
      rAmp: 0.85,
      tInvert: true,
      tAmp: 0.6,
    });
  }

  /* ── Junctional escape: narrow QRS, inverted/absent P ── */
  if (rhythm === "junctional_escape") {
    return leadNormal(ph, { suppressP: true });
  }

  /* ── AIVR: wide regular QRS, no P (like a slow VT morphology) ── */
  if (rhythm === "aivr") {
    if (ph < 0.55) {
      const p = ph / 0.55;
      return ax * (Math.sin(p * Math.PI * 1.6 - 0.15) * 0.45
        + ((p > 0.15 && p < 0.45) ? Math.sin(((p - 0.15) / 0.30) * Math.PI) * 0.55 : 0))
        * (lm.rAmp || 1);
    }
    return Math.sin(ph * 11) * 0.015;
  }

  if (rhythm === "multifocal_pvc") {
    if (bn===2) {
      if (ph>0.05&&ph<0.22) { const q=(ph-0.05)/0.17; const v = q<0.1?-0.2*(q/0.1):q<0.4?-0.2+1.4*((q-0.1)/0.3):q<0.7?1.2*(1-(q-0.4)/0.3):-0.25*(1-(q-0.7)/0.3); return ax*v*(lm.rAmp||1); }
      if (ph>0.26&&ph<0.38) return ax*-0.25*(lm.tAmp||1)*Math.sin(((ph-0.26)/0.12)*Math.PI);
      return 0;
    }
    if (bn===5) {
      if (ph>0.04&&ph<0.20) { const q=(ph-0.04)/0.16; const v = q<0.1?0.15*(q/0.1):q<0.4?0.15-1.25*((q-0.1)/0.3):q<0.7?-1.1*(1-(q-0.4)/0.3)*0.8:0.2*(1-(q-0.7)/0.3); return ax*v*(lm.rAmp||1); }
      if (ph>0.24&&ph<0.36) return ax*0.2*(lm.tAmp||1)*Math.sin(((ph-0.24)/0.12)*Math.PI);
      return 0;
    }
    return leadNormal(ph);
  }

  return leadNormal(ph);
}

/* ══════════════════════ CANVAS ══════════════════════ */

function ECGCanvas({ rhythm, isRunning, speed, height=230, leadName="II", onBeat }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dataRef = useRef([]);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const clockRef = useRef(null);
  const beatRef = useRef(null);
  const elapsedRef = useRef(0);
  // Kept in a ref so changing the handler doesn't tear down the animation loop.
  const onBeatRef = useRef(onBeat);
  useEffect(()=>{ onBeatRef.current = onBeat; },[onBeat]);

  // Compute lead modifier with rhythm-specific overrides
  const leadMod = useMemo(() => {
    const base = LEAD_MODS[leadName] || LEAD_MODS.II;
    const overrides = RHYTHM_LEAD_OVERRIDES[rhythm];
    if (overrides && overrides[leadName]) return { ...base, ...overrides[leadName] };
    return base;
  }, [rhythm, leadName]);

  const draw = useCallback((ts) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio||1;
    const r = c.getBoundingClientRect();
    const w = r.width, h = r.height;
    c.width = w*dpr; c.height = h*dpr; ctx.scale(dpr,dpr);
    const dt = lastFrameRef.current ? Math.min((ts-lastFrameRef.current)/1000, 0.05) : 0.016;
    lastFrameRef.current = ts;

    if (isRunning) {
      if (!clockRef.current) { clockRef.current = makeBeatClock(rhythm); beatRef.current = clockRef.current.next(); elapsedRef.current = 0; }
      const pps = 85*speed;
      const n = Math.max(1, Math.round(pps*dt));
      const step = 1/pps;
      for (let i=0;i<n;i++) {
        timeRef.current += step;
        let beat = beatRef.current;
        const from = elapsedRef.current;
        let to = from + step;
        // Sound events sit at real times inside the beat, so a dropped QRS or a
        // compensatory pause is genuinely silent rather than beeping on schedule.
        if (onBeatRef.current) {
          for (const [when, kind] of beat.ev) if (when>from && when<=to) onBeatRef.current(kind, beat);
        }
        if (to >= beat.dur) {
          to -= beat.dur;
          beat = beatRef.current = clockRef.current.next();
          if (onBeatRef.current) {
            for (const [when, kind] of beat.ev) if (when<=to) onBeatRef.current(kind, beat);
          }
        }
        elapsedRef.current = to;
        dataRef.current.push(generateECGPoint(timeRef.current, rhythm, to/beat.ref, leadMod, beat));
      }
      if (dataRef.current.length > w+20) dataRef.current = dataRef.current.slice(-(Math.floor(w)+20));
    }

    ctx.fillStyle = "#070c18"; ctx.fillRect(0,0,w,h);
    const gs=18;
    ctx.strokeStyle="rgba(34,197,94,0.05)";ctx.lineWidth=0.5;
    for(let x=0;x<w;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    ctx.strokeStyle="rgba(34,197,94,0.11)";ctx.lineWidth=0.8;
    for(let x=0;x<w;x+=gs*5){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=gs*5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}

    // 1 mV / 200 ms calibration square wave (left edge, mid-baseline)
    {
      const bY = h*0.52;
      const sY = h*0.34;        // matches waveform scaling — 1mV → sY pixels
      const calX = 8;
      const calW = gs*5;        // 5 small squares = 200ms at 25mm/s
      ctx.strokeStyle = "rgba(148,163,184,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(calX, bY);
      ctx.lineTo(calX + calW*0.2, bY);
      ctx.lineTo(calX + calW*0.2, bY - sY);
      ctx.lineTo(calX + calW*0.8, bY - sY);
      ctx.lineTo(calX + calW*0.8, bY);
      ctx.lineTo(calX + calW, bY);
      ctx.stroke();
      ctx.fillStyle = "rgba(148,163,184,0.55)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("1mV", calX + calW + 4, bY - sY + 8);
    }

    const data=dataRef.current;
    if(data.length>1){
      const bY=h*0.52, sY=h*0.34, rc=RHYTHMS[rhythm].color, len=data.length, sx=w-len;
      ctx.save();ctx.shadowColor=rc;ctx.shadowBlur=12;ctx.strokeStyle=rc;ctx.lineWidth=1.8;ctx.lineJoin="round";ctx.lineCap="round";ctx.globalAlpha=0.4;
      ctx.beginPath();for(let i=0;i<len;i++){const x=sx+i,y=bY-data[i]*sY;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}ctx.stroke();ctx.restore();
      ctx.lineWidth=2;ctx.lineJoin="round";ctx.lineCap="round";
      for(let i=1;i<len;i++){const a=Math.round(Math.pow(i/len,2.5)*255);ctx.strokeStyle=rc+(a<16?"0":"")+a.toString(16);ctx.beginPath();ctx.moveTo(sx+i-1,bY-data[i-1]*sY);ctx.lineTo(sx+i,bY-data[i]*sY);ctx.stroke()}
      ctx.strokeStyle="#fff";ctx.lineWidth=2.4;ctx.shadowColor="#fff";ctx.shadowBlur=5;ctx.beginPath();
      for(let i=Math.max(0,len-4);i<len;i++){i===Math.max(0,len-4)?ctx.moveTo(sx+i,bY-data[i]*sY):ctx.lineTo(sx+i,bY-data[i]*sY)}ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle="#fff";ctx.shadowColor=rc;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(sx+len-1,bY-data[len-1]*sY,2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    animRef.current = requestAnimationFrame(draw);
  }, [rhythm, isRunning, speed, leadMod]);

  useEffect(()=>{animRef.current=requestAnimationFrame(draw);return()=>{if(animRef.current)cancelAnimationFrame(animRef.current)}},[draw]);
  useEffect(()=>{
    dataRef.current=[];timeRef.current=0;lastFrameRef.current=0;elapsedRef.current=0;
    clockRef.current=makeBeatClock(rhythm);beatRef.current=clockRef.current.next();
  },[rhythm,leadName]);

  return <canvas ref={canvasRef} style={{width:"100%",height,display:"block"}}/>;
}

/* Mini canvas for 12-lead grid (no glow, thinner) */
function MiniECGCanvas({ rhythm, isRunning, speed, leadName, height=70 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dataRef = useRef([]);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const clockRef = useRef(null);
  const beatRef = useRef(null);
  const elapsedRef = useRef(0);

  const leadMod = useMemo(() => {
    const base = LEAD_MODS[leadName] || LEAD_MODS.II;
    const ov = RHYTHM_LEAD_OVERRIDES[rhythm];
    if (ov && ov[leadName]) return { ...base, ...ov[leadName] };
    return base;
  }, [rhythm, leadName]);

  const draw = useCallback((ts) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio||1;
    const r = c.getBoundingClientRect();
    const w = r.width, h = r.height;
    c.width = w*dpr; c.height = h*dpr; ctx.scale(dpr,dpr);
    const dt = lastFrameRef.current ? Math.min((ts-lastFrameRef.current)/1000, 0.05) : 0.016;
    lastFrameRef.current = ts;

    if (isRunning) {
      if (!clockRef.current) { clockRef.current = makeBeatClock(rhythm); beatRef.current = clockRef.current.next(); elapsedRef.current = 0; }
      const pps = 60*speed;
      const n = Math.max(1, Math.round(pps*dt));
      const step = 1/pps;
      for (let i=0;i<n;i++) {
        timeRef.current += step;
        let beat = beatRef.current;
        let to = elapsedRef.current + step;
        if (to >= beat.dur) { to -= beat.dur; beat = beatRef.current = clockRef.current.next(); }
        elapsedRef.current = to;
        dataRef.current.push(generateECGPoint(timeRef.current, rhythm, to/beat.ref, leadMod, beat));
      }
      if (dataRef.current.length > w+10) dataRef.current = dataRef.current.slice(-(Math.floor(w)+10));
    }

    ctx.fillStyle = "#070c18"; ctx.fillRect(0,0,w,h);
    // Light grid
    ctx.strokeStyle="rgba(34,197,94,0.04)";ctx.lineWidth=0.5;
    for(let x=0;x<w;x+=12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=12){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}

    const data=dataRef.current;
    if(data.length>1){
      const bY=h*0.52, sY=h*0.34, rc=RHYTHMS[rhythm].color, len=data.length, sx=w-len;
      ctx.strokeStyle=rc;ctx.lineWidth=1.2;ctx.lineJoin="round";ctx.lineCap="round";ctx.globalAlpha=0.8;
      ctx.beginPath();for(let i=0;i<len;i++){const x=sx+i,y=bY-data[i]*sY;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}ctx.stroke();ctx.globalAlpha=1;
    }
    animRef.current = requestAnimationFrame(draw);
  }, [rhythm, isRunning, speed, leadMod]);

  useEffect(()=>{animRef.current=requestAnimationFrame(draw);return()=>{if(animRef.current)cancelAnimationFrame(animRef.current)}},[draw]);
  useEffect(()=>{
    dataRef.current=[];timeRef.current=0;lastFrameRef.current=0;elapsedRef.current=0;
    clockRef.current=makeBeatClock(rhythm);beatRef.current=clockRef.current.next();
  },[rhythm,leadName]);

  return <canvas ref={canvasRef} style={{width:"100%",height,display:"block",borderRadius:4}}/>;
}

/* ═════════════════════ APP ═════════════════════ */

function PulsingHeart({ bpm, color }) {
  if (bpm===0) return <span style={{color,fontSize:18,opacity:0.4}}>—</span>;
  return <span style={{display:"inline-block",animation:`heartbeat ${60000/bpm}ms ease-in-out infinite`,color,fontSize:18}}>♥</span>;
}

function ShockBadge({ shockable }) {
  if (shockable === null) return null;
  return (
    <span style={{
      fontSize:11, fontWeight:700, letterSpacing:".08em", padding:"3px 8px", borderRadius:4,
      background: shockable ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.12)",
      color: shockable ? "#ef4444" : "#94a3b8",
      border: `1px solid ${shockable ? "rgba(239,68,68,0.3)" : "rgba(100,116,139,0.2)"}`,
    }}>
      {shockable ? "⚡ SHOCKABLE" : "✕ NON-SHOCKABLE"}
    </span>
  );
}

/* ─── Audio ────────────────────────────────────────────────────────────────
   Two modes, modelled on what each is in real life.

   MONITOR — the QRS tone a bedside monitor emits when it detects a QRS,
   plus IEC 60601-1-8 alarm bursts. Philips IntelliVue modulates the tone
   with SpO2 as f = 662 Hz / 2^((100 − SpO2)/24), so a normally saturated
   patient sits at 662 Hz; that is the pitch used here. Rhythms with no
   detectable QRS get no tone — only the alarm.

   AUSCULTATION — synthesised valve sounds. S1 is two components (M1 then
   T1 ≈ 25 ms later), 20–150 Hz, 70–150 ms long. S2 is A2 then P2 with a
   split that follows respiration (fused on expiration, 50–60 ms at end-
   inspiration), 50–250 Hz, 60–120 ms long, sharper and shorter than S1.
   S3, S4 and the pericardial friction rub are generated on demand.

   The AudioContext is created lazily on the user's first click, because
   browsers block audio started without a gesture.                          */
function createSoundEngine() {
  let ctx = null, master = null, noiseBuf = null;
  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const noise = (c) => {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  };

  /* Monitor QRS tone — short, click-like, fixed pitch at normal saturation. */
  const qrsTone = (spo2 = 100, vol = 0.22) => {
    const c = ensure(), t = c.currentTime;
    const f = 662 / Math.pow(2, (100 - Math.min(100, spo2)) / 24);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    g.connect(master);
    [[1, 1], [2, 0.18]].forEach(([mult, amp]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f * mult, t);
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t); o.stop(t + 0.1);
    });
  };

  /* Valve sound: band-limited noise for the body, a swept sine for the pitch. */
  const valve = (at, centre, dur, vol, q = 1.4) => {
    if (vol <= 0.001) return;
    const c = ensure(), t = c.currentTime + Math.max(0, at);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);

    const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(centre * 1.6, t); bp.Q.value = q;
    const ng = c.createGain(); ng.gain.value = 0.65;
    src.connect(bp).connect(ng).connect(g);
    src.start(t); src.stop(t + dur + 0.03);

    const o = c.createOscillator(), og = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(centre, t);
    o.frequency.exponentialRampToValueAtTime(centre * 0.6, t + dur);
    og.gain.value = 0.9;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + dur + 0.03);
  };

  // S1 — mitral (M1) then tricuspid (T1) ~25 ms later; low, long, dull.
  const s1 = (gain = 1) => {
    valve(0,     52, 0.115, 0.42 * gain, 1.2);
    valve(0.025, 62, 0.075, 0.16 * gain, 1.4);
  };
  // S2 — aortic (A2) then pulmonic (P2) at +split ms. Negative split = P2
  // first, i.e. the paradoxical/reversed split of LBBB and RV pacing.
  const s2 = (gain = 1, splitMs = 25) => {
    const s = Math.abs(splitMs) / 1000;
    const rev = splitMs < 0;
    valve(rev ? s : 0, 86, 0.070, 0.30 * gain, 1.6);              // A2
    valve(rev ? 0 : s, 78, 0.055, 0.17 * gain, 1.6);              // P2
  };
  const s3 = (gain = 1) => valve(0, 34, 0.090, 0.16 * gain, 1.0); // early-diastolic, dull
  const s4 = (gain = 1) => valve(0, 30, 0.075, 0.15 * gain, 1.0); // presystolic atrial kick

  // Pericardial friction rub — scratchy, leathery, high-pitched, superficial.
  const rub = (gain = 1) => {
    const c = ensure(), t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(520, t); bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    // Jagged envelope — the grating quality comes from the amplitude, not the pitch
    const steps = [0.10, 0.03, 0.13, 0.05, 0.09, 0.02];
    steps.forEach((v, i) => g.gain.linearRampToValueAtTime(v * gain, t + 0.012 + i * 0.018));
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.16);
  };

  /* IEC 60601-1-8 alarm bursts. A pulse carries a fundamental in 150–1000 Hz
     with at least four harmonics in 300–4000 Hz, all within 15 dB of each
     other, and rise/fall times of 10–20% of the pulse. High priority is a
     burst of five pulses grouped 3 + 2, and the burst repeats.             */
  let alarmNodes = [];
  const alarmPulse = (at, f0, dur, vol) => {
    const c = ensure(), t = c.currentTime + at;
    const g = c.createGain();
    alarmNodes.push(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.15);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(master);
    [[1, 1], [2, 0.5], [3, 0.36], [4, 0.26], [5, 0.2]].forEach(([m, a]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f0 * m, t);
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t); o.stop(t + dur + 0.01);
    });
  };
  // Returns the length of the sequence so the caller can time the repeat.
  const alarm = (priority) => {
    ensure();
    if (priority === "high") {
      const d = 0.14, gaps = [0.10, 0.10, 0.34, 0.10];
      let len = 0;
      for (let burst = 0; burst < 2; burst++) {
        let at = burst * 1.69;
        for (let p = 0; p < 5; p++) {
          alarmPulse(at, 494, d, 0.16);
          at += d + (gaps[p] || 0);
        }
        len = at + 0.35;
      }
      return len;
    }
    if (priority === "medium") {
      const d = 0.17;
      let at = 0;
      for (let p = 0; p < 3; p++) { alarmPulse(at, 392, d, 0.10); at += d + 0.13; }
      return at;
    }
    return 0;
  };
  // Alarm pulses are scheduled ahead of time, so leaving an arrest rhythm has
  // to tear the queued ones down or the alarm keeps sounding over the next.
  const stopAlarm = () => {
    const c = ctx;
    alarmNodes.forEach(g => {
      try { g.gain.cancelScheduledValues(c ? c.currentTime : 0); g.gain.value = 0; g.disconnect(); } catch (e) { /* already gone */ }
    });
    alarmNodes = [];
  };

  return { qrsTone, s1, s2, s3, s4, rub, alarm, stopAlarm, resume: () => ensure() };
}

/* Which alarm a bedside monitor would raise. Explicit red list first, then
   the default HR limits most units ship with (low 50, high 120). */
function alarmPriority(rhythm) {
  const prof = RHYTHM_AUDIO[rhythm] || {};
  if (prof.alarm !== undefined) return prof.alarm;
  const bpm = (RHYTHMS[rhythm] || {}).bpm || 0;
  if (bpm > 0 && (bpm < 50 || bpm > 120)) return "medium";
  return null;
}

/* ─── Lead-view diagrams ───────────────────────────────────────────────── */

// Annulus sector path, used for the LV short-axis wall segments.
function sector(cx, cy, rOuter, rInner, a0, a1) {
  const rad = d => (d * Math.PI) / 180;
  const p = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const [x0, y0] = p(rOuter, a0), [x1, y1] = p(rOuter, a1);
  const [x2, y2] = p(rInner, a1), [x3, y3] = p(rInner, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0},${y0} A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rInner},${rInner} 0 ${large} 0 ${x3},${y3} Z`;
}

// LV short-axis view: which wall does this lead face?
function HeartWallDiagram({ lead }) {
  const active = LEAD_TERRITORY[lead].zone;
  const walls = [
    { zone:"Anterior", a0:-135, a1:-45,  lx:100, ly:42  },
    { zone:"Lateral",  a0:-45,  a1:45,   lx:158, ly:104 },
    { zone:"Inferior", a0:45,   a1:135,  lx:100, ly:170 },
    { zone:"Septal",   a0:135,  a1:225,  lx:56,  ly:104 },
  ];
  return (
    <svg viewBox="0 0 200 200" style={{width:"100%",maxWidth:230,height:"auto",display:"block",margin:"0 auto"}}>
      {walls.map(w=>{
        const on = w.zone===active;
        const col = Object.values(LEAD_TERRITORY).find(t=>t.zone===w.zone).color;
        return (
          <g key={w.zone}>
            <path d={sector(100,104,66,36,w.a0,w.a1)}
              fill={on?col:`${col}22`} stroke={on?col:`${col}33`} strokeWidth={on?2:1}/>
            <text x={w.lx} y={w.ly} textAnchor="middle" fontSize="10"
              fill={on?"#fff":"#64748b"} fontWeight={on?700:500}>{w.zone}</text>
          </g>
        );
      })}
      {/* RV crescent, sitting against the septum */}
      <path d="M42,66 A62,62 0 0 0 42,142 A86,86 0 0 1 42,66 Z" fill="rgba(148,163,184,0.13)" stroke="rgba(148,163,184,0.3)" strokeWidth="1"/>
      <text x="30" y="108" textAnchor="middle" fontSize="8" fill="#64748b">RV</text>
      <text x="100" y="108" textAnchor="middle" fontSize="11" fill="#475569" fontWeight="700">LV</text>
      <text x="100" y="194" textAnchor="middle" fontSize="8" fill="#475569">LV short axis</text>
    </svg>
  );
}

// Where does the electrode physically go? Shows the six precordial positions
// (LITFL landmarks) plus the four limb electrodes, highlighting whichever the
// selected lead is actually derived from.
function TorsoDiagram({ lead }) {
  const info = LEAD_TERRITORY[lead];
  const isLimb = info.angle !== null;
  // Precordial dots with explicit label offsets — auto-placing them above each
  // dot made V3's label collide with V2's electrode.
  const dots = [
    { id:"V1", x:86,  y:96,  lx:86,  ly:85  },
    { id:"V2", x:112, y:96,  lx:112, ly:85  },
    { id:"V3", x:121, y:108, lx:134, ly:103 },
    { id:"V4", x:130, y:120, lx:128, ly:134 },
    { id:"V5", x:148, y:120, lx:148, ly:134 },
    { id:"V6", x:164, y:120, lx:166, ly:134 },
  ];
  // Limb electrodes sit on the limbs proper (torso placement is the Mason-Likar
  // monitoring variant, noted in the caption).
  const limbs = [
    { id:"RA", x:26,  y:52,  lx:26,  ly:40  },
    { id:"LA", x:174, y:52,  lx:174, ly:40  },
    { id:"RL", x:34,  y:176, lx:34,  ly:192 },
    { id:"LL", x:166, y:176, lx:166, ly:192 },
  ];
  const byId = Object.fromEntries(limbs.map(l=>[l.id,l]));
  const posEl = isLimb ? byId[info.pos] : null;
  const negEl = isLimb && info.neg ? byId[info.neg] : null;
  const col = info.color;
  return (
    <svg viewBox="0 0 200 200" style={{width:"100%",maxWidth:230,height:"auto",display:"block",margin:"0 auto"}}>
      {/* limb stubs */}
      <path d="M60,30 L30,50 M140,30 L170,50 M64,178 L38,176 M136,178 L162,176"
        fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1.2"/>
      {/* torso outline */}
      <path d="M60,26 Q100,16 140,26 L152,60 Q158,120 148,178 L52,178 Q42,120 48,60 Z"
        fill="rgba(148,163,184,0.05)" stroke="rgba(148,163,184,0.25)" strokeWidth="1.4"/>
      {/* sternum + ribs */}
      <line x1="100" y1="40" x2="100" y2="132" stroke="rgba(148,163,184,0.3)" strokeWidth="2.5"/>
      {[58,74,90,106,122].map((y,i)=>(
        <g key={i}>
          <path d={`M98,${y} Q72,${y+5} 54,${y+20}`} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1.2"/>
          <path d={`M102,${y} Q128,${y+5} 146,${y+20}`} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1.2"/>
        </g>
      ))}
      {/* lead vector between the two limb electrodes forming a bipolar lead */}
      {posEl && negEl && (
        <line x1={negEl.x} y1={negEl.y} x2={posEl.x} y2={posEl.y}
          stroke={col} strokeWidth="1.6" strokeDasharray="4 3" opacity="0.75"/>
      )}
      {/* precordial electrodes — dimmed when a limb lead is selected */}
      <g opacity={isLimb?0.28:1}>
        {dots.map(d=>{
          const on = d.id===lead;
          const dc = LEAD_TERRITORY[d.id].color;
          return (
            <g key={d.id}>
              {on && <circle cx={d.x} cy={d.y} r="11" fill={`${dc}33`}/>}
              <circle cx={d.x} cy={d.y} r={on?6:4.5} fill={dc} stroke={on?"#fff":"none"} strokeWidth="1.5"/>
              <text x={d.lx} y={d.ly} textAnchor="middle" fontSize="8"
                fill={on?"#fff":"#64748b"} fontWeight={on?700:500}>{d.id}</text>
            </g>
          );
        })}
      </g>
      {/* limb electrodes — dimmed when a precordial lead is selected */}
      <g opacity={isLimb?1:0.28}>
        {limbs.map(l=>{
          const isPos = posEl && l.id===info.pos;
          const isNeg = negEl && l.id===info.neg;
          const on = isPos || isNeg;
          return (
            <g key={l.id}>
              {on && <circle cx={l.x} cy={l.y} r="10" fill={`${col}33`}/>}
              <circle cx={l.x} cy={l.y} r={on?5.5:4} fill={on?col:"#64748b"}
                stroke={on?"#fff":"none"} strokeWidth="1.3"/>
              {isPos && <text x={l.x} y={l.y+3.2} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="800">+</text>}
              {isNeg && <text x={l.x} y={l.y+3.2} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="800">−</text>}
              <text x={l.lx} y={l.ly} textAnchor="middle" fontSize="8"
                fill={on?col:"#64748b"} fontWeight={on?700:500}>{l.id}</text>
            </g>
          );
        })}
      </g>
      <text x="100" y="160" textAnchor="middle" fontSize="7.5" fill="#475569">
        {isLimb
          ? (info.neg ? "bipolar — measured between the two" : "augmented — vs. mean of other two")
          : "anterior chest, patient facing you"}
      </text>
    </svg>
  );
}

// Hexaxial reference: the frontal-plane angle each limb lead views from.
function HexaxialDiagram({ lead }) {
  const info = LEAD_TERRITORY[lead];
  const limb = ["I","II","III","aVR","aVL","aVF"];
  const rad = d => (d * Math.PI) / 180;
  return (
    <svg viewBox="0 0 200 200" style={{width:"100%",maxWidth:230,height:"auto",display:"block",margin:"0 auto"}}>
      <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1"/>
      <circle cx="100" cy="100" r="3" fill="#475569"/>
      {limb.map(l=>{
        const a = LEAD_TERRITORY[l].angle;
        const on = l===lead;
        const col = LEAD_TERRITORY[l].color;
        const x = 100 + 60*Math.cos(rad(a)), y = 100 + 60*Math.sin(rad(a));
        const lx = 100 + 75*Math.cos(rad(a)), ly = 100 + 75*Math.sin(rad(a));
        // Negative half dashed, positive half solid with a pole marker, so the
        // highlighted lead reads as a direction rather than a bare diameter.
        const nx = 100 - 60*Math.cos(rad(a)), ny = 100 - 60*Math.sin(rad(a));
        return (
          <g key={l}>
            <line x1={100} y1={100} x2={nx} y2={ny}
              stroke={on?col:"rgba(148,163,184,0.18)"} strokeWidth={on?1.4:1}
              strokeDasharray={on?"3 3":undefined} opacity={on?0.6:1}/>
            <line x1={100} y1={100} x2={x} y2={y}
              stroke={on?col:"rgba(148,163,184,0.18)"} strokeWidth={on?2.5:1}/>
            {on && <>
              <circle cx={x} cy={y} r="6" fill={col}/>
              <text x={x} y={y+3.4} textAnchor="middle" fontSize="9" fill="#0b1220" fontWeight="800">+</text>
              <text x={nx} y={ny+3.4} textAnchor="middle" fontSize="10" fill={col} fontWeight="800" opacity="0.7">−</text>
            </>}
            <text x={lx} y={ly+3} textAnchor="middle" fontSize={on?11:9}
              fill={on?col:"#64748b"} fontWeight={on?700:500}>{l}</text>
          </g>
        );
      })}
      {/* Caption sits top-left: the bottom of the circle is crowded by III, aVF and II. */}
      {info.angle!==null
        ? <text x="6" y="14" fontSize="9" fill={info.color} fontWeight="700">{lead} = {info.angle>0?"+":""}{info.angle}°</text>
        : <text x="6" y="14" fontSize="8" fill="#475569">{lead} is precordial — horizontal plane</text>}
    </svg>
  );
}

function LeadViewPanel({ lead, isMobile }) {
  const info = LEAD_TERRITORY[lead];
  const art = ARTERIES[info.artery];
  const alt = info.arteryAlt ? ARTERIES[info.arteryAlt] : null;
  const partners = LEAD_NAMES.filter(l=>l!==lead && LEAD_TERRITORY[l].zone===info.zone && info.zone);
  const card = { background:"rgba(15,23,42,0.4)", border:"1px solid rgba(100,116,139,0.1)", borderRadius:8, padding:"10px 10px 6px" };
  return (
    <div style={{animation:"fade-up .3s ease"}}>
      {/* Summary line */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10,padding:"8px 12px",borderRadius:8,background:`${info.color}0d`,border:`1px solid ${info.color}30`}}>
        <span style={{fontSize:18,fontWeight:800,color:info.color}}>{lead}</span>
        <span style={{fontSize:12,color:"#94a3b8"}}>
          {info.zone ? <>views the <b style={{color:info.color}}>{info.zone.toLowerCase()}</b> wall</> : <>no single wall — faces the cavity from the right shoulder</>}
        </span>
        <div style={{flex:1}}/>
        <span style={{fontSize:11,padding:"3px 9px",borderRadius:10,background:`${art.color}18`,color:art.color,border:`1px solid ${art.color}35`,fontWeight:700}}>{info.artery}</span>
      </div>

      {/* Three diagrams */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:8,marginBottom:10}}>
        <div style={card}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:".18em",marginBottom:4}}>WHAT IT SEES</div>
          <HeartWallDiagram lead={lead}/>
        </div>
        <div style={card}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:".18em",marginBottom:4}}>WHERE IT GOES</div>
          <TorsoDiagram lead={lead}/>
        </div>
        <div style={card}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:".18em",marginBottom:4}}>FRONTAL-PLANE AXIS</div>
          <HexaxialDiagram lead={lead}/>
        </div>
      </div>

      {/* Coronary supply */}
      <div style={{padding:"12px 14px",borderRadius:8,background:"rgba(15,23,42,0.4)",border:"1px solid rgba(100,116,139,0.08)",marginBottom:8}}>
        <div style={{fontSize:10,color:"#475569",letterSpacing:".2em",marginBottom:7}}>CULPRIT ARTERY</div>
        <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:5}}>
          <span style={{fontSize:14,fontWeight:800,color:art.color}}>{info.artery}</span>
          <span style={{fontSize:13,color:"#cbd5e1"}}>{art.name}</span>
        </div>
        <p style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,margin:"0 0 8px"}}>{art.supplies}</p>
        {alt && (
          <p style={{fontSize:11,color:"#64748b",lineHeight:1.6,margin:"0 0 8px"}}>
            Also consider <b style={{color:alt.color}}>{info.arteryAlt}</b> ({alt.name}) — {info.zone==="Inferior"
              ? "in the ~10–15% of people with a left-dominant circulation, the inferior wall is supplied by the LCx rather than the RCA."
              : "high lateral changes in I/aVL are often a diagonal branch rather than the circumflex proper."}
          </p>
        )}
        <div style={{fontSize:11,color:"#64748b",lineHeight:1.7}}>
          <div><b style={{color:"#94a3b8"}}>Electrode:</b> {info.place}</div>
          {partners.length>0 && <div style={{marginTop:3}}><b style={{color:"#94a3b8"}}>Contiguous with:</b> {partners.join(", ")} — ST changes in two or more of these are needed to call a STEMI.</div>}
        </div>
      </div>
    </div>
  );
}

export default function ECGSimulatorGuide() {
  const [rhythm, setRhythm] = useState("normal_sinus");
  const [isRunning, setIsRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [expandedWave, setExpandedWave] = useState(null);
  const [category, setCategory] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState("clinical");
  const [viewMode, setViewMode] = useState("single"); // "single" | "twelve"
  const [selectedLead, setSelectedLead] = useState("II");
  const [soundOn, setSoundOn] = useState(false);
  const [soundMode, setSoundMode] = useState("beep"); // "beep" | "heart"

  useEffect(()=>{const c=()=>setIsMobile(window.innerWidth<=840);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c)},[]);

  const engineRef = useRef(null);
  const handleBeat = useCallback((kind, beat)=>{
    if (!soundOn) return;
    const e = engineRef.current || (engineRef.current = createSoundEngine());
    const prof = RHYTHM_AUDIO[rhythm] || {};
    if (soundMode==="beep") {
      // A monitor tones on a DETECTED QRS and does nothing else. Rhythms with
      // no derivable QRS (VF, asystole, TdP) stay silent — the alarm speaks.
      if (kind==="s1" && prof.tone !== false) e.qrsTone(100);
      return;
    }
    if (kind==="s1") e.s1(beat ? beat.s1 : 1);
    else if (kind==="s2") e.s2(beat ? beat.s2 : 1, beat ? beat.split : 25);
    else if (kind==="s3") e.s3(beat ? beat.s3 : 1);
    else if (kind==="s4") e.s4(beat ? beat.s4 : 1);
    else if (kind==="rub") e.rub();
  },[soundOn,soundMode,rhythm]);

  // Alarm loop. Alarms belong to the monitor, not the stethoscope, so they
  // only run in monitor mode. Priority follows IEC 60601-1-8: red (high) for
  // the arrest rhythms, yellow (medium) for a rate outside the usual 50–120
  // limits. High priority repeats insistently; medium backs off.
  useEffect(()=>{
    const e = engineRef.current;
    if (!soundOn || soundMode!=="beep" || !isRunning) { if (e) e.stopAlarm(); return; }
    const priority = alarmPriority(rhythm);
    if (!priority) { if (e) e.stopAlarm(); return; }
    const eng = e || (engineRef.current = createSoundEngine());
    eng.stopAlarm();
    let id;
    const fire = () => {
      const len = eng.alarm(priority);
      id = setTimeout(fire, (len + (priority==="high" ? 1.4 : 5.5)) * 1000);
    };
    fire();
    return ()=>{ clearTimeout(id); eng.stopAlarm(); };
  },[soundOn,soundMode,isRunning,rhythm]);

  const toggleSound = () => {
    // First click doubles as the user gesture that unlocks the AudioContext.
    if (!soundOn) (engineRef.current || (engineRef.current = createSoundEngine())).resume();
    setSoundOn(v=>!v);
  };

  const current = RHYTHMS[rhythm];
  const filtered = useMemo(()=>Object.entries(RHYTHMS).filter(([,v])=>category==="All"||v.category===category),[category]);

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#050a14 0%,#0a1020 50%,#060c18 100%)",color:"#e2e8f0",fontFamily:"'JetBrains Mono','Fira Code','SF Mono',monospace"}}>
      <style>{`
        @keyframes heartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.3)}30%{transform:scale(1)}45%{transform:scale(1.15)}60%{transform:scale(1)}}
        @keyframes glow-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        .cat-pill{padding:4px 10px;border-radius:16px;border:1px solid rgba(100,116,139,0.18);background:transparent;color:#64748b;font-family:inherit;font-size:13px;cursor:pointer;transition:all .2s;letter-spacing:.06em;white-space:nowrap}
        .cat-pill:hover{border-color:rgba(52,211,153,0.35);color:#94a3b8}.cat-pill.active{border-color:#34d399;color:#34d399;background:rgba(52,211,153,0.08)}
        .r-item{padding:8px 10px;border-radius:6px;cursor:pointer;width:100%;border:1px solid rgba(100,116,139,0.08);background:rgba(15,23,42,0.3);transition:all .2s;font-family:inherit;text-align:left}
        .r-item:hover{background:rgba(52,211,153,0.04);border-color:rgba(52,211,153,0.18)}.r-item.active{border-color:rgba(52,211,153,0.4);background:rgba(52,211,153,0.06)}
        .ctrl-btn{padding:5px 12px;border-radius:5px;border:1px solid rgba(52,211,153,0.18);background:rgba(52,211,153,0.03);color:#94a3b8;font-family:inherit;font-size:13px;cursor:pointer;transition:all .15s;letter-spacing:.04em}
        .ctrl-btn:hover{background:rgba(52,211,153,0.1);color:#e2e8f0}.ctrl-btn.on{background:rgba(52,211,153,0.12);color:#34d399;border-color:#34d399}
        .tab-btn{padding:5px 12px;border-radius:5px;border:1px solid rgba(100,116,139,0.12);background:transparent;color:#64748b;font-family:inherit;font-size:13px;cursor:pointer;transition:all .15s;letter-spacing:.06em}
        .tab-btn:hover{color:#94a3b8;border-color:rgba(100,116,139,0.25)}.tab-btn.active{color:#e2e8f0;border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.05)}
        .wave-card{padding:10px 13px;border-radius:7px;cursor:pointer;width:100%;border:1px solid rgba(100,116,139,0.08);background:rgba(15,23,42,0.2);transition:all .2s;font-family:inherit;text-align:left}
        .wave-card:hover{border-color:rgba(100,116,139,0.2);background:rgba(15,23,42,0.4)}
        .lead-btn{padding:3px 7px;border-radius:4px;border:1px solid rgba(100,116,139,0.12);background:transparent;color:#64748b;font-family:inherit;font-size:12px;cursor:pointer;transition:all .15s}
        .lead-btn:hover{border-color:rgba(52,211,153,0.3);color:#94a3b8}.lead-btn.active{border-color:#34d399;color:#34d399;background:rgba(52,211,153,0.08)}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(52,211,153,0.12);border-radius:3px}
      `}</style>

      {/* HEADER */}
      <header style={{padding:"10px 16px",borderBottom:"1px solid rgba(52,211,153,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(5,10,20,0.85)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:80}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{background:"none",border:"1px solid rgba(52,211,153,0.15)",borderRadius:5,padding:"4px 7px",cursor:"pointer",color:"#94a3b8",fontSize:15,fontFamily:"inherit"}}>☰</button>}
          <div style={{width:28,height:28,borderRadius:6,background:"linear-gradient(135deg,#34d399,#059669)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 10px rgba(52,211,153,0.2)"}}>
            <span style={{fontSize:15,color:"#050a14",fontWeight:700}}>♡</span>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:".06em",background:"linear-gradient(90deg,#34d399,#22d3ee)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ECG SIMULATOR</div>
            <div style={{fontSize:10,color:"#475569",letterSpacing:".18em"}}>COMPREHENSIVE RHYTHM GUIDE · 39 RHYTHMS</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:5,height:5,borderRadius:"50%",display:"inline-block",background:isRunning?"#34d399":"#ef4444",animation:isRunning?"glow-pulse 1.5s infinite":"none"}}/>
          <span style={{fontSize:11,color:"#64748b",letterSpacing:".1em"}}>{isRunning?"LIVE":"PAUSED"}</span>
        </div>
      </header>

      <div style={{display:"flex",minHeight:"calc(100vh - 50px)"}}>
        {isMobile&&sidebarOpen&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:90}}/>}

        {/* SIDEBAR */}
        <aside style={{width:isMobile?255:220,minWidth:isMobile?255:220,borderRight:"1px solid rgba(52,211,153,0.06)",padding:"12px 8px",overflowY:"auto",maxHeight:"calc(100vh - 50px)",background:"rgba(5,10,20,0.95)",zIndex:95,...(isMobile?{position:"fixed",left:0,top:50,bottom:0,transform:sidebarOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s ease"}:{})}}>
          <div style={{fontSize:11,color:"#475569",letterSpacing:".2em",marginBottom:5}}>FILTER</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:12}}>
            {CATEGORIES.map(c=><button key={c} className={`cat-pill ${category===c?"active":""}`} onClick={()=>setCategory(c)}>{c}</button>)}
          </div>
          <div style={{fontSize:11,color:"#475569",letterSpacing:".2em",marginBottom:5}}>RHYTHMS · {filtered.length}</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {filtered.map(([key,val])=>(
              <button key={key} className={`r-item ${rhythm===key?"active":""}`} onClick={()=>{setRhythm(key);setSidebarOpen(false);setTab("clinical")}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:val.color,boxShadow:rhythm===key?`0 0 6px ${val.color}60`:"none",flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:rhythm===key?600:400,color:rhythm===key?"#e2e8f0":"#94a3b8",lineHeight:1.3}}>{val.name}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2,paddingLeft:11}}>
                  <span style={{fontSize:11,color:"#475569"}}>{val.bpm>0?val.bpm+" bpm":"No output"} · {val.category}</span>
                  {val.shockable!==null&&<span style={{fontSize:10,color:val.shockable?"#ef4444":"#64748b"}}>{val.shockable?"⚡":"✕"}</span>}
                </div>
              </button>
            ))}
          </div>
          <div style={{marginTop:14,padding:"8px",borderRadius:6,background:"rgba(52,211,153,0.03)",border:"1px solid rgba(52,211,153,0.06)",fontSize:11,color:"#475569",lineHeight:1.6}}>
            <strong style={{color:"#64748b"}}>Refs:</strong> Dubin (6th), LITFL, Goldberger (9th), AHA/ACC. Educational only.
          </div>
        </aside>

        {/* MAIN */}
        <main style={{flex:1,padding:isMobile?"10px":"12px 18px",overflowY:"auto",maxHeight:"calc(100vh - 50px)"}}>
          {/* Vitals */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"rgba(15,23,42,0.5)",borderRadius:8,border:"1px solid rgba(52,211,153,0.06)",marginBottom:8,flexWrap:"wrap"}}>
            <div style={{minWidth:80}}>
              <div style={{fontSize:10,color:"#475569",letterSpacing:".2em"}}>RHYTHM</div>
              <div style={{fontSize:13,fontWeight:700,color:current.color,marginTop:1}}>{current.name}</div>
            </div>
            <div style={{width:1,height:22,background:"rgba(100,116,139,0.12)"}}/>
            <div>
              <div style={{fontSize:10,color:"#475569",letterSpacing:".2em"}}>HR</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:1}}>
                <PulsingHeart bpm={current.bpm} color={current.color}/>
                <span style={{fontSize:24,fontWeight:700,color:current.bpm>0?"#34d399":"#ef4444",lineHeight:1}}>{current.bpm>0?current.bpm:"—"}</span>
                <span style={{fontSize:10,color:"#475569"}}>{current.bpm>0?"bpm":"arrest"}</span>
              </div>
            </div>
            <div style={{width:1,height:22,background:"rgba(100,116,139,0.12)"}}/>
            <span style={{fontSize:12,fontWeight:600,padding:"2px 8px",borderRadius:8,background:`${current.color}12`,color:current.color,border:`1px solid ${current.color}20`}}>{current.category}</span>
            <ShockBadge shockable={current.shockable}/>
            <div style={{flex:1}}/>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              <button className={`ctrl-btn ${viewMode==="twelve"?"on":""}`} onClick={()=>setViewMode(v=>v==="single"?"twelve":"single")}>{viewMode==="twelve"?"Lead II":"12-Lead"}</button>
              <button className={`ctrl-btn ${isRunning?"on":""}`} onClick={()=>setIsRunning(!isRunning)}>{isRunning?"⏸":"▶"}</button>
              <button className="ctrl-btn" onClick={()=>setSpeed(s=>s===0.5?1:s===1?1.5:s===1.5?2:0.5)}>×{speed}</button>
              <button className={`ctrl-btn ${soundOn?"on":""}`} onClick={toggleSound} title={soundOn?"Mute":"Enable sound"}>{soundOn?"🔊":"🔇"}</button>
              {soundOn && (
                <button className="ctrl-btn" onClick={()=>setSoundMode(m=>m==="beep"?"heart":"beep")} title="Switch between the bedside monitor (QRS tone + alarms) and the stethoscope (heart sounds)">
                  {soundMode==="beep"?"monitor":"stethoscope"}
                </button>
              )}
            </div>
          </div>

          {/* Single Lead Monitor */}
          {viewMode==="single" && (
            <>
              <div style={{display:"flex",gap:3,marginBottom:6,flexWrap:"wrap"}}>
                {LEAD_NAMES.map(l=><button key={l} className={`lead-btn ${selectedLead===l?"active":""}`} onClick={()=>setSelectedLead(l)}>{l}</button>)}
              </div>
              <div style={{borderRadius:8,overflow:"hidden",marginBottom:8,border:"1px solid rgba(52,211,153,0.1)",position:"relative",boxShadow:"0 0 30px rgba(52,211,153,0.03)"}}>
                <ECGCanvas rhythm={rhythm} isRunning={isRunning} speed={speed} height={isMobile?180:220} leadName={selectedLead} onBeat={handleBeat}/>
                <div style={{position:"absolute",top:7,left:10,fontSize:13,color:"#34d399",fontWeight:600,opacity:.6,letterSpacing:".1em"}}>{selectedLead}</div>
                <div style={{position:"absolute",top:7,right:10,fontSize:10,color:"#475569"}}>25 mm/s · 10 mm/mV</div>
                <div style={{position:"absolute",bottom:7,left:10,fontSize:10,color:"#475569"}}>{current.abbr}</div>
                {current.bpm===0&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:16,fontWeight:700,color:"#ef4444",letterSpacing:".15em",textShadow:"0 0 20px rgba(239,68,68,0.5)"}}>NO OUTPUT</div>}
              </div>
            </>
          )}

          {/* 12-Lead Grid */}
          {viewMode==="twelve" && (
            <div key={rhythm+"12"} style={{marginBottom:8}}>
              {/* Territory key — standard 4×3 lead layout */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2,marginBottom:6}}>
                {LEAD_GRID.flat().map(l=>{
                  const t=LEAD_TERRITORY[l];
                  return (
                    <div key={l} style={{background:t.zone?t.color:"#f1f5f9",borderRadius:3,padding:isMobile?"3px 2px":"5px 4px",textAlign:"center",lineHeight:1.25}}>
                      <div style={{fontSize:isMobile?10:12,fontWeight:800,color:t.zone?"#fff":"#334155"}}>{l}</div>
                      {t.zone&&<div style={{fontSize:isMobile?8:10,fontWeight:700,color:"#fff"}}>{t.zone}</div>}
                    </div>
                  );
                })}
              </div>
              {/* Traces, same 4×3 arrangement */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
                {LEAD_GRID.flat().map(l=>{
                  const t=LEAD_TERRITORY[l];
                  return (
                    <div key={l} style={{borderRadius:6,overflow:"hidden",border:`1px solid ${t.color}33`,borderTop:`2px solid ${t.color}`,position:"relative"}}>
                      <MiniECGCanvas rhythm={rhythm} isRunning={isRunning} speed={speed} leadName={l} height={isMobile?55:70}/>
                      <div style={{position:"absolute",top:4,left:5,fontSize:11,color:t.color,fontWeight:700}}>{l}</div>
                      {t.zone&&<div style={{position:"absolute",bottom:3,right:5,fontSize:8,color:t.color,opacity:.75,letterSpacing:".08em",textTransform:"uppercase"}}>{t.zone}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginBottom:8}}>
            <button className={`tab-btn ${tab==="clinical"?"active":""}`} onClick={()=>setTab("clinical")}>Clinical Info</button>
            <button className={`tab-btn ${tab==="waves"?"active":""}`} onClick={()=>setTab("waves")}>Waveform Guide</button>
            <button className={`tab-btn ${tab==="lead"?"active":""}`} onClick={()=>setTab("lead")}>Lead View</button>
          </div>

          {tab==="lead" && (
            <div key={selectedLead}>
              {viewMode==="twelve" && (
                <div style={{display:"flex",gap:3,marginBottom:8,flexWrap:"wrap"}}>
                  {LEAD_NAMES.map(l=><button key={l} className={`lead-btn ${selectedLead===l?"active":""}`} onClick={()=>setSelectedLead(l)}>{l}</button>)}
                </div>
              )}
              <LeadViewPanel lead={selectedLead} isMobile={isMobile}/>
            </div>
          )}

          {tab==="clinical" && (
            <div key={rhythm} style={{padding:"12px 14px",borderRadius:8,marginBottom:10,background:"rgba(15,23,42,0.4)",border:"1px solid rgba(100,116,139,0.06)",animation:"fade-up .3s ease"}}>
              <div style={{fontSize:10,color:"#475569",letterSpacing:".2em",marginBottom:5}}>CLINICAL OVERVIEW</div>
              <p style={{fontSize:14,color:"#cbd5e1",lineHeight:1.8,margin:"0 0 10px"}}>{current.description}</p>
              <div style={{fontSize:10,color:"#475569",letterSpacing:".2em",marginBottom:5}}>KEY FEATURES</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:3,marginBottom:10}}>
                {current.keyFeatures.map((f,i)=>(
                  <div key={i} style={{padding:"4px 9px",borderRadius:4,background:`${current.color}06`,border:`1px solid ${current.color}10`,fontSize:12,color:"#94a3b8",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:current.color,fontSize:7}}>◆</span>{f}
                  </div>
                ))}
              </div>
              {current.shockable!==null && (
                <div style={{padding:"8px 11px",borderRadius:6,marginBottom:8,background:current.shockable?"rgba(239,68,68,0.05)":"rgba(100,116,139,0.05)",border:`1px solid ${current.shockable?"rgba(239,68,68,0.15)":"rgba(100,116,139,0.1)"}`}}>
                  <div style={{fontSize:10,color:"#475569",letterSpacing:".15em",marginBottom:3}}>ACLS CLASSIFICATION</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <ShockBadge shockable={current.shockable}/>
                    <span style={{fontSize:13,color:"#94a3b8"}}>{current.shockable?"Defibrillation indicated — follow VFib/pVT algorithm":"Do NOT defibrillate — CPR + epinephrine per asystole/PEA algorithm"}</span>
                  </div>
                </div>
              )}
              <div style={{padding:"8px 11px",borderRadius:6,background:"rgba(52,211,153,0.02)",borderLeft:`2px solid ${current.color}30`,marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",letterSpacing:".15em",marginBottom:2}}>CLINICAL PEARL</div>
                <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.7}}>{current.clinicalNote}</div>
              </div>
              {RHYTHM_AUDIO[rhythm] && RHYTHM_AUDIO[rhythm].note && (
                <div style={{padding:"8px 11px",borderRadius:6,background:"rgba(96,165,250,0.03)",borderLeft:"2px solid rgba(96,165,250,0.3)",marginBottom:8}}>
                  <div style={{fontSize:10,color:"#475569",letterSpacing:".15em",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                    <span>WHAT IT SOUNDS LIKE</span>
                    {alarmPriority(rhythm) && (
                      <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,letterSpacing:".08em",
                        background: alarmPriority(rhythm)==="high" ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.13)",
                        color: alarmPriority(rhythm)==="high" ? "#ef4444" : "#fbbf24"}}>
                        {alarmPriority(rhythm)==="high" ? "RED ALARM" : "YELLOW ALARM"}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.7}}>{RHYTHM_AUDIO[rhythm].note}</div>
                </div>
              )}
              <div style={{fontSize:11,color:"#475569",fontStyle:"italic"}}>Ref: {current.reference}</div>
            </div>
          )}

          {tab==="waves" && (
            <div style={{padding:"12px 14px",borderRadius:8,marginBottom:10,background:"rgba(15,23,42,0.3)",border:"1px solid rgba(100,116,139,0.05)",animation:"fade-up .3s ease"}}>
              <div style={{fontSize:10,color:"#475569",letterSpacing:".2em",marginBottom:8}}>ECG WAVEFORM COMPONENTS</div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {WAVE_COMPONENTS.map(w=>{const open=expandedWave===w.id;return(
                  <button key={w.id} className="wave-card" onClick={()=>setExpandedWave(open?null:w.id)} style={open?{borderColor:`${w.color}30`,background:"rgba(15,23,42,0.45)"}:{}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:22,height:22,borderRadius:4,background:`${w.color}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:w.color}}>{w.id}</div>
                        <span style={{fontSize:13,fontWeight:open?600:400,color:open?w.color:"#94a3b8"}}>{w.label}</span>
                      </div>
                      <span style={{fontSize:12,color:"#475569",transform:open?"rotate(90deg)":"none",transition:"transform .2s"}}>▸</span>
                    </div>
                    {open&&(<div style={{marginTop:7,paddingTop:7,borderTop:`1px solid ${w.color}12`,animation:"fade-up .2s ease"}}>
                      <p style={{fontSize:13,color:"#94a3b8",lineHeight:1.7,margin:"0 0 6px"}}>{w.desc}</p>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <span style={{padding:"2px 8px",borderRadius:3,background:`${w.color}08`,fontSize:11,color:"#64748b"}}><span style={{color:w.color}}>Duration:</span> {w.duration}</span>
                        <span style={{padding:"2px 8px",borderRadius:3,background:`${w.color}08`,fontSize:11,color:"#64748b"}}><span style={{color:w.color}}>Amplitude:</span> {w.amplitude}</span>
                      </div>
                    </div>)}
                  </button>
                )})}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
