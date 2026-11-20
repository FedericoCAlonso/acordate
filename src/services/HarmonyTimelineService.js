import { parseTimeSignature } from '../core/MusicTheory.js';
import { findVoicingById, getCuratedVoicingsForChord } from '../data/voicings.js';
import { normalizeVoicingInstrument } from './FingeringDesignService.js';

/**
 * Construye una línea de tiempo reproducible de armonía pura a partir de pasos resueltos
 * (`harmonySteps`) con sus alturas MIDI reales y el compás de la práctica.
 * @param {object} params Parámetros de construcción.
 * @param {string} [params.timeSignature='4/4'] Compás de la práctica.
 * @param {Array<{ bars: number, chord: string, midis: number[], rhythm?: string|null }>} [params.harmonySteps=[]] Pasos armónicos resueltos.
 * @param {string} [params.voicingInstrument='guitarra'] Instrumento de digitación activo.
 * @returns {object} Timeline lista para `AudioSynthService.loadTimeline`.
 */
export function buildHarmonyTimeline({
  timeSignature = '4/4',
  harmonySteps = [],
  voicingInstrument = 'guitarra'
}) {
  const { beats, beatUnit } = parseTimeSignature(timeSignature || '4/4');
  const beatsPerMeasure = beats * (4 / beatUnit);
  const vInst = normalizeVoicingInstrument(voicingInstrument);
  const isBassPiece = vInst === 'bajo' || vInst === 'bajo-5';

  let cursorBeat = 0;
  const chords = (harmonySteps || []).map((step, idx) => {
    const durBeats = (Number(step.bars) || 1) * beatsPerMeasure;
    const measureIndex = Math.floor(cursorBeat / beatsPerMeasure) + 1;
    const ev = {
      beat: cursorBeat,
      durationBeats: durBeats,
      symbol: step.chord,
      measureIndex,
      stepIndex: idx,
      voicingMidis: step.midis || [],
      rhythm: step.rhythm || null
    };
    cursorBeat += durBeats;
    return ev;
  });

  const totalBeats = Math.max(beatsPerMeasure, cursorBeat);
  return {
    notes: [],
    chords,
    totalBeats,
    beatsPerMeasure,
    beatUnit,
    measureCount: Math.max(1, Math.ceil(totalBeats / beatsPerMeasure)),
    isBassPiece,
    isHarmonyOnly: true
  };
}

/**
 * Construye la línea de tiempo armónica de vista previa para un borrador del Editor
 * resolviendo el Voicing de cada paso contra voicings personalizados y curados.
 * @param {object} params Parámetros del formulario.
 * @param {string} [params.timeSignature='4/4'] Compás del formulario.
 * @param {Array<object>} [params.progression=[]] Pasos de progresión del borrador.
 * @param {Array<object>} [params.customVoicings=[]] Voicings personalizados del borrador.
 * @param {import('../models/Tuning.js').Tuning} params.tuning Afinación activa.
 * @returns {object} Timeline armónica para vista previa.
 */
export function buildEditorHarmonyTimeline({
  timeSignature = '4/4',
  progression = [],
  customVoicings = [],
  tuning
}) {
  const isBass = tuning.instrument === 'bass';
  const fam = isBass ? 'bass' : 'guitar';
  const resolvedSteps = (progression || []).map((st) => {
    const v =
      findVoicingById(st.voicingId, customVoicings, st.chord, fam) ||
      getCuratedVoicingsForChord(st.chord, fam, tuning)[0];
    return {
      bars: Number(st.bars) || 1,
      chord: st.chord,
      midis: v ? v.getMidiNotes(tuning) : [],
      rhythm: st.rhythm || null
    };
  });

  return buildHarmonyTimeline({
    timeSignature,
    harmonySteps: resolvedSteps,
    voicingInstrument: isBass ? 'bajo' : 'guitarra'
  });
}

/**
 * Inyecta los `voicingMidis` exactos de `harmonySteps` dentro de una timeline extraída de abcjs
 * (prácticas de tipo `mixed`).
 * @param {object|null} timeline Timeline base extraída de abcjs.
 * @param {object} params Parámetros armónicos.
 */
export function enrichTimelineWithHarmonyVoicings(timeline, { timeSignature, harmonySteps, voicingInstrument }) {
  if (!timeline || !Array.isArray(harmonySteps) || harmonySteps.length === 0) return;
  const harmonyTl = buildHarmonyTimeline({ timeSignature, harmonySteps, voicingInstrument });
  if (harmonyTl.chords.length > 0) {
    timeline.chords = harmonyTl.chords;
  }
}

/**
 * Extrae las secciones formales marcadas (A, B, C…) de una progresión armónica con su rango de compases.
 * @param {Array<{ section?: string|null, startMeasure?: number }>} harmonySteps Pasos resueltos.
 * @param {number} totalMeasures Total de compases de la práctica.
 * @returns {Array<{ label: string, startMeasure: number, endMeasure: number }>} Secciones detectadas.
 */
export function extractFormSections(harmonySteps = [], totalMeasures = 1) {
  const safeTotal = Math.max(1, Number(totalMeasures) || 1);
  const markers = [];
  let lastLabel = null;

  for (const step of harmonySteps || []) {
    if (step.section && step.section !== lastLabel) {
      lastLabel = step.section;
      markers.push({ label: step.section, startMeasure: Math.max(1, step.startMeasure || 1) });
    }
  }
  if (markers.length === 0) return [];

  return markers.map((mk, idx) => ({
    label: mk.label,
    startMeasure: mk.startMeasure,
    endMeasure: idx + 1 < markers.length ? Math.max(mk.startMeasure, markers[idx + 1].startMeasure - 1) : safeTotal
  }));
}
