import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { PRESET_TUNINGS, Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';
import { computePianoVoiceLeading, generatePianoVoicings } from './PianoVoicingService.js';
import { VoicingGenerator } from './VoicingGenerator.js';

/**
 * Instrumentos seleccionables para el diseño y visualización de digitaciones de acordes.
 */
export const VOICING_INSTRUMENT_OPTIONS = [
  { id: 'guitarra', label: 'Guitarra (6c)', tuningId: 'guitar-standard', baseInstrument: 'guitar' },
  { id: 'guitarra-clasica', label: 'Guitarra clásica', tuningId: 'guitar-standard', baseInstrument: 'guitar' },
  { id: 'bajo', label: 'Bajo (4c)', tuningId: 'bass-4-standard', baseInstrument: 'bass' },
  { id: 'bajo-5', label: 'Bajo (5c)', tuningId: 'bass-5-standard', baseInstrument: 'bass' },
  { id: 'piano', label: 'Piano', tuningId: null, baseInstrument: 'piano' }
];

/**
 * Catálogo de criterios musicales y técnicos para plantear distintos diseños de digitación
 * sobre una misma progresión de acordes, según el especialista en teoría y técnica instrumental.
 */
export const FINGERING_DESIGN_CRITERIA = {
  'conduccion-minima': {
    id: 'conduccion-minima',
    label: 'Conducción mínima de voces',
    shortLabel: 'Conducción mínima',
    instruments: ['guitarra', 'guitarra-clasica', 'bajo', 'bajo-5'],
    description: 'Minimiza el movimiento total de semitonos entre acordes consecutivos, conservando notas comunes y enlaces por semitono/tono.',
    pedagogicalTip: 'Observá qué dedos pueden quedar apoyados como pivote entre un acorde y el siguiente.'
  },
  'posicion-abierta': {
    id: 'posicion-abierta',
    label: 'Posición abierta (trastes 1–4)',
    shortLabel: 'Posición abierta',
    instruments: ['guitarra', 'guitarra-clasica'],
    description: 'Prioriza cuerdas al aire y primera posición para máxima resonancia acústica, arpegios p-i-m-a y baja tensión en mano izquierda.',
    pedagogicalTip: 'Dejá resonar las cuerdas al aire mientras anticipás los dedos del siguiente acorde.'
  },
  'zona-fija-media': {
    id: 'zona-fija-media',
    label: 'Zona fija del mango (trastes 5–9)',
    shortLabel: 'Zona fija (5–9)',
    instruments: ['guitarra', 'guitarra-clasica', 'bajo', 'bajo-5'],
    description: 'Mantiene toda la progresión dentro de la región central del mango para evitar traslados bruscos de mano izquierda.',
    pedagogicalTip: 'Pensá en una «caja» de 4–5 trastes y resolvé cada cambio dentro de esa misma zona.'
  },
  'shell-guia': {
    id: 'shell-guia',
    label: 'Acordes Shell / Notas guía (3.ª y 7.ª)',
    shortLabel: 'Shell / Guía',
    instruments: ['guitarra', 'bajo', 'bajo-5'],
    description: 'Voicings económicos de 2–3 notas (R–3–7 / R–7–3 o díadas en bajo), ideales para swing, bossa, tempos rápidos y no invadir al solista.',
    pedagogicalTip: 'Escuchá cómo la 7.ª de cada acorde resuelve medio tono hacia la 3.ª del siguiente.'
  },
  'drop-2-cantable': {
    id: 'drop-2-cantable',
    label: 'Drop 2 / Voz superior cantable',
    shortLabel: 'Drop 2 cantable',
    instruments: ['guitarra', 'guitarra-clasica'],
    description: 'Prioriza voicings Drop 2 y bloques en cuerdas agudas buscando que la voz más aguda trace una melodía suave (estilo chord-melody).',
    pedagogicalTip: 'Proyectá suavemente la nota más aguda para que la progresión suene con sentido melódico.'
  },
  'bajo-enlazado': {
    id: 'bajo-enlazado',
    label: 'Bajo enlazado por grado conjunto',
    shortLabel: 'Bajo enlazado',
    instruments: ['guitarra', 'guitarra-clasica', 'bajo', 'bajo-5'],
    description: 'Elige inversiones y posiciones donde la nota más grave avance por grados conjuntos o semitonos, generando una línea de bajo fluida.',
    pedagogicalTip: 'Seguí con el oído la línea del bajo independiente como si fuera una segunda melodía.'
  },
  'bajo-acordes-altos': {
    id: 'bajo-acordes-altos',
    label: 'Acordes de bajo (registro medio-agudo)',
    shortLabel: 'Acordes de bajo',
    instruments: ['bajo', 'bajo-5'],
    description: 'Voicings idiomáticos para bajo eléctrico (décimas, shells en cuerdas A–D–G y tríadas desde traste 5+) respetando el Low Interval Limit.',
    pedagogicalTip: 'Evitá intervalos cerrados debajo del traste 5 en cuerdas graves para mantener claridad armónica.'
  },
  'piano-enlazado': {
    id: 'piano-enlazado',
    label: 'Piano: conducción suave (inversiones)',
    shortLabel: 'Enlazado',
    instruments: ['piano'],
    pianoStyle: 'cerrado',
    description: 'Enlaza tríadas y cuatríadas con inversiones cerradas en mano derecha y bajo claro en mano izquierda, manteniendo notas comunes.',
    pedagogicalTip: 'Dejá apoyadas las notas comunes entre acordes y mové solo los dedos necesarios.'
  },
  'piano-shell': {
    id: 'piano-shell',
    label: 'Piano: Shell / Drop 2 (dos manos)',
    shortLabel: 'Shell / Drop 2',
    instruments: ['piano'],
    pianoStyle: 'shell',
    description: 'Combina esqueletos R–7 / R–5 en mano izquierda con 3.ª, color y tensiones limpias en mano derecha respetando el Low Interval Limit.',
    pedagogicalTip: 'Escuchá el enlace por semitono entre la 7.ª de un acorde y la 3.ª del siguiente.'
  },
  'piano-rootless': {
    id: 'piano-rootless',
    label: 'Piano: Rootless Jazz (Bill Evans MI)',
    shortLabel: 'Rootless MI',
    instruments: ['piano'],
    pianoStyle: 'rootless',
    description: 'Voicings Tipo A y B en mano izquierda sin fundamental, dejando la mano derecha libre para melodía o improvisación.',
    pedagogicalTip: 'Alterná entre Tipo A (3–5–7–9) y Tipo B (7–9–3–5) sobre los ii–V–I.'
  }
};

/**
 * Normaliza un identificador de instrumento hacia uno de los 5 instrumentos de digitación soportados.
 * @param {string} instrument Identificador de instrumento.
 * @returns {'guitarra'|'guitarra-clasica'|'bajo'|'bajo-5'|'piano'} Instrumento normalizado.
 */
export function normalizeVoicingInstrument(instrument) {
  if (instrument === 'piano') return 'piano';
  if (instrument === 'bajo-5' || instrument === 'bass-5') return 'bajo-5';
  if (instrument === 'bajo' || instrument === 'bass') return 'bajo';
  if (instrument === 'guitarra-clasica' || instrument === 'classical') return 'guitarra-clasica';
  return 'guitarra';
}

/**
 * Devuelve la afinación Tuning correspondiente al instrumento de digitación elegido (en piano usa respaldo neutro).
 * @param {string} voicingInstrument Instrumento ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5' | 'piano').
 * @returns {Tuning} Afinación estándar del instrumento.
 */
export function getTuningForVoicingInstrument(voicingInstrument) {
  const norm = normalizeVoicingInstrument(voicingInstrument);
  const opt = VOICING_INSTRUMENT_OPTIONS.find((o) => o.id === norm) || VOICING_INSTRUMENT_OPTIONS[0];
  return new Tuning(PRESET_TUNINGS[opt.tuningId] || PRESET_TUNINGS['guitar-standard']);
}

/**
 * Servicio de dominio puro que implementa los criterios del especialista en teoría musical
 * y técnica instrumental para diseñar, evaluar y comparar distintas digitaciones sobre un mismo tema.
 */
export class FingeringDesignService {
  /**
   * Inicializa el diseñador con un generador de voicings inyectable.
   * @param {VoicingGenerator} [voicingGenerator] Generador algorítmico de voicings.
   */
  constructor(voicingGenerator = new VoicingGenerator()) {
    /** Generador algorítmico de voicings para ampliar candidatos cuando hace falta. */
    this._gen = voicingGenerator;
  }

  /**
   * Lista los criterios de diseño de digitación disponibles para el instrumento seleccionado.
   * @param {string} voicingInstrument Instrumento elegido.
   * @returns {Array<object>} Lista de criterios ordenados pedagógicamente.
   */
  getAvailableCriteria(voicingInstrument) {
    const norm = normalizeVoicingInstrument(voicingInstrument);
    return Object.values(FINGERING_DESIGN_CRITERIA).filter((c) => c.instruments.includes(norm));
  }

  /**
   * Devuelve el criterio de digitación predeterminado más adecuado para el instrumento y estilo de práctica.
   * @param {string} voicingInstrument Instrumento elegido.
   * @param {object|null} [practice=null] Práctica actual (para adaptar al estilo jazz/clásica/nivel).
   * @returns {string} ID del criterio recomendado.
   */
  getRecommendedCriterion(voicingInstrument, practice = null) {
    const norm = normalizeVoicingInstrument(voicingInstrument);
    if (norm === 'piano') {
      if (practice?.style === 'jazz' || practice?.style === 'bossa') return 'piano-shell';
      return 'piano-enlazado';
    }
    if (norm === 'bajo' || norm === 'bajo-5') {
      return 'bajo-acordes-altos';
    }
    if (norm === 'guitarra-clasica') {
      return practice?.level && practice.level >= 4 ? 'conduccion-minima' : 'posicion-abierta';
    }
    if (practice?.style === 'jazz' || practice?.style === 'bossa') {
      return 'shell-guia';
    }
    if (practice?.level && practice.level <= 2) {
      return 'posicion-abierta';
    }
    return 'conduccion-minima';
  }

  /**
   * Reúne todos los voicings candidatos (curados, propios del usuario y sugeridos algorítmicamente)
   * para un acorde concreto en el instrumento elegido, sin duplicados.
   * @param {string} chordSymbol Símbolo de acorde americano.
   * @param {string} voicingInstrument Instrumento destino.
   * @param {Array<object>} [customChords=[]] Acordes propios guardados en UserProgress.
   * @returns {Voicing[]} Lista deduplicada de voicings ejecutables.
   */
  getCandidateVoicingsForChord(chordSymbol, voicingInstrument, customChords = []) {
    const norm = normalizeVoicingInstrument(voicingInstrument);
    if (norm === 'piano') {
      try {
        return generatePianoVoicings(chordSymbol);
      } catch {
        return [];
      }
    }
    const tuning = getTuningForVoicingInstrument(norm);
    const isBass = tuning.instrument === 'bass';
    const baseInst = isBass ? 'bass' : 'guitar';

    const pool = [];
    const seenKeys = new Set();

    const pushUnique = (v) => {
      if (!v) return;
      const inst = v instanceof Voicing ? v : new Voicing(v);
      if (inst.frets.length !== tuning.stringCount) return;
      const key = inst.frets.map((f) => (f === null ? 'x' : f)).join('-');
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      pool.push(inst);
    };

    // 1) Acordes propios del usuario que coincidan con el acorde y cantidad de cuerdas
    const targetChord = Chord.parse(chordSymbol).americanSymbol;
    for (const raw of customChords || []) {
      try {
        if (Chord.parse(raw.chord).americanSymbol === targetChord) {
          pushUnique(raw);
        }
      } catch {
        // Ignora acordes mal formados
      }
    }

    // 2) Voicings curados de la biblioteca para la afinación exacta (4c, 5c o guitarra 6c)
    const curated = getCuratedVoicingsForChord(chordSymbol, baseInst, tuning);
    for (const v of curated) pushUnique(v);

    // 3) Si hay pocos candidatos (o para ofrecer más inversiones/zonas), complementa con el generador
    if (pool.length < 6) {
      try {
        const sets = isBass
          ? (tuning.stringCount === 5 ? [[1, 3, 4], [2, 3, 4], [1, 4], [0, 2, 3]] : [[0, 2, 3], [1, 2, 3], [0, 3]])
          : [[1, 2, 3, 4], [2, 3, 4, 5], [0, 2, 3, 4]];
        for (const stringSet of sets) {
          const generated = this._gen.generate(chordSymbol, {
            tuning,
            stringSet,
            minFret: isBass ? 3 : 0,
            maxFret: isBass ? 16 : 12,
            allowSkippedStrings: true,
            limit: 4
          });
          for (const g of generated) pushUnique(g);
        }
      } catch {
        // Si algún acorde raro falla en generación, conserva los curados
      }
    }

    return pool;
  }

  /**
   * Diseña la secuencia óptima de digitaciones para una progresión completa según el criterio elegido,
   * usando programación dinámica (camino de costo mínimo) para equilibrar idoneidad individual
   * y fluidez de transición entre acordes consecutivos.
   * @param {object} params Parámetros de diseño.
   * @param {Array<object>} params.steps Pasos de la progresión ({ chord, bars, section, voicingId }).
   * @param {string} [params.voicingInstrument='guitarra'] Instrumento de digitación.
   * @param {string} [params.criterionId='conduccion-minima'] Criterio musical/técnico a aplicar.
   * @param {Array<object>} [params.customChords=[]] Voicings propios del usuario.
   * @param {Record<number, Voicing|string>} [params.overrides={}] Anulaciones manuales por índice de paso.
   * @returns {object} Plan de digitación completo con pasos enriquecidos, candidatos y métricas.
   */
  designProgression({
    steps = [],
    voicingInstrument = 'guitarra',
    criterionId = 'conduccion-minima',
    customChords = [],
    overrides = {}
  }) {
    const normInst = normalizeVoicingInstrument(voicingInstrument);
    const tuning = getTuningForVoicingInstrument(normInst);
    const available = this.getAvailableCriteria(normInst);
    const criterion =
      available.find((c) => c.id === criterionId) ||
      available[0] ||
      FINGERING_DESIGN_CRITERIA['conduccion-minima'];

    if (!Array.isArray(steps) || steps.length === 0) {
      return {
        criterion,
        voicingInstrument: normInst,
        tuning,
        steps: [],
        metrics: {
          averageFret: 0,
          maxShiftFrets: 0,
          totalVoiceLeadingSemitones: 0,
          avgVoiceLeadingSemitones: 0,
          commonTonesTotal: 0,
          bassMotionSemitones: 0,
          summaryLabel: 'Sin acordes'
        }
      };
    }

    // Ruta nativa de Piano: conducción de voces Viterbi sobre voicings pianísticos (MI + MD)
    if (normInst === 'piano') {
      const pianoStyle = criterion.pianoStyle || 'todos';
      const led = computePianoVoiceLeading(
        steps.map((s) => s.chord),
        { style: pianoStyle }
      );
      let cursorBar = 1;
      let totalVl = 0;
      let commonTotal = 0;
      const enrichedSteps = steps.map((step, idx) => {
        const candidates = this.getCandidateVoicingsForChord(step.chord, 'piano');
        const override = overrides[idx];
        const manualVoicing = override
          ? (override?.isPianoVoicing ? override : candidates.find((c) => c.id === override) || null)
          : null;
        const autoEntry = led[idx] || null;
        const voicing = manualVoicing || autoEntry?.voicing || candidates[0] || null;
        const startMeasure = cursorBar;
        cursorBar += Number(step.bars) || 1;
        if (idx > 0 && autoEntry) {
          totalVl += autoEntry.voiceLeadingCost || 0;
          commonTotal += autoEntry.commonTones || 0;
        }
        return {
          ...step,
          startMeasure: Math.floor(startMeasure),
          voicing,
          midis: voicing ? voicing.getMidiNotes() : [],
          candidates,
          isManualOverride: Boolean(manualVoicing),
          rationale: voicing ? voicing.label : ''
        };
      });
      const avgVl = steps.length > 1 ? Math.round((totalVl / (steps.length - 1)) * 10) / 10 : 0;
      return {
        criterion,
        voicingInstrument: 'piano',
        tuning: null,
        steps: enrichedSteps,
        metrics: {
          averageFret: 0,
          maxShiftFrets: 0,
          totalVoiceLeadingSemitones: totalVl,
          avgVoiceLeadingSemitones: avgVl,
          commonTonesTotal: commonTotal,
          bassMotionSemitones: 0,
          summaryLabel: `Piano · enlace ~${avgVl} st · ${commonTotal} notas comunes`
        }
      };
    }

    // 1) Obtiene los candidatos por paso (respetando overrides manuales si los hay)
    const candidatesPerStep = steps.map((step, idx) => {
      const all = this.getCandidateVoicingsForChord(step.chord, normInst, customChords);
      const override = overrides[idx];
      if (override) {
        const chosen = override instanceof Voicing
          ? override
          : all.find((v) => v.id === override) || null;
        if (chosen) {
          return { all, pool: [chosen] };
        }
      }
      return { all, pool: all.length > 0 ? all : [null] };
    });

    // 2) Programación dinámica (Viterbi) para optimizar costo individual + costo de transición
    const dpCosts = [];
    const dpBack = [];

    for (let i = 0; i < steps.length; i++) {
      const pool = candidatesPerStep[i].pool;
      const costs = new Array(pool.length).fill(Infinity);
      const back = new Array(pool.length).fill(-1);

      for (let j = 0; j < pool.length; j++) {
        const v = pool[j];
        const unary = this._unaryScore(v, criterion.id, normInst, tuning);
        if (i === 0) {
          costs[j] = unary;
        } else {
          const prevPool = candidatesPerStep[i - 1].pool;
          for (let k = 0; k < prevPool.length; k++) {
            const trans = this._transitionScore(prevPool[k], v, criterion.id, tuning);
            const total = dpCosts[i - 1][k] + unary + trans;
            if (total < costs[j]) {
              costs[j] = total;
              back[j] = k;
            }
          }
        }
      }
      dpCosts.push(costs);
      dpBack.push(back);
    }

    // Reconstruye el camino de costo mínimo desde el último paso
    const chosenIndices = new Array(steps.length).fill(0);
    let bestLast = 0;
    const lastRow = dpCosts[steps.length - 1];
    for (let j = 1; j < lastRow.length; j++) {
      if (lastRow[j] < lastRow[bestLast]) bestLast = j;
    }
    chosenIndices[steps.length - 1] = bestLast;
    for (let i = steps.length - 1; i > 0; i--) {
      chosenIndices[i - 1] = Math.max(0, dpBack[i][chosenIndices[i]]);
    }

    // 3) Construye pasos enriquecidos + métricas pedagógicas transparentes
    let fretSum = 0;
    let fretCount = 0;
    let maxShiftFrets = 0;
    let totalVoiceLeadingSemitones = 0;
    let commonTonesTotal = 0;
    let bassMotionSemitones = 0;
    let transitions = 0;

    const enrichedSteps = steps.map((step, idx) => {
      const voicing = candidatesPerStep[idx].pool[chosenIndices[idx]] || null;
      const prevVoicing = idx > 0 ? candidatesPerStep[idx - 1].pool[chosenIndices[idx - 1]] : null;
      const avgFret = this._averagePlayedFret(voicing);

      if (avgFret !== null) {
        fretSum += avgFret;
        fretCount += 1;
      }

      let linkInfo = null;
      if (prevVoicing && voicing) {
        linkInfo = this._measureTransition(prevVoicing, voicing, tuning);
        maxShiftFrets = Math.max(maxShiftFrets, linkInfo.fretShift);
        totalVoiceLeadingSemitones += linkInfo.voiceDistance;
        commonTonesTotal += linkInfo.commonTones;
        bassMotionSemitones += linkInfo.bassJump;
        transitions += 1;
      }

      return {
        ...step,
        voicing,
        voicingId: voicing?.id || step.voicingId || null,
        candidates: candidatesPerStep[idx].all,
        isManualOverride: Boolean(overrides[idx]),
        rationale: this._buildStepRationale(voicing, linkInfo, criterion.id, tuning)
      };
    });

    const averageFret = fretCount > 0 ? Math.round((fretSum / fretCount) * 10) / 10 : 0;
    const avgVoiceLeadingSemitones =
      transitions > 0 ? Math.round((totalVoiceLeadingSemitones / transitions) * 10) / 10 : 0;

    return {
      criterion,
      voicingInstrument: normInst,
      tuning,
      steps: enrichedSteps,
      metrics: {
        averageFret,
        maxShiftFrets: Math.round(maxShiftFrets * 10) / 10,
        totalVoiceLeadingSemitones,
        avgVoiceLeadingSemitones,
        commonTonesTotal,
        bassMotionSemitones,
        summaryLabel: `Traste medio ${averageFret || 1} · salto máx. ${Math.round(maxShiftFrets)} tr. · enlace ${avgVoiceLeadingSemitones} st`
      }
    };
  }

  /**
   * Calcula y compara todos los criterios de diseño disponibles para una misma progresión e instrumento.
   * @param {object} params Parámetros ({ steps, voicingInstrument, customChords }).
   * @returns {Array<object>} Lista de planes diseñados listos para comparar lado a lado.
   */
  compareDesigns({ steps = [], voicingInstrument = 'guitarra', customChords = [] }) {
    const criteria = this.getAvailableCriteria(voicingInstrument);
    return criteria.map((c) =>
      this.designProgression({
        steps,
        voicingInstrument,
        criterionId: c.id,
        customChords
      })
    );
  }

  /**
   * Calcula el costo individual (menor = mejor) de un voicing según el criterio y técnica del instrumento.
   * @param {Voicing|null} voicing Voicing candidato.
   * @param {string} criterionId Criterio activo.
   * @param {string} normInst Instrumento normalizado.
   * @param {Tuning} tuning Afinación activa.
   * @returns {number} Costo heurístico.
   */
  _unaryScore(voicing, criterionId, normInst, tuning) {
    if (!voicing) return 100;
    const tags = new Set((voicing.tags || []).map((t) => String(t).toLowerCase()));
    const avgFret = this._averagePlayedFret(voicing) ?? 5;
    const hasOpen = voicing.frets.some((f) => f === 0);
    const hasBarre = (voicing.barres || []).length > 0;
    const midis = voicing.getMidiNotes(tuning);
    const lowMidi = midis[0] ?? 40;
    const isBass = tuning.instrument === 'bass';

    // Penalización base por comodidad en guitarra clásica (evitar posiciones muy altas innecesarias)
    let score = normInst === 'guitarra-clasica' && avgFret > 9 ? (avgFret - 9) * 1.5 : 0;

    if (criterionId === 'posicion-abierta') {
      score += avgFret * 2.4;
      if (hasOpen || tags.has('abierto')) score -= 6;
      if (hasBarre) score += 2.5;
      if (normInst === 'guitarra-clasica' && tags.has('clásica')) score -= 2.5;
      return score;
    }

    if (criterionId === 'zona-fija-media') {
      // Centro ideal en traste 7 (zona 5–9)
      score += Math.abs(avgFret - 7) * 2.2;
      if (avgFret < 4 || avgFret > 10) score += 4;
      return score;
    }

    if (criterionId === 'shell-guia') {
      if (tags.has('shell') || tags.has('guias') || tags.has('diada')) score -= 9;
      if (midis.length >= 2 && midis.length <= 3) score -= 3;
      if (midis.length >= 5) score += 4;
      score += Math.abs(avgFret - 6) * 0.6;
      return score;
    }

    if (criterionId === 'drop-2-cantable') {
      if (tags.has('drop2') || tags.has('drop3')) score -= 9;
      if (tags.has('triada')) score -= 2.5;
      // Prefiere las 4 cuerdas más agudas para que cante la melodía superior
      const highestStr = voicing.frets.reduce((acc, f, i) => (f !== null ? i : acc), 0);
      if (highestStr === tuning.stringCount - 1) score -= 2;
      score += Math.abs(avgFret - 6.5) * 0.5;
      return score;
    }

    if (criterionId === 'bajo-enlazado') {
      if (tags.has('inversion') || voicing.inversion > 0) score -= 2.2;
      score += Math.abs(avgFret - 5) * 0.4;
      return score;
    }

    if (criterionId === 'bajo-acordes-altos') {
      // Respeta Low Interval Limit: en bajo, los acordes claros brillan desde traste 5–14
      if (isBass) {
        if (tags.has('decima') || tags.has('shell') || tags.has('triada') || tags.has('diada')) score -= 6;
        if (avgFret < 5) score += (5 - avgFret) * 2.5;
        if (avgFret > 14) score += (avgFret - 14) * 1.5;
        // Penaliza intervalos cerrados muy graves (< MIDI 43 = G2)
        if (midis.length >= 2 && midis[1] - midis[0] <= 4 && lowMidi < 43) score += 10;
      }
      return score;
    }

    // Por defecto ('conduccion-minima'): ligero sesgo a zona cómoda y voicings curados
    score += Math.abs(avgFret - (isBass ? 7 : 5)) * 0.35;
    if (voicing.suggested) score += 1.2;
    return score;
  }

  /**
   * Calcula el costo de transición entre dos voicings consecutivos según el criterio elegido.
   * @param {Voicing|null} prev Voicing anterior.
   * @param {Voicing|null} next Voicing siguiente.
   * @param {string} criterionId Criterio activo.
   * @param {Tuning} tuning Afinación activa.
   * @returns {number} Costo de transición (menor = enlace más fluido).
   */
  _transitionScore(prev, next, criterionId, tuning) {
    if (!prev || !next) return 0;
    const m = this._measureTransition(prev, next, tuning);

    if (criterionId === 'conduccion-minima') {
      return m.voiceDistance * 1.8 + m.fretShift * 0.9 - m.commonTones * 2.2 + m.topMotion * 0.6;
    }
    if (criterionId === 'zona-fija-media') {
      return m.fretShift * 2.8 + m.voiceDistance * 0.7 - m.commonTones * 0.8;
    }
    if (criterionId === 'drop-2-cantable') {
      // Premia melodía superior fluida (grados conjuntos de 0 a 3 semitonos)
      const melodyPenalty = m.topMotion <= 3 ? m.topMotion * 0.6 : m.topMotion * 2.4;
      return melodyPenalty + m.voiceDistance * 1.1 + m.fretShift * 0.7 - m.commonTones * 1.2;
    }
    if (criterionId === 'bajo-enlazado') {
      // Premia movimiento del bajo por semitono o grado conjunto (1–3 semitonos)
      const bassPenalty = m.bassJump <= 2 ? m.bassJump * 0.5 : m.bassJump * 2.8;
      return bassPenalty + m.voiceDistance * 0.8 + m.fretShift * 0.6;
    }
    if (criterionId === 'posicion-abierta') {
      return m.fretShift * 1.4 + m.voiceDistance * 0.5 - m.commonTones * 1.0;
    }
    // shell-guia / bajo-acordes-altos
    return m.voiceDistance * 1.3 + m.fretShift * 1.4 - m.commonTones * 1.4;
  }

  /**
   * Mide objetivamente la distancia de conducción de voces, notas comunes, salto de traste,
   * movimiento de voz superior y movimiento de bajo entre dos voicings.
   * @param {Voicing} prev Voicing anterior.
   * @param {Voicing} next Voicing siguiente.
   * @param {Tuning} tuning Afinación activa.
   * @returns {{ voiceDistance: number, commonTones: number, fretShift: number, topMotion: number, bassJump: number }} Métricas.
   */
  _measureTransition(prev, next, tuning) {
    const a = prev.getMidiNotes(tuning);
    const b = next.getMidiNotes(tuning);
    const setB = new Set(b);
    const commonTones = a.filter((m) => setB.has(m)).length;

    // Empareja cada nota de A con la nota más cercana de B para medir conducción real
    let voiceDistance = 0;
    if (a.length > 0 && b.length > 0) {
      for (const ma of a) {
        let best = Infinity;
        for (const mb of b) {
          const d = Math.abs(ma - mb);
          if (d < best) best = d;
        }
        voiceDistance += best;
      }
      voiceDistance = Math.round((voiceDistance / a.length) * 10) / 10;
    }

    const avgA = this._averagePlayedFret(prev) ?? 1;
    const avgB = this._averagePlayedFret(next) ?? 1;
    const fretShift = Math.abs(avgA - avgB);
    const topMotion = a.length > 0 && b.length > 0 ? Math.abs(a[a.length - 1] - b[b.length - 1]) : 0;
    const bassJump = a.length > 0 && b.length > 0 ? Math.abs(a[0] - b[0]) : 0;

    return { voiceDistance, commonTones, fretShift, topMotion, bassJump };
  }

  /**
   * Calcula el traste promedio pisado (o 0.5 si es posición abierta) de un voicing.
   * @param {Voicing|null} voicing Voicing a evaluar.
   * @returns {number|null} Traste promedio o null.
   */
  _averagePlayedFret(voicing) {
    if (!voicing || !Array.isArray(voicing.frets)) return null;
    const fretted = voicing.frets.filter((f) => typeof f === 'number' && f > 0);
    if (fretted.length === 0) return 0.5;
    return fretted.reduce((s, f) => s + f, 0) / fretted.length;
  }

  /**
   * Genera una explicación breve en español de por qué el especialista eligió ese voicing en ese compás.
   * @param {Voicing|null} voicing Voicing elegido.
   * @param {object|null} linkInfo Métrica de transición desde el paso anterior.
   * @param {string} criterionId Criterio activo.
   * @param {Tuning} tuning Afinación activa.
   * @returns {string} Justificación pedagógica concisa.
   */
  _buildStepRationale(voicing, linkInfo, criterionId, tuning) {
    if (!voicing) return 'Sin diagrama disponible';
    const pos = voicing.getPositionLabel();
    if (!linkInfo) {
      if (criterionId === 'bajo-acordes-altos') return `${pos} · registro claro (LIL)`;
      if (criterionId === 'shell-guia') return `${pos} · notas guía (3.ª y 7.ª)`;
      return `${pos} · ${voicing.getUsedStringsLabel(tuning)}`;
    }
    const parts = [];
    if (linkInfo.commonTones > 0) {
      parts.push(`${linkInfo.commonTones} nota${linkInfo.commonTones === 1 ? '' : 's'} común${linkInfo.commonTones === 1 ? '' : 'es'}`);
    }
    if (criterionId === 'bajo-enlazado' && linkInfo.bassJump <= 2) {
      parts.push(`bajo por ${linkInfo.bassJump === 0 ? 'pedal' : linkInfo.bassJump === 1 ? 'semitono' : 'grado conjunto'}`);
    } else if (criterionId === 'drop-2-cantable' && linkInfo.topMotion <= 2) {
      parts.push(`voz aguda fluida (${linkInfo.topMotion} st)`);
    } else {
      parts.push(`enlace ${linkInfo.voiceDistance} st`);
    }
    return parts.join(' · ');
  }
}
