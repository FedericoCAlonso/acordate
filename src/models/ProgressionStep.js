/**
 * Patrones de acompañamiento armónico (comping) reproducibles sobre una progresión de acordes.
 */
export const COMPING_PATTERNS = {
  'negras-abajo': { id: 'negras-abajo', label: 'Rasgueo en negras', mode: 'strum-down', hitsPerBar: 4 },
  bloque: { id: 'bloque', label: 'Acordes en bloque (redondas/blancas)', mode: 'block', hitsPerBar: 1 },
  'rasgueo-balada': { id: 'rasgueo-balada', label: 'Rasgueo balada (abajo-arriba)', mode: 'strum-ballad', hitsPerBar: 4 },
  'arpegio-pima': { id: 'arpegio-pima', label: 'Arpegio clásico p-i-m-a', mode: 'arpeggio-pima', hitsPerBar: 4 },
  'arpegio-asc': { id: 'arpegio-asc', label: 'Arpegio ascendente', mode: 'arpeggio-asc', hitsPerBar: 4 },
  vals: { id: 'vals', label: 'Vals (bajo + acorde + acorde)', mode: 'waltz', hitsPerBar: 3 },
  bossa: { id: 'bossa', label: 'Bossa nova (síncopa)', mode: 'bossa', hitsPerBar: 4 },
  'swing-negras': { id: 'swing-negras', label: 'Comping jazz en negras (Freddie Green)', mode: 'swing-quarters', hitsPerBar: 4 }
};

/**
 * Modelo de dominio puro que representa un paso (bloque de compases) dentro de una progresión armónica.
 */
export class ProgressionStep {
  /**
   * Construye un paso de progresión con su duración en compases, acorde, voicing y ritmo opcional.
   * @param {{ bars?: number, chord: string, voicingId?: string|null, rhythm?: string|null }} data Datos del paso.
   */
  constructor(data) {
    /** Cantidad de compases que dura este acorde (soporta fracciones como 0.5 para dos acordes por compás). */
    this.bars = Math.max(0.25, Number(data?.bars) || 1);
    /** Símbolo del acorde en cifrado americano (ej. "G", "Dm7", "C/E"). */
    this.chord = String(data?.chord || 'C').trim();
    /** Identificador opcional del voicing específico de la biblioteca o personalizado. */
    this.voicingId = data?.voicingId || null;
    /** Patrón de ritmo opcional propio de este paso (hereda el comping general si es null). */
    this.rhythm = data?.rhythm || null;
  }

  /**
   * Serializa el paso a objeto JSON plano.
   * @returns {object} Representación JSON.
   */
  toJSON() {
    const out = {
      bars: this.bars,
      chord: this.chord
    };
    if (this.voicingId) out.voicingId = this.voicingId;
    if (this.rhythm) out.rhythm = this.rhythm;
    return out;
  }
}
