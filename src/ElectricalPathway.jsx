import { memo, useEffect } from "react";

const SPECIAL_PROFILES = {
  svt: { mode:"avnrt", origin:"AV NODAL RE-ENTRY", detail:"A rapid loop in and around the AV node repeatedly activates the ventricles." },
  atrial_fibrillation: { mode:"af", origin:"CHAOTIC ATRIAL ACTIVITY", detail:"Multiple atrial wavelets reach the AV node; only some pass to the ventricles." },
  atrial_flutter: { mode:"flutter", origin:"ATRIAL RE-ENTRY", detail:"A macro-re-entrant circuit circles the atrium with patterned AV conduction." },
  first_degree_block: { mode:"block1", origin:"AV NODAL DELAY", detail:"Every atrial impulse conducts, but passage through the AV node is prolonged." },
  second_degree_type1: { mode:"wenckebach", origin:"WENCKEBACH AT AV NODE", detail:"AV nodal delay lengthens until one atrial impulse fails to conduct." },
  second_degree_type2: { mode:"mobitz2", origin:"INTERMITTENT HIS–PURKINJE BLOCK", detail:"Atrial timing stays regular, but occasional impulses stop below the AV node." },
  third_degree_block: { mode:"complete", origin:"COMPLETE AV DISSOCIATION", detail:"Atria and ventricles activate independently; an escape focus drives the ventricles." },
  ventricular_tachycardia: { mode:"ventricular", origin:"VENTRICULAR FOCUS", detail:"A rapid ventricular focus spreads activation cell-to-cell, outside the normal route." },
  ventricular_fibrillation: { mode:"vf", origin:"CHAOTIC VENTRICULAR ACTIVITY", detail:"Disorganized wavelets circulate through the ventricles with no coordinated activation." },
  asystole: { mode:"asystole", origin:"NO ORGANIZED ACTIVATION", detail:"No ventricular electrical pathway is active." },
  torsades: { mode:"vf", origin:"POLYMORPHIC VENTRICULAR ACTIVITY", detail:"Ventricular activation repeatedly changes direction around the electrical axis." },
  lbbb: { mode:"lbbb", origin:"LEFT BUNDLE DELAY", detail:"The right ventricle activates first; the left ventricle follows slowly cell-to-cell." },
  rbbb: { mode:"rbbb", origin:"RIGHT BUNDLE DELAY", detail:"The left ventricle activates first; the right ventricle follows late." },
  unifocal_pvc: { mode:"pvc1", origin:"SINGLE VENTRICULAR ECTOPIC FOCUS", detail:"A premature impulse starts from one ventricular site, then spreads abnormally." },
  multifocal_pvc: { mode:"pvc2", origin:"MULTIPLE VENTRICULAR FOCI", detail:"Premature impulses arise from more than one ventricular site." },
  wpw: { mode:"wpw", origin:"ACCESSORY PATHWAY", detail:"An atrioventricular bypass tract pre-excites the ventricle ahead of the AV node." },
  hyperkalemia_severe: { mode:"diffuse", origin:"DIFFUSE CONDUCTION SLOWING", detail:"Severe hyperkalaemia suppresses atrial activity and slows ventricular conduction." },
  paced_ventricular: { mode:"pacedV", origin:"VENTRICULAR PACING", detail:"A pacing lead triggers the right ventricle; activation then spreads cell-to-cell." },
  paced_dual: { mode:"pacedDual", origin:"DUAL-CHAMBER PACING", detail:"An atrial stimulus is followed by a timed ventricular stimulus." },
  paced_atrial: { mode:"pacedA", origin:"ATRIAL PACING", detail:"An atrial lead initiates depolarization; the native AV pathway conducts normally." },
  paced_biv: { mode:"pacedBiV", origin:"BIVENTRICULAR PACING", detail:"Right- and left-ventricular leads activate both ventricles for resynchronization." },
  pea: { mode:"pea", origin:"ORGANIZED ELECTRICAL ACTIVITY", detail:"The pathway is active, but there is no effective mechanical pulse." },
  junctional_escape: { mode:"junctional", origin:"AV JUNCTION ESCAPE", detail:"The AV junction drives the ventricles and may activate the atria retrogradely." },
  aivr: { mode:"ventricular", origin:"VENTRICULAR ESCAPE FOCUS", detail:"A ventricular focus drives a slower, wide-complex rhythm." },
};

const RHYTHM_DETAILS = {
  normal_sinus: "The SA node activates both atria, pauses at the AV node, then travels through His–Purkinje fibers.",
  sinus_bradycardia: "The normal SA-to-Purkinje sequence repeats at a slower rate.",
  sinus_tachycardia: "The normal SA-to-Purkinje sequence repeats at a faster rate.",
  pe_s1q3t3: "Sinus activation is preserved; acute right-heart strain changes the ECG pattern.",
  long_qt: "Activation follows the normal route; ventricular electrical recovery is prolonged.",
  brugada: "Activation begins in the SA node; abnormal right-ventricular outflow electrical behavior changes V1–V2.",
  hyperkalemia_mild: "The impulse begins in the SA node while potassium alters myocardial electrical recovery.",
  hypokalemia: "The impulse follows the normal route while ventricular repolarization is delayed.",
  hypothermia: "The normal route is preserved but pacemaker and conduction tissue fire more slowly.",
  digoxin_effect: "The normal route is preserved while digoxin alters AV conduction and repolarization.",
  pericarditis: "Sinus activation is preserved; diffuse inflammation changes the ST and PR segments.",
};

function getProfile(rhythm, category) {
  if (SPECIAL_PROFILES[rhythm]) return SPECIAL_PROFILES[rhythm];
  const detail = RHYTHM_DETAILS[rhythm]
    || (category === "Ischemia"
      ? "Sinus activation is preserved; myocardial injury changes the recorded ST–T pattern."
      : "The impulse follows the organized SA node → AV node → His–Purkinje pathway.");
  return { mode:"sinus", origin:"NORMAL CONDUCTION SEQUENCE", detail };
}

const PulsePath = ({ stage, className = "", ...props }) => (
  <path
    {...props}
    pathLength="1"
    data-pulse-stage={stage}
    className={`ep-route ${className}`}
  />
);

const VentricularRoute = () => (
  <>
    <PulsePath stage="bundle-r" className="ep-vent" d="M150 136 C137 153 126 180 112 213" />
    <PulsePath stage="bundle-l" className="ep-vent" d="M150 136 C166 153 177 181 191 211" />
    <PulsePath stage="purkinje-r" className="ep-vent" d="M112 213 C96 196 90 180 87 164 M112 213 C127 198 135 183 139 166" />
    <PulsePath stage="purkinje-l" className="ep-vent" d="M191 211 C207 194 214 175 216 156 M191 211 C176 194 167 177 162 160" />
  </>
);

const NormalRoute = () => (
  <>
    <PulsePath stage="atrial" className="ep-atrial" d="M92 73 C99 85 119 95 145 105" />
    <PulsePath stage="atrial" className="ep-atrial" d="M92 73 C124 59 164 63 198 87 C180 92 164 100 150 108" />
    <PulsePath stage="his" className="ep-av" d="M150 108 L150 136" />
    <VentricularRoute />
  </>
);

function pulseStage(root, stage, delay, duration) {
  root.querySelectorAll(`[data-pulse-stage="${stage}"]`).forEach((path) => {
    path.getAnimations().forEach((animation) => animation.cancel());
    path.animate([
      { opacity:0, strokeDashoffset:"0.12", offset:0 },
      { opacity:1, strokeDashoffset:"0.08", offset:0.06 },
      { opacity:1, strokeDashoffset:"-0.82", offset:0.86 },
      { opacity:0, strokeDashoffset:"-0.92", offset:1 },
    ], { delay, duration, easing:"linear", iterations:1, fill:"none" });
  });
}

function flashBlock(root, level, delay) {
  root.querySelectorAll(`[data-block-level="${level}"]`).forEach((mark) => {
    mark.getAnimations().forEach((animation) => animation.cancel());
    mark.animate([
      { opacity:0.28, transform:"scale(.9)" },
      { opacity:1, transform:"scale(1.18)", offset:0.35 },
      { opacity:0.4, transform:"scale(1)" },
    ], { delay, duration:260, easing:"ease-out", iterations:1 });
  });
}

/** Trigger one clinically ordered activation wave from the same beat clock as the ECG. */
export function triggerElectricalPathway(root, rhythm, beat, speed = 1) {
  if (!root || !beat || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { mode } = getProfile(rhythm);
  if (mode === "asystole" || mode === "vf") return;

  const playback = Math.max(0.5, speed || 1);
  const ms = (value) => value / playback;
  const eventAt = Math.max(0.002, 0.04 * beat.ref);
  const qrsAt = (beat.rPhase || 0.24) * beat.ref;
  const qrsDelay = Math.max(ms(95), ((qrsAt - eventAt) * 1000) / playback);
  const atrialDuration = Math.min(ms(100), qrsDelay * 0.55);
  const hisDuration = ms(34);
  const hisStart = Math.max(atrialDuration + ms(12), qrsDelay - hisDuration);
  const bundleDuration = ms(42);
  const purkinjeStart = qrsDelay + ms(18);
  const purkinjeDuration = ms(64);

  const normalVentricles = (start = qrsDelay) => {
    pulseStage(root, "bundle-r", start, bundleDuration);
    pulseStage(root, "bundle-l", start, bundleDuration);
    pulseStage(root, "purkinje-r", start + ms(18), purkinjeDuration);
    pulseStage(root, "purkinje-l", start + ms(18), purkinjeDuration);
  };
  const normalSequence = () => {
    pulseStage(root, "atrial", 0, atrialDuration);
    pulseStage(root, "his", hisStart, hisDuration);
    normalVentricles();
  };

  if (mode === "wenckebach" || mode === "mobitz2") {
    pulseStage(root, "atrial", 0, atrialDuration);
    if (!beat.qrs) {
      if (mode === "mobitz2") pulseStage(root, "his", hisStart, hisDuration);
      flashBlock(root, mode === "wenckebach" ? "av" : "his-purkinje", qrsDelay);
      return;
    }
    pulseStage(root, "his", hisStart, hisDuration);
    normalVentricles();
    return;
  }

  if (mode === "block1") {
    pulseStage(root, "atrial", 0, atrialDuration);
    pulseStage(root, "delay-ring", atrialDuration, Math.max(ms(90), hisStart - atrialDuration + hisDuration));
    pulseStage(root, "his", hisStart, hisDuration);
    normalVentricles();
    return;
  }

  if (mode === "lbbb" || mode === "rbbb") {
    pulseStage(root, "atrial", 0, atrialDuration);
    pulseStage(root, "his", hisStart, hisDuration);
    const first = mode === "lbbb" ? "r" : "l";
    pulseStage(root, `bundle-${first}`, qrsDelay, bundleDuration);
    pulseStage(root, `purkinje-${first}`, purkinjeStart, purkinjeDuration);
    pulseStage(root, "cell-to-cell", purkinjeStart + ms(36), ms(115));
    flashBlock(root, mode, qrsDelay + ms(12));
    return;
  }

  if (mode === "wpw") {
    pulseStage(root, "atrial", 0, atrialDuration);
    pulseStage(root, "accessory", atrialDuration * 0.78, ms(92));
    pulseStage(root, "his", hisStart, hisDuration);
    normalVentricles();
    return;
  }

  if (mode === "af" || mode === "flutter" || mode === "avnrt") {
    pulseStage(root, "av-output", Math.max(0, hisStart), hisDuration);
    normalVentricles();
    if (mode === "avnrt") pulseStage(root, "retrograde", 0, ms(95));
    return;
  }

  if (mode === "complete") {
    pulseStage(root, "escape", 0, ms(125));
    return;
  }

  if (mode === "junctional") {
    pulseStage(root, "retrograde", 0, ms(95));
    pulseStage(root, "av-output", 0, ms(38));
    normalVentricles(ms(25));
    return;
  }

  if (mode === "pacedA") {
    pulseStage(root, "pacer-a", 0, ms(55));
    normalSequence();
    return;
  }
  if (mode === "pacedDual") {
    pulseStage(root, "pacer-a", 0, ms(55));
    pulseStage(root, "atrial", ms(35), atrialDuration);
    pulseStage(root, "pacer-v", Math.max(ms(90), qrsDelay - ms(35)), ms(45));
    pulseStage(root, "paced-wave-rv", qrsDelay, ms(125));
    return;
  }
  if (mode === "pacedV" || mode === "pacedBiV") {
    pulseStage(root, "pacer-v", 0, ms(55));
    if (mode === "pacedBiV") pulseStage(root, "pacer-lv", 0, ms(55));
    pulseStage(root, "paced-wave-rv", ms(28), ms(mode === "pacedBiV" ? 92 : 130));
    if (mode === "pacedBiV") pulseStage(root, "paced-wave-lv", ms(28), ms(92));
    return;
  }

  if (mode === "ventricular" || mode === "diffuse" || ((mode === "pvc1" || mode === "pvc2") && beat.kind === "pvc")) {
    pulseStage(root, mode === "diffuse" ? "diffuse" : "ectopic", 0, ms(135));
    return;
  }

  normalSequence();
}

function BlockMark({ x, y, label }) {
  return (
    <g className="ep-block-mark" aria-label={label}>
      <circle cx={x} cy={y} r="8" />
      <path d={`M${x-4} ${y-4} L${x+4} ${y+4} M${x+4} ${y-4} L${x-4} ${y+4}`} />
    </g>
  );
}

const ElectricalPathway = memo(function ElectricalPathway({ rhythm, bpm, color, category, isRunning, speed, pathwayRef, rightVentricleRef, leftVentricleRef }) {
  const profile = getProfile(rhythm, category);
  const cycleSeconds = profile.mode === "vf" ? 0.42 : profile.mode === "asystole" ? 1 : 60 / Math.max(bpm || 75, 35) / speed;
  const cycle = `${Math.max(0.32, cycleSeconds).toFixed(2)}s`;
  const state = isRunning ? "running" : "paused";
  const mode = profile.mode;
  const showNormal = ["sinus","block1","wenckebach","mobitz2","lbbb","rbbb","wpw","pea","pacedA","pacedDual","pvc1","pvc2"].includes(mode);
  const showPacerA = ["pacedA","pacedDual"].includes(mode);
  const showPacerV = ["pacedV","pacedDual","pacedBiV"].includes(mode);
  const hasPacer = showPacerA || showPacerV;

  useEffect(() => {
    const root = pathwayRef?.current;
    if (!root) return;
    if (!isRunning) {
      root.querySelectorAll("[data-pulse-stage]").forEach((path) => path.getAnimations().forEach((animation) => animation.cancel()));
    }
    return () => {
      root.querySelectorAll("[data-pulse-stage]").forEach((path) => path.getAnimations().forEach((animation) => animation.cancel()));
    };
  }, [isRunning, pathwayRef, rhythm]);

  return (
    <section ref={pathwayRef} className="electrical-card" style={{"--ep-color":color,"--ep-cycle":cycle}} aria-label={`Electrical pathway for ${profile.origin}`}>
      <div className="electrical-card-head">
        <span>ELECTRICAL PATHWAY</span>
        <span className={`electrical-live ${isRunning ? "on" : ""}`}>{isRunning ? "ACTIVE" : "PAUSED"}</span>
      </div>
      <div className="electrical-figure">
        <div className="electrical-heart-beat">
          <svg viewBox={hasPacer ? "45 0 240 245" : "55 0 190 245"} role="img" aria-labelledby={`ep-title-${rhythm} ep-desc-${rhythm}`}>
          <title id={`ep-title-${rhythm}`}>{profile.origin}</title>
          <desc id={`ep-desc-${rhythm}`}>{profile.detail}</desc>

          <defs>
            <linearGradient id="ep-myocardium" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8f2f46" />
              <stop offset="0.52" stopColor="#5f2437" />
              <stop offset="1" stopColor="#351a2b" />
            </linearGradient>
            <radialGradient id="ep-right-chamber" cx="35%" cy="32%" r="80%">
              <stop offset="0" stopColor="#315f78" />
              <stop offset="1" stopColor="#172d46" />
            </radialGradient>
            <radialGradient id="ep-left-chamber" cx="36%" cy="28%" r="86%">
              <stop offset="0" stopColor="#8f3c52" />
              <stop offset="1" stopColor="#421f35" />
            </radialGradient>
            <linearGradient id="ep-venous-vessel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#285c7a" />
              <stop offset="0.5" stopColor="#4c8aa5" />
              <stop offset="1" stopColor="#214865" />
            </linearGradient>
            <linearGradient id="ep-arterial-vessel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7f263c" />
              <stop offset="0.48" stopColor="#c65868" />
              <stop offset="1" stopColor="#6f2238" />
            </linearGradient>
            <linearGradient id="ep-cut-myocardium" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#b65b6b" />
              <stop offset="0.48" stopColor="#84384f" />
              <stop offset="1" stopColor="#4b2438" />
            </linearGradient>
            <linearGradient id="ep-endocardium" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#d88b95" stopOpacity=".44" />
              <stop offset="1" stopColor="#6e2d45" stopOpacity=".12" />
            </linearGradient>
            <marker id="ep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8Z" fill="rgba(203,213,225,.48)" />
            </marker>
          </defs>

          <g className="ep-great-vessels" aria-hidden="true">
            <path className="ep-vessel ep-vessel-venous" d="M83 5 C82 27 83 49 87 71" />
            <path className="ep-vessel ep-vessel-venous" d="M79 177 C79 150 80 126 84 108" />
            <path className="ep-vessel ep-vessel-arterial" d="M181 113 C181 91 169 80 170 59 C171 35 188 24 208 28 C228 32 237 49 233 69" />
            <path className="ep-vessel-branch ep-vessel-arterial" d="M184 35 L180 8 M203 29 L204 4 M220 36 L230 12" />
            <path className="ep-vessel ep-vessel-pulmonary" d="M137 121 C138 99 140 79 153 64 C165 50 183 49 203 56" />
            <path className="ep-vessel-branch ep-vessel-pulmonary" d="M153 64 C132 55 111 55 91 62 M176 55 C198 57 218 65 235 76" />
            <path className="ep-pulmonary-vein" d="M222 80 L202 87 M226 95 L204 99" />
          </g>
          <g className="ep-vessel-labels" aria-hidden="true">
            <text x="64" y="17">SVC</text>
            <text x="211" y="23">AORTA</text>
            <text x="151" y="55">PA</text>
          </g>

          <path className="ep-heart-shadow" d="M93 57 C72 62 62 81 64 107 C66 132 78 151 94 171 C112 193 135 216 164 235 C171 240 179 239 185 233 C207 211 226 179 234 150 C242 121 237 91 219 72 C204 57 183 53 163 68 C145 52 114 50 93 57Z" />
          <path className="ep-heart-shell" d="M93 57 C72 62 62 81 64 107 C66 132 78 151 94 171 C112 193 135 216 164 235 C171 240 179 239 185 233 C207 211 226 179 234 150 C242 121 237 91 219 72 C204 57 183 53 163 68 C145 52 114 50 93 57Z" />
          <path className="ep-auricle ep-auricle-right" d="M92 59 C78 46 63 52 64 68 C65 82 79 88 94 78Z" />
          <path className="ep-auricle ep-auricle-left" d="M202 62 C213 49 227 55 228 68 C228 81 214 87 201 78Z" />
          <path className="ep-atrium-wall ep-la-wall" d="M159 81 C173 62 198 58 214 69 C229 79 229 100 216 112 C199 122 177 120 155 108Z" />
          <path className="ep-chamber ep-la" d="M166 84 C177 70 196 67 208 75 C218 82 218 96 210 103 C198 111 181 109 164 102Z" />
          <path className="ep-atrium-wall ep-ra-wall" d="M87 59 C110 50 136 60 146 81 C152 94 147 108 138 116 C119 128 89 124 75 110 C62 98 64 73 87 59Z" />
          <path className="ep-chamber ep-ra" d="M91 69 C108 62 129 69 137 84 C142 94 138 103 131 108 C116 116 96 113 84 104 C76 96 77 79 91 69Z" />
          <path className="ep-fossa-ovalis" d="M111 82 C121 81 128 88 125 97 C122 105 110 107 103 100 C96 93 101 84 111 82Z" />
          <path className="ep-av-groove" d="M78 111 C102 124 129 122 151 109 C171 121 198 121 219 108" />
          <g ref={rightVentricleRef} className="ep-ventricular-motion ep-rv-motion">
            <path className="ep-ventricle-wall ep-rv-wall" d="M76 108 C101 121 129 119 151 106 C164 128 170 154 167 181 C164 205 156 223 146 231 C117 213 90 189 75 166 C62 147 63 123 76 108Z" />
            <path className="ep-chamber ep-rv" d="M86 120 C104 129 128 127 145 116 C154 135 158 156 154 179 C152 196 148 209 142 217 C121 202 101 183 89 165 C80 151 79 133 86 120Z" />
            <path className="ep-ventricle-fiber" d="M88 145 C104 153 125 153 146 143 M91 172 C111 187 128 201 144 216" />
            <path className="ep-moderator-band" d="M94 157 C111 164 128 169 145 174" />
            <path className="ep-papillary" d="M111 168 L122 188 M133 157 L141 181" />
          </g>
          <g ref={leftVentricleRef} className="ep-ventricular-motion ep-lv-motion">
            <path className="ep-ventricle-wall ep-lv-wall-shape" d="M151 106 C175 119 200 114 221 101 C237 124 234 154 223 180 C211 208 189 232 175 239 C163 234 153 224 145 211 C153 179 157 140 151 106Z" />
            <path className="ep-chamber ep-lv" d="M165 121 C180 129 197 124 211 114 C220 131 217 151 209 170 C200 192 184 212 174 221 C167 216 162 209 158 201 C164 176 167 145 165 121Z" />
            <path className="ep-endocardial-rim" d="M165 121 C180 129 197 124 211 114 C220 131 217 151 209 170 C200 192 184 212 174 221" />
            <path className="ep-ventricle-fiber" d="M174 127 C179 158 176 192 168 218 M202 126 C211 151 203 181 185 208" />
            <path className="ep-papillary" d="M184 169 L177 194 M202 154 L192 181" />
          </g>
          <path className="ep-septum" d="M150 109 C157 139 161 177 151 216" />
          <g className="ep-valves" aria-hidden="true">
            <path className="ep-valve-leaflet" d="M113 109 Q122 128 133 111 M126 110 Q134 126 143 108" />
            <path className="ep-valve-leaflet" d="M160 108 Q171 127 183 109 M173 109 Q183 125 193 106" />
            <path className="ep-semilunar" d="M135 102 Q143 113 152 102 M174 99 Q184 111 194 98" />
            <path className="ep-chordae" d="M120 116 L111 168 M132 115 L133 157 M170 115 L184 169 M184 112 L202 154" />
          </g>
          <g className="ep-anatomy-labels" aria-hidden="true">
            <text x="91" y="94">RA</text><text x="190" y="94">LA</text>
            <text x="104" y="158">RV</text><text x="191" y="158">LV</text>
          </g>

          <g className="ep-base-network">
            <path className="ep-network-atrial" markerEnd="url(#ep-arrow)" d="M92 73 C99 85 119 95 145 105" />
            <path className="ep-network-atrial" markerEnd="url(#ep-arrow)" d="M92 73 C124 59 164 63 198 87 C180 92 164 100 150 108" />
            <path className="ep-network-his" markerEnd="url(#ep-arrow)" d="M150 108 L150 136" />
            <path className="ep-network-bundle" markerEnd="url(#ep-arrow)" d="M150 136 C137 153 126 180 112 213" />
            <path className="ep-network-bundle" markerEnd="url(#ep-arrow)" d="M150 136 C166 153 177 181 191 211" />
            <path className="ep-network-purkinje" markerEnd="url(#ep-arrow)" d="M112 213 C96 196 90 180 87 164 M112 213 C127 198 135 183 139 166" />
            <path className="ep-network-purkinje" markerEnd="url(#ep-arrow)" d="M191 211 C207 194 214 175 216 156 M191 211 C176 194 167 177 162 160" />
          </g>
          <g className="ep-conduction-labels" aria-hidden="true">
            <text x="118" y="164">RBB</text>
            <text x="171" y="164">LBB</text>
            <text x="159" y="121">AV DELAY</text>
          </g>
          <g className="ep-purkinje-callout" aria-hidden="true">
            <path d="M112 211 L101 222 L61 222" />
            <rect x="58" y="211" width="58" height="16" rx="4" />
            <text x="87" y="222" textAnchor="middle">PURKINJE</text>
          </g>

          {showNormal ? <NormalRoute /> : null}

          {mode === "block1" ? <circle pathLength="1" data-pulse-stage="delay-ring" className="ep-delay-ring" cx="150" cy="108" r="13" /> : null}
          {mode === "wenckebach" ? <g data-block-level="av" className="ep-intermittent"><BlockMark x={150} y={122} label="Intermittent AV nodal block" /></g> : null}
          {mode === "mobitz2" ? <g data-block-level="his-purkinje" className="ep-intermittent"><BlockMark x={150} y={144} label="Intermittent block below the AV node" /></g> : null}

          {mode === "af" ? (
            <g>
              {[
                "M75 61 C112 41 132 76 102 96 C77 111 72 78 114 66",
                "M129 53 C149 77 112 108 88 83 C66 60 104 48 130 76",
                "M171 61 C215 41 237 76 207 101 C179 120 158 87 196 68",
                "M203 55 C170 70 180 110 218 104 C243 98 236 65 203 81"
              ].map((d,i)=><path key={d} pathLength="1" className="ep-route ep-continuous ep-chaos" style={{animationPlayState:state,animationDuration:`${(0.38+i*0.07)/speed}s`}} d={d}/>) }
              <PulsePath stage="av-output" className="ep-irregular" d="M150 108 L150 136" />
              <VentricularRoute />
            </g>
          ) : null}

          {mode === "flutter" ? (
            <g>
              <path pathLength="1" className="ep-route ep-continuous ep-loop" style={{animationPlayState:state,animationDuration:`${Math.max(0.3,cycleSeconds/4)}s`}} d="M102 70 C78 67 72 84 78 101 C84 117 105 121 123 111 C137 103 138 82 126 73 C119 67 110 67 102 70Z" />
              <PulsePath stage="av-output" className="ep-av" d="M103 101 C119 104 136 107 150 108 L150 136" />
              <VentricularRoute />
            </g>
          ) : null}

          {mode === "avnrt" ? (
            <g>
              <path pathLength="1" className="ep-route ep-continuous ep-loop" style={{animationPlayState:state,animationDuration:cycle}} d="M150 101 C132 101 129 121 143 130 C160 141 174 124 166 110 C162 103 155 101 150 101Z" />
              <PulsePath stage="av-output" className="ep-vent" d="M150 130 L150 136" />
              <VentricularRoute />
              <PulsePath stage="retrograde" className="ep-retrograde" d="M146 106 C128 93 110 83 92 73 M154 106 C170 97 185 91 199 87" />
            </g>
          ) : null}

          {mode === "complete" ? (
            <g>
              <path pathLength="1" className="ep-route ep-continuous ep-independent ep-atrial" style={{animationPlayState:state,animationDuration:`${(0.8/speed).toFixed(2)}s`}} d="M92 73 C99 85 119 95 145 105 M92 73 C124 59 164 63 198 87" />
              <BlockMark x={150} y={121} label="Complete AV block" />
              <circle className="ep-focus" cx="150" cy="153" r="6" />
              <PulsePath stage="escape" className="ep-escape" d="M150 153 C132 171 121 193 112 213 M150 153 C169 170 181 192 191 211" />
            </g>
          ) : null}

          {["ventricular","pvc1","pvc2","diffuse"].includes(mode) ? (
            <g>
              {mode === "diffuse" ? <PulsePath stage="diffuse" className="ep-diffuse" d="M92 73 C117 86 135 105 150 132 C127 149 111 178 101 210 C133 188 162 168 201 147 C189 170 176 194 174 216" /> : null}
              {mode !== "diffuse" ? <circle className="ep-focus" cx={mode === "pvc2" ? 199 : 112} cy={mode === "pvc2" ? 189 : 190} r="6" /> : null}
              <PulsePath stage="ectopic" className="ep-ectopic" d={mode === "pvc2" ? "M199 189 C174 168 147 172 119 205 M199 189 C214 174 219 157 217 143 M107 179 C126 164 151 158 181 175" : "M112 190 C134 165 160 157 192 183 M112 190 C98 180 89 163 88 145"} />
              {mode === "pvc2" ? <circle className="ep-focus ep-focus-alt" cx="107" cy="179" r="5" /> : null}
            </g>
          ) : null}

          {mode === "vf" ? (
            <g>
              {[
                "M92 151 C121 132 147 157 126 181 C105 205 84 181 104 164",
                "M139 151 C172 132 195 153 174 180 C151 207 133 183 153 163",
                "M175 176 C214 153 230 181 203 207 C183 224 161 202 183 185",
                "M86 194 C112 174 138 202 117 217"
              ].map((d,i)=><path key={d} pathLength="1" className="ep-route ep-continuous ep-chaos ep-chaos-v" style={{animationPlayState:state,animationDuration:`${(0.27+i*0.06)/speed}s`}} d={d}/>) }
            </g>
          ) : null}

          {mode === "lbbb" || mode === "rbbb" ? (
            <g>
              <g data-block-level={mode}><BlockMark x={mode === "lbbb" ? 166 : 134} y="158" label={`${mode === "lbbb" ? "Left" : "Right"} bundle branch block`} /></g>
              <PulsePath stage="cell-to-cell" className="ep-cell-to-cell" d={mode === "lbbb" ? "M112 205 C139 194 162 186 191 208" : "M191 205 C162 194 141 187 112 210"} />
            </g>
          ) : null}

          {mode === "wpw" ? <PulsePath stage="accessory" className="ep-accessory" d="M202 83 C226 102 221 129 208 146 C194 162 187 181 185 202" /> : null}

          {mode === "junctional" ? (
            <g>
              <circle className="ep-focus" cx="150" cy="108" r="6" />
              <PulsePath stage="retrograde" className="ep-retrograde" d="M150 108 C131 97 111 85 92 73 M150 108 C167 100 183 93 200 87" />
              <PulsePath stage="av-output" className="ep-vent" d="M150 108 L150 136" />
              <VentricularRoute />
            </g>
          ) : null}

          {showPacerA || showPacerV ? (
            <g>
              <rect className="ep-pacer" x="244" y="48" width="33" height="38" rx="6" />
              <path className="ep-pacer-bolt" d="M260 55 L254 67 H261 L257 78 L269 63 H262 L266 55Z" />
              {showPacerA ? <PulsePath stage="pacer-a" className="ep-pacer-lead" d="M244 66 C215 65 183 57 164 67 C139 81 113 70 91 62" /> : null}
              {showPacerV ? <PulsePath stage="pacer-v" className="ep-pacer-lead" d="M244 72 C216 72 184 58 160 67 C136 79 119 105 115 137 C112 165 112 190 112 211" /> : null}
              {mode === "pacedBiV" ? <PulsePath stage="pacer-lv" className="ep-pacer-lead" d="M244 72 C226 82 213 99 211 118 C209 148 203 181 191 211" /> : null}
              {mode === "pacedV" || mode === "pacedDual" || mode === "pacedBiV" ? <PulsePath stage="paced-wave-rv" className="ep-ectopic" d="M112 211 C139 184 161 174 191 207 M112 211 C93 190 84 166 86 144" /> : null}
              {mode === "pacedBiV" ? <PulsePath stage="paced-wave-lv" className="ep-ectopic" d="M191 211 C168 183 146 175 113 207 M191 211 C207 190 215 167 216 144" /> : null}
            </g>
          ) : null}

          {mode === "pea" ? <g className="ep-pea-label"><rect x="81" y="219" width="138" height="18" rx="4"/><text x="150" y="232" textAnchor="middle">ELECTRICITY ≠ PULSE</text></g> : null}
          {mode === "asystole" ? <g className="ep-asystole"><line x1="84" y1="157" x2="216" y2="157"/><text x="150" y="181" textAnchor="middle">NO ACTIVE PATHWAY</text></g> : null}

          <g className="ep-nodes">
            <circle className={mode === "asystole" ? "off" : ""} cx="92" cy="73" r="5" /><text x="75" y="70">SA</text>
            <circle className={mode === "asystole" ? "off" : ""} cx="150" cy="108" r="5" /><text x="158" y="106">AV</text>
            <circle className={mode === "asystole" ? "off" : ""} cx="150" cy="136" r="4" /><text x="158" y="139">HIS</text>
          </g>
          </svg>
        </div>
      </div>
      <div className="electrical-copy" aria-live="polite">
        <strong>{profile.origin}</strong>
        <span>{profile.detail}</span>
      </div>
      <div className="electrical-legend"><span><i className="ep-key-active"/>active impulse</span><span><i className="ep-key-base"/>conduction tissue</span></div>
    </section>
  );
});

export default ElectricalPathway;
