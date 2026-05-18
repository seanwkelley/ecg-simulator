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
};

const WAVE_COMPONENTS = [
  { id:"P", label:"P Wave", color:"#60a5fa", desc:"Atrial depolarization from SA node. Upright in Lead II, inverted in aVR. Bifid P (P mitrale) = LA enlargement; peaked P (P pulmonale) = RA enlargement.", duration:"< 120 ms", amplitude:"< 2.5 mm" },
  { id:"PR", label:"PR Interval", color:"#a78bfa", desc:"SA node → AV node → His conduction time. Prolonged (> 200 ms) = 1° AV block. Short (< 120 ms) = pre-excitation (WPW) or junctional rhythm.", duration:"120–200 ms", amplitude:"—" },
  { id:"QRS", label:"QRS Complex", color:"#34d399", desc:"Ventricular depolarization. Q = septal (L→R); R = free wall; S = basal. Wide (≥ 120 ms) = BBB, ventricular origin, or pre-excitation.", duration:"< 120 ms", amplitude:"5–20 mm" },
  { id:"ST", label:"ST Segment", color:"#22d3ee", desc:"J point to T-wave onset. Should be isoelectric. Elevation = STEMI, pericarditis, Brugada, benign early repol. Depression = ischemia, reciprocal, dig effect.", duration:"80–120 ms", amplitude:"Isoelectric ±1mm" },
  { id:"T", label:"T Wave", color:"#fb923c", desc:"Ventricular repolarization. Peaked T = hyperkalemia. Flat/inverted = ischemia, LVH strain, PE. Should be asymmetric (slow up, fast down).", duration:"~160 ms", amplitude:"< 5 mm (limb)" },
  { id:"QT", label:"QT Interval", color:"#f472b6", desc:"Total ventricular electrical systole. QTc = QT/√RR. Prolonged QTc (>440M, >460F) → Torsades risk. Causes: drugs, electrolytes, congenital LQTS.", duration:"QTc < 440–460 ms", amplitude:"—" },
];

const CATEGORIES = ["All","Normal","Bradycardia","Tachycardia","Arrhythmia","Conduction","Emergency"];

/* ═══════════════════ WAVEFORM GENERATOR ═══════════════════ */

function normalBeat(phase, opts = {}) {
  const { prDelay=0, qrsWidth=1, rAmp=1, pAmp=1, tAmp=1, qrsNotch=false, deepS=false, bigQ=false, tInvert=false, longQT=false } = opts;
  let val = 0;
  const pS = 0.06 + prDelay * 0.08;
  const pE = 0.17 + prDelay * 0.04;
  if (phase >= pS && phase <= pE) val = 0.15 * pAmp * Math.sin(((phase-pS)/(pE-pS))*Math.PI);
  const qS = 0.24 + prDelay * 0.1;
  const qE = qS + 0.065 * qrsWidth;
  if (phase >= qS && phase <= qE) {
    const q = (phase-qS)/(qE-qS);
    const qD = bigQ ? 0.25 : 0.1;
    if (q<0.15) val = -qD*(q/0.15);
    else if (q<0.4) val = -qD + (rAmp+qD)*((q-0.15)/0.25);
    else if (q<0.65) { val = rAmp*(1-(q-0.4)/0.25); if (qrsNotch && q>0.48 && q<0.58) val += 0.15*rAmp; }
    else { const sD = deepS?0.35:0.17; val = -sD*(1-(q-0.65)/0.35); }
  }
  // T wave — wider for Long QT
  const tGap = longQT ? 0.10 : 0.06;
  const tWidth = longQT ? 0.28 : 0.17;
  const tS = qE + tGap;
  const tE = tS + tWidth;
  if (phase >= tS && phase <= tE) {
    const tp = (phase-tS)/(tE-tS);
    // Long QT: bifid / broad notched T
    if (longQT) {
      val = (tInvert?-1:1) * 0.24 * tAmp * (Math.sin(tp*Math.PI) + 0.3*Math.sin(tp*Math.PI*2));
    } else {
      val = (tInvert?-1:1) * 0.24 * tAmp * Math.sin(tp*Math.PI);
    }
  }
  return val;
}

function generateECGPoint(t, rhythm, beatPhase, leadMod) {
  const ph = beatPhase % 1;
  const lm = leadMod || LEAD_MODS.II;
  const ax = lm.axis || 1;

  // Apply lead modifiers to normalBeat
  function leadNormal(phase, extra = {}) {
    return ax * normalBeat(phase, {
      pAmp: (extra.pAmp||1) * (lm.pAmp||1),
      rAmp: (extra.rAmp||1) * (lm.rAmp||1),
      deepS: extra.deepS || lm.sD > 0.3,
      tAmp: (extra.tAmp||1) * (lm.tAmp||1),
      tInvert: extra.tInvert || lm.tInv || false,
      prDelay: extra.prDelay || 0,
      qrsWidth: extra.qrsWidth || 1,
      qrsNotch: extra.qrsNotch || false,
      bigQ: extra.bigQ || false,
      longQT: extra.longQT || false,
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
    const cyc = (t*RHYTHMS[rhythm].bpm/60)%4;
    const bn = Math.floor(cyc), ib = cyc-bn;
    if (bn===3) { if (ib>0.06&&ib<0.17) return ax*0.15*(lm.pAmp||1)*Math.sin(((ib-0.06)/0.11)*Math.PI); return 0; }
    return leadNormal(ib, { prDelay:[0,0.4,0.8][bn] });
  }

  if (rhythm === "second_degree_type2") {
    const cyc = (t*RHYTHMS[rhythm].bpm/60)%3;
    const bn = Math.floor(cyc), ib = cyc-bn;
    if (bn===2) { if (ib>0.06&&ib<0.17) return ax*0.15*(lm.pAmp||1)*Math.sin(((ib-0.06)/0.11)*Math.PI); return 0; }
    return leadNormal(ib, { qrsWidth:1.4 });
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
    const bn = Math.floor(t*RHYTHMS[rhythm].bpm/60)%5;
    if (bn===3) {
      if (ph<0.06) return 0;
      if (ph>0.06&&ph<0.22) { const q=(ph-0.06)/0.16; const v = q<0.08?-0.25*(q/0.08):q<0.35?-0.25+1.35*((q-0.08)/0.27):q<0.65?1.1*(1-(q-0.35)/0.3):-0.3*(1-(q-0.65)/0.35); return ax*v*(lm.rAmp||1); }
      if (ph>0.26&&ph<0.40) return ax*-0.3*(lm.tAmp||1)*Math.sin(((ph-0.26)/0.14)*Math.PI);
      return 0;
    }
    return leadNormal(ph);
  }

  if (rhythm === "multifocal_pvc") {
    const bn = Math.floor(t*RHYTHMS[rhythm].bpm/60)%7;
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

function ECGCanvas({ rhythm, isRunning, speed, height=230, leadName="II" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dataRef = useRef([]);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const beatAccRef = useRef(0);

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
      const bpm = RHYTHMS[rhythm].bpm||60;
      const pps = 85*speed;
      const n = Math.max(1, Math.round(pps*dt));
      for (let i=0;i<n;i++) {
        timeRef.current += 1/pps;
        beatAccRef.current += (1/pps)/(60/bpm);
        if (beatAccRef.current>=1) beatAccRef.current-=1;
        dataRef.current.push(generateECGPoint(timeRef.current, rhythm, beatAccRef.current, leadMod));
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
  useEffect(()=>{dataRef.current=[];timeRef.current=0;beatAccRef.current=0;lastFrameRef.current=0},[rhythm,leadName]);

  return <canvas ref={canvasRef} style={{width:"100%",height,display:"block"}}/>;
}

/* Mini canvas for 12-lead grid (no glow, thinner) */
function MiniECGCanvas({ rhythm, isRunning, speed, leadName, height=70 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dataRef = useRef([]);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const beatAccRef = useRef(0);

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
      const bpm = RHYTHMS[rhythm].bpm||60;
      const pps = 60*speed;
      const n = Math.max(1, Math.round(pps*dt));
      for (let i=0;i<n;i++) {
        timeRef.current += 1/pps;
        beatAccRef.current += (1/pps)/(60/bpm);
        if (beatAccRef.current>=1) beatAccRef.current-=1;
        dataRef.current.push(generateECGPoint(timeRef.current, rhythm, beatAccRef.current, leadMod));
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
  useEffect(()=>{dataRef.current=[];timeRef.current=0;beatAccRef.current=0;lastFrameRef.current=0},[rhythm,leadName]);

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

  useEffect(()=>{const c=()=>setIsMobile(window.innerWidth<=840);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c)},[]);

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
            <div style={{fontSize:10,color:"#475569",letterSpacing:".18em"}}>COMPREHENSIVE RHYTHM GUIDE · 20 RHYTHMS</div>
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
            </div>
          </div>

          {/* Single Lead Monitor */}
          {viewMode==="single" && (
            <>
              <div style={{display:"flex",gap:3,marginBottom:6,flexWrap:"wrap"}}>
                {LEAD_NAMES.map(l=><button key={l} className={`lead-btn ${selectedLead===l?"active":""}`} onClick={()=>setSelectedLead(l)}>{l}</button>)}
              </div>
              <div style={{borderRadius:8,overflow:"hidden",marginBottom:8,border:"1px solid rgba(52,211,153,0.1)",position:"relative",boxShadow:"0 0 30px rgba(52,211,153,0.03)"}}>
                <ECGCanvas rhythm={rhythm} isRunning={isRunning} speed={speed} height={isMobile?180:220} leadName={selectedLead}/>
                <div style={{position:"absolute",top:7,left:10,fontSize:13,color:"#34d399",fontWeight:600,opacity:.6,letterSpacing:".1em"}}>{selectedLead}</div>
                <div style={{position:"absolute",top:7,right:10,fontSize:10,color:"#475569"}}>25 mm/s · 10 mm/mV</div>
                <div style={{position:"absolute",bottom:7,left:10,fontSize:10,color:"#475569"}}>{current.abbr}</div>
                {current.bpm===0&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:16,fontWeight:700,color:"#ef4444",letterSpacing:".15em",textShadow:"0 0 20px rgba(239,68,68,0.5)"}}>NO OUTPUT</div>}
              </div>
            </>
          )}

          {/* 12-Lead Grid */}
          {viewMode==="twelve" && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}} key={rhythm+"12"}>
              {LEAD_NAMES.map(l=>(
                <div key={l} style={{borderRadius:6,overflow:"hidden",border:"1px solid rgba(52,211,153,0.08)",position:"relative"}}>
                  <MiniECGCanvas rhythm={rhythm} isRunning={isRunning} speed={speed} leadName={l} height={isMobile?55:70}/>
                  <div style={{position:"absolute",top:3,left:5,fontSize:11,color:"#34d399",fontWeight:600,opacity:.7}}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginBottom:8}}>
            <button className={`tab-btn ${tab==="clinical"?"active":""}`} onClick={()=>setTab("clinical")}>Clinical Info</button>
            <button className={`tab-btn ${tab==="waves"?"active":""}`} onClick={()=>setTab("waves")}>Waveform Guide</button>
          </div>

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
