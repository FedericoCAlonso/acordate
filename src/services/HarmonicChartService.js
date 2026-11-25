/**
 * Servicio puro de dominio para construir una representación única y coherente de grilla de cifrado
 * (`HarmonicBar[]`) utilizable en prácticas de armonía pura (`harmony`), mixtas (`mixed`) y melódicas (`melody`).
 * Unifica secciones formales (A/B/C), compases partidos (ej. `| Dm7 | G7 |` o `| Dm7 G7 |`),
 * índices de paso para resaltado en vivo y variaciones precalculadas de lookahead (`chorusPlan`).
 */

/**
 * Construye la lista normalizada de compases armónicos para la vista de Cifrado.
 * Prioriza `harmonySteps` (cuando existen en prácticas `harmony` o `mixed`), y cae a
 * `exerciseMeasures` en prácticas puramente melódicas con cifrado ABC.
 *
 * @param {object} params Fuentes armónicas disponibles.
 * @param {Array<object>} [params.harmonySteps=[]] Pasos armónicos resueltos de `FingeringDesignerViewModel`.
 * @param {Array<{ index: number, chords: string[] }>} [params.exerciseMeasures=[]] Compases extraídos del ABC.
 * @param {object|null} [params.chorusPlan=null] Plan de coro precalculado (en modos Orgánico/Vivo).
 * @param {string} [params.compingFeel='fijo'] Feel activo.
 * @returns {Array<{
 *   measureNumber: number,
 *   section: string|null,
 *   slots: Array<{ chord: string, stepIndex: number, bars: number }>,
 *   primaryStepIndex: number,
 *   liveSequence: Array<object>|null
 * }>} Compases ordenados listos para renderizado uniforme.
 */
export function buildHarmonicChartBars({
  harmonySteps = [],
  exerciseMeasures = [],
  chorusPlan = null,
  compingFeel = 'fijo'
} = {}) {
  const showLive = compingFeel !== 'fijo' && Boolean(chorusPlan?.barsSummary);
  const resolveLiveSequence = (measureNumber) => {
    if (!showLive) return null;
    const summary = chorusPlan?.barsSummary?.[measureNumber];
    if (!summary || !Array.isArray(summary.sequence) || summary.sequence.length === 0) return null;
    const hasInteresting = summary.sequence.some((it) => it.isVariation || it.isAnticipation);
    return hasInteresting ? summary.sequence : null;
  };

  // 1) Ruta preferida: pasos armónicos estructurados (prácticas harmony y mixed)
  if (Array.isArray(harmonySteps) && harmonySteps.length > 0) {
    const barsMap = new Map();
    let barCursor = 0;

    harmonySteps.forEach((step, stepIdx) => {
      const durBars = Math.max(0.25, Number(step.bars) || 1);
      const startPos = barCursor;
      const endPos = barCursor + durBars;
      const firstMeasure = Math.floor(startPos + 1e-6) + 1;
      const lastMeasure = Math.max(firstMeasure, Math.ceil(endPos - 1e-6));

      for (let m = firstMeasure; m <= lastMeasure; m++) {
        if (!barsMap.has(m)) {
          barsMap.set(m, {
            measureNumber: m,
            section: null,
            slots: [],
            primaryStepIndex: stepIdx,
            liveSequence: resolveLiveSequence(m)
          });
        }
        const entry = barsMap.get(m);
        if (m === firstMeasure && step.section && !entry.section) {
          entry.section = step.section;
        }
        const sliceBars = Math.min(m, endPos) - Math.max(m - 1, startPos);
        entry.slots.push({
          chord: step.chord,
          stepIndex: stepIdx,
          bars: Number(sliceBars.toFixed(2))
        });
      }
      barCursor = endPos;
    });

    return [...barsMap.values()].sort((a, b) => a.measureNumber - b.measureNumber);
  }

  // 2) Respaldo: compases extraídos directamente de la partitura ABC (prácticas melody con cifrado)
  if (Array.isArray(exerciseMeasures) && exerciseMeasures.length > 0) {
    return exerciseMeasures.map((m, idx) => {
      const measureNumber = Number(m.index) || idx + 1;
      const chords = Array.isArray(m.chords) ? m.chords.filter(Boolean) : [];
      return {
        measureNumber,
        section: null,
        slots: chords.length > 0
          ? chords.map((ch) => ({ chord: ch, stepIndex: -1, bars: Number((1 / chords.length).toFixed(2)) }))
          : [],
        primaryStepIndex: -1,
        liveSequence: resolveLiveSequence(measureNumber)
      };
    });
  }

  return [];
}
