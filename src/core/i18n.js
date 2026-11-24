/**
 * Mapa de nombres de notas americanas a su equivalente en cifrado latino.
 */
export const AMERICAN_TO_LATIN_NOTE = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si'
};

/**
 * Mapa inverso de nombres de notas latinas a cifrado americano.
 */
export const LATIN_TO_AMERICAN_NOTE = {
  Do: 'C',
  Re: 'D',
  Mi: 'E',
  Fa: 'F',
  Sol: 'G',
  La: 'A',
  Si: 'B'
};

/**
 * Etiquetas legibles para los instrumentos soportados por la app.
 */
export const INSTRUMENT_LABELS = {
  'guitarra-clasica': 'Guitarra clásica',
  guitarra: 'Guitarra',
  bajo: 'Bajo',
  piano: 'Piano'
};

/**
 * Etiquetas legibles para los tipos principales de práctica.
 */
export const PRACTICE_TYPE_LABELS = {
  melody: 'Melodía',
  harmony: 'Armonía',
  mixed: 'Mixta'
};

/**
 * Etiquetas legibles para las categorías de prácticas (melódicas y armónicas).
 */
export const CATEGORY_LABELS = {
  escala: 'Escalas',
  acordes: 'Acordes',
  lectura: 'Lectura',
  ritmo: 'Ritmo / Groove',
  walking: 'Walking bass',
  arpegio: 'Arpegios',
  formas: 'Formas de acorde',
  inversiones: 'Inversiones',
  cambios: 'Cambios de acorde',
  'conduccion-de-voces': 'Conducción de voces',
  'campo-armonico': 'Campo armónico',
  acompanamiento: 'Acompañamiento',
  'arpegios-de-acorde': 'Arpegios de acorde',
  oido: 'Entrenamiento de oído',
  repertorio: 'Repertorio'
};

/**
 * Etiquetas legibles para los estados de derechos de autor del módulo Repertorio.
 */
export const RIGHTS_LABELS = {
  public_domain: 'Dominio público',
  harmony_only: 'Solo armonía',
  user_import: 'Importada'
};

/**
 * Etiquetas legibles para los estilos musicales del repertorio.
 */
export const STYLE_LABELS = {
  jazz: 'Jazz',
  blues: 'Blues',
  bossa: 'Bossa nova',
  barroco: 'Barroco',
  'clasico-romantico': 'Clásico-romántico',
  tradicional: 'Tradicional',
  tango: 'Tango'
};

/**
 * Etiquetas legibles con tildes correctas para los tags internos de voicings.
 */
export const VOICING_TAG_LABELS = {
  abierto: 'Abierto',
  'clásica': 'Clásica',
  cejilla: 'Cejilla',
  CAGED: 'CAGED',
  triada: 'Tríada',
  inversion: 'Inversión',
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  shell: 'Shell',
  power: 'Power chord',
  extension: 'Extensión',
  alterado: 'Alterado',
  decima: 'Décima',
  diada: 'Díada',
  guias: 'Notas guía',
  sugerido: 'Sugerido',
  propio: 'Mi acorde'
};

/**
 * Formatea una etiqueta interna de voicing con ortografía correcta en español.
 * @param {string} tag Clave de etiqueta.
 * @returns {string} Etiqueta legible con tildes.
 */
export function formatVoicingTag(tag) {
  return VOICING_TAG_LABELS[tag] || tag;
}

/**
 * Divide un símbolo de acorde ya formateado en parte base (raíz + 'm' normal, nunca superíndice)
 * y extensión/tensión opcional (7, maj7, 9, 13, b5, etc.) más bajo alternativo (/E).
 * @param {string} chordSymbol Símbolo de acorde americano.
 * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
 * @returns {{ base: string, ext: string, bass: string }} Partes listas para tipografía limpia.
 */
export function splitChordTypography(chordSymbol, notation = 'americano') {
  const formatted = formatChordSymbol(chordSymbol, notation);
  const [main, bass = ''] = formatted.split('/');
  // Mantiene raíz + 'm' menor (ej. "Em", "Am", "Mim") en línea normal, sin capturar la 'm' de "maj7"
  const match = main.match(/^((?:Do|Re|Mi|Fa|Sol|La|Si|[A-G])[#b♯♭]?(?:m(?!aj))?)(.*)$/);
  if (!match) return { base: main, ext: '', bass };
  const [, base, rawExt] = match;
  const ext = rawExt.replace(/b/g, '♭').replace(/#/g, '♯');
  return { base, ext, bass };
}

/**
 * Etiquetas legibles para los instrumentos de síntesis de audio.
 */
export const SYNTH_INSTRUMENT_LABELS = {
  'nylon-guitar': 'Guitarra de nylon',
  'acoustic-guitar': 'Guitarra acústica',
  'electric-bass': 'Bajo eléctrico',
  'acoustic-bass': 'Bajo acústico',
  'acoustic-piano': 'Piano acústico',
  'electric-piano': 'Piano eléctrico'
};

/**
 * Etiquetas legibles para los modos de vista de notación.
 */
export const NOTATION_VIEW_LABELS = {
  pentagrama: 'Pentagrama',
  cifrado: 'Cifrado',
  mixto: 'Mixto'
};

/**
 * Etiquetas para las subdivisiones del metrónomo.
 */
export const SUBDIVISION_LABELS = {
  1: 'Negra (1)',
  2: 'Corchea (2)',
  3: 'Tresillo (3)',
  4: 'Semicorchea (4)'
};

/**
 * Etiquetas para los timbres del metrónomo.
 */
export const METRONOME_SOUND_LABELS = {
  woodblock: 'Clave de madera',
  click: 'Clic digital',
  rimshot: 'Aro de caja',
  beep: 'Tono suave'
};

/**
 * Convierte un símbolo de acorde entre cifrado americano (C, Dm7, G7/B) y latino (Do, Rem7, Sol7/Si).
 * @param {string} chordSymbol Símbolo de acorde en formato americano.
 * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado destino.
 * @returns {string} Acorde formateado según el sistema elegido.
 */
export function formatChordSymbol(chordSymbol, notation = 'americano') {
  if (!chordSymbol || typeof chordSymbol !== 'string') return '';
  const trimmed = chordSymbol.trim();
  if (notation !== 'latino') return trimmed;

  // Divide acorde con bajo invertido (ej. "G7/B" -> ["G7", "B"])
  const parts = trimmed.split('/');
  const converted = parts.map((part) => {
    const match = part.match(/^([A-G])([#b♯♭]?)(.*)$/);
    if (!match) return part;
    const [, root, accidental, suffix] = match;
    const latinRoot = AMERICAN_TO_LATIN_NOTE[root] || root;
    return `${latinRoot}${accidental}${suffix}`;
  });
  return converted.join('/');
}

/**
 * Convierte un nombre de tonalidad (ej. "Bb", "F#m") al formato elegido.
 * @param {string} keyName Tonalidad en cifrado americano.
 * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado destino.
 * @returns {string} Tonalidad formateada.
 */
export function formatKeyName(keyName, notation = 'americano') {
  return formatChordSymbol(keyName, notation);
}

/**
 * Transforma únicamente los símbolos de acorde dentro de comillas en un texto ABC
 * cuando el usuario elige cifrado latino, sin alterar anotaciones de digitación (^, _, <, >, @).
 * @param {string} abcText Partitura en notación ABC.
 * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado destino.
 * @returns {string} Texto ABC con los cifrados adaptados para renderizado.
 */
export function formatAbcChordsForDisplay(abcText, notation = 'americano') {
  if (!abcText || notation !== 'latino') return abcText || '';
  return abcText.replace(/"([^"]+)"/g, (full, inner) => {
    // Las anotaciones ABC que empiezan con ^ _ < > @ no son acordes
    if (/^[\^_<>@]/.test(inner)) {
      return full;
    }
    if (/^[A-G][#b]?/.test(inner)) {
      return `"${formatChordSymbol(inner, 'latino')}"`;
    }
    return full;
  });
}

/**
 * Formatea una duración en segundos a texto compacto en español (ej. "12 min", "1 h 15 min").
 * @param {number} totalSeconds Cantidad total de segundos.
 * @returns {string} Texto legible de duración.
 */
export function formatStudyDuration(totalSeconds) {
  const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (safe < 60) return `${safe} seg`;
  const mins = Math.floor(safe / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours} h ${remMins} min` : `${hours} h`;
}

/**
 * Formatea una fecha ISO a formato legible en español de Argentina.
 * @param {string|null|undefined} isoString Fecha en formato ISO 8601.
 * @returns {string} Fecha formateada o "Nunca" si está vacía.
 */
export function formatDateEsAR(isoString) {
  if (!isoString) return 'Todavía sin sesiones';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Devuelve la clave de fecha local YYYY-MM-DD para cálculos de racha diaria.
 * @param {Date} [date=new Date()] Instancia de fecha.
 * @returns {string} Cadena YYYY-MM-DD.
 */
export function toLocalDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
