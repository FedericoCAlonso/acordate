/**
 * Patrones de acompañamiento armónico (comping) reproducibles sobre una progresión de acordes.
 * Cada patrón define su etiqueta, representación visual de mano derecha (flechas ↓↑ o p-i-m-a),
 * feeling rítmico y modo de síntesis.
 */
export const COMPING_PATTERNS = {
  'negras-abajo': {
    id: 'negras-abajo',
    label: 'Rasgueo en negras',
    patternDisplay: '↓  ↓  ↓  ↓',
    feeling: 'straight',
    mode: 'strum-down',
    hitsPerBar: 4
  },
  bloque: {
    id: 'bloque',
    label: 'Acordes en bloque (redondas/blancas)',
    patternDisplay: '■  (sostenido)',
    feeling: 'straight',
    mode: 'block',
    hitsPerBar: 1
  },
  'rasgueo-balada': {
    id: 'rasgueo-balada',
    label: 'Rasgueo balada (abajo-arriba)',
    patternDisplay: '↓   ↓ ↑   ↑ ↓ ↑',
    feeling: 'ballad',
    mode: 'strum-ballad',
    hitsPerBar: 4
  },
  'arpegio-pima': {
    id: 'arpegio-pima',
    label: 'Arpegio clásico p-i-m-a',
    patternDisplay: 'p – i – m – a',
    feeling: 'straight',
    mode: 'arpeggio-pima',
    hitsPerBar: 4
  },
  'arpegio-asc': {
    id: 'arpegio-asc',
    label: 'Arpegio ascendente',
    patternDisplay: 'p – i – m – a ↑',
    feeling: 'straight',
    mode: 'arpeggio-asc',
    hitsPerBar: 4
  },
  vals: {
    id: 'vals',
    label: 'Vals (bajo + acorde + acorde)',
    patternDisplay: 'p  ↓  ↓  (3/4)',
    feeling: 'waltz',
    mode: 'waltz',
    hitsPerBar: 3
  },
  bossa: {
    id: 'bossa',
    label: 'Bossa nova (síncopa)',
    patternDisplay: '■  ·  ■  ·  ·  ■  ·  ■',
    feeling: 'bossa',
    mode: 'bossa',
    hitsPerBar: 4
  },
  'swing-negras': {
    id: 'swing-negras',
    label: 'Swing jazz en negras (Freddie Green)',
    patternDisplay: '↓  ↓>  ↓  ↓>  (swing)',
    feeling: 'swing',
    mode: 'swing-quarters',
    hitsPerBar: 4
  },
  shuffle: {
    id: 'shuffle',
    label: 'Blues shuffle (corchea con swing)',
    patternDisplay: '↓ · ↑  ↓ · ↑  (shuffle)',
    feeling: 'shuffle',
    mode: 'shuffle',
    hitsPerBar: 4
  },
  'balada-lenta': {
    id: 'balada-lenta',
    label: 'Balada jazz (blancas suaves)',
    patternDisplay: '↓  (1–2)   ↓  (3–4)',
    feeling: 'ballad',
    mode: 'ballad-halves',
    hitsPerBar: 2
  },
  'tango-marcato': {
    id: 'tango-marcato',
    label: 'Tango marcato en 4',
    patternDisplay: '↓>  ↓  ↓>  ↓  (marcato)',
    feeling: 'tango',
    mode: 'tango-marcato',
    hitsPerBar: 4
  }
};

/**
 * Modelo de dominio puro que representa un paso (bloque de compases) dentro de una progresión armónica.
 */
export class ProgressionStep {
  /**
   * Construye un paso de progresión con su duración en compases, acorde, voicing, ritmo y sección opcional.
   * @param {{ bars?: number, chord: string, voicingId?: string|null, rhythm?: string|null, section?: string|null }} data Datos del paso.
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
    /** Marcador de sección de la forma del tema (ej. "A", "B", "C", "Intro") o null. */
    this.section = data?.section ? String(data.section).trim() : null;
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
    if (this.section) out.section = this.section;
    return out;
  }
}
