/**
 * Mezcla de volúmenes predeterminada para cualquier práctica sin personalización previa.
 * La voz principal arranca al 100 % para garantizar audibilidad inmediata.
 */
export const DEFAULT_PRACTICE_MIX = Object.freeze({
  melody: 1.0,
  chords: 0.55,
  bass: 0.75,
  metronome: 0.65,
  chordsEnabled: true,
  metronomeEnabled: true
});

/**
 * Normaliza un objeto de mezcla garantizando valores numéricos válidos en [0, 1]
 * y asegurando que la voz principal sea audible si el registro guardado está corrupto.
 * @param {object} [raw] Objeto de mezcla candidato.
 * @returns {{ melody: number, chords: number, bass: number, metronome: number, chordsEnabled: boolean, metronomeEnabled: boolean }} Mezcla saneada.
 */
export function sanitizePracticeMix(raw) {
  const safeNum = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  };
  return {
    melody: safeNum(raw?.melody, DEFAULT_PRACTICE_MIX.melody),
    chords: safeNum(raw?.chords, DEFAULT_PRACTICE_MIX.chords),
    bass: safeNum(raw?.bass, DEFAULT_PRACTICE_MIX.bass),
    metronome: safeNum(raw?.metronome, DEFAULT_PRACTICE_MIX.metronome),
    chordsEnabled: raw?.chordsEnabled !== undefined ? Boolean(raw.chordsEnabled) : DEFAULT_PRACTICE_MIX.chordsEnabled,
    metronomeEnabled: raw?.metronomeEnabled !== undefined ? Boolean(raw.metronomeEnabled) : DEFAULT_PRACTICE_MIX.metronomeEnabled
  };
}
