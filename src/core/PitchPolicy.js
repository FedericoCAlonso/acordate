import { abcPitchToMidi, noteNameToMidi } from './MusicTheory.js';

/**
 * Política única de registro, clave, transposición de octava y afinación por instrumento.
 * Ningún otro módulo de la aplicación debe aplicar desplazamientos de octava por su cuenta.
 */
export const INSTRUMENT_PITCH_POLICY = {
  'guitarra-clasica': {
    clef: 'treble-8',
    /** La guitarra clásica suena una octava más grave que lo escrito en clave de sol octavada. */
    writtenToSoundingSemitones: -12,
    /** Mi grave al aire (6.ª cuerda) = E2 (MIDI 40). */
    minSoundingMidi: 40,
    /** Registro agudo práctico hasta traste 19 de 1.ª cuerda (B5 = MIDI 83). */
    maxSoundingMidi: 83,
    /** Cuerdas al aire de la guitarra clásica (6.ª a 1.ª) en alturas MIDI reales. */
    openStrings: [
      { stringNumber: 6, label: 'E', latinLabel: 'Mi', note: 'E2', midi: 40 },
      { stringNumber: 5, label: 'A', latinLabel: 'La', note: 'A2', midi: 45 },
      { stringNumber: 4, label: 'D', latinLabel: 'Re', note: 'D3', midi: 50 },
      { stringNumber: 3, label: 'G', latinLabel: 'Sol', note: 'G3', midi: 55 },
      { stringNumber: 2, label: 'B', latinLabel: 'Si', note: 'B3', midi: 59 },
      { stringNumber: 1, label: 'E', latinLabel: 'Mi', note: 'E4', midi: 64 }
    ]
  },
  guitarra: {
    clef: 'treble-8',
    /** La guitarra suena una octava más grave que lo escrito en clave de sol octavada. */
    writtenToSoundingSemitones: -12,
    /** Mi grave al aire (6.ª cuerda) = E2 (MIDI 40). */
    minSoundingMidi: 40,
    /** Registro agudo práctico hasta traste 22 de 1.ª cuerda (D6 = MIDI 86). */
    maxSoundingMidi: 86,
    /** Cuerdas al aire de la guitarra estándar (6.ª a 1.ª) en alturas MIDI reales. */
    openStrings: [
      { stringNumber: 6, label: 'E', latinLabel: 'Mi', note: 'E2', midi: 40 },
      { stringNumber: 5, label: 'A', latinLabel: 'La', note: 'A2', midi: 45 },
      { stringNumber: 4, label: 'D', latinLabel: 'Re', note: 'D3', midi: 50 },
      { stringNumber: 3, label: 'G', latinLabel: 'Sol', note: 'G3', midi: 55 },
      { stringNumber: 2, label: 'B', latinLabel: 'Si', note: 'B3', midi: 59 },
      { stringNumber: 1, label: 'E', latinLabel: 'Mi', note: 'E4', midi: 64 }
    ]
  },
  bajo: {
    clef: 'bass',
    /** El bajo eléctrico/acústico suena una octava más grave que lo escrito en clave de fa. */
    writtenToSoundingSemitones: -12,
    /** Mi grave al aire (4.ª cuerda) = E1 (MIDI 28). */
    minSoundingMidi: 28,
    /** Registro agudo práctico de 4 cuerdas (G4 = MIDI 67). */
    maxSoundingMidi: 67,
    /** Cuerdas al aire del bajo de 4 cuerdas (4.ª a 1.ª) en alturas MIDI reales. */
    openStrings: [
      { stringNumber: 4, label: 'E', latinLabel: 'Mi', note: 'E1', midi: 28 },
      { stringNumber: 3, label: 'A', latinLabel: 'La', note: 'A1', midi: 33 },
      { stringNumber: 2, label: 'D', latinLabel: 'Re', note: 'D2', midi: 38 },
      { stringNumber: 1, label: 'G', latinLabel: 'Sol', note: 'G2', midi: 43 }
    ]
  }
};

/**
 * Desplazamiento en semitonos según el ajuste de registro de escucha del usuario.
 */
export const LISTENING_REGISTER_OFFSETS = {
  real: 0,
  '+1oct': 12
};

/**
 * Obtiene la política de registro correspondiente a un instrumento (o deduce por clave).
 * @param {string} instrumentOrClef Nombre de instrumento ('guitarra-clasica' | 'guitarra' | 'bajo') o clave ABC.
 * @returns {typeof INSTRUMENT_PITCH_POLICY.guitarra} Política de registro aplicable.
 */
export function getPitchPolicy(instrumentOrClef = 'guitarra') {
  if (INSTRUMENT_PITCH_POLICY[instrumentOrClef]) {
    return INSTRUMENT_PITCH_POLICY[instrumentOrClef];
  }
  if (typeof instrumentOrClef === 'string' && instrumentOrClef.startsWith('bass')) {
    return INSTRUMENT_PITCH_POLICY.bajo;
  }
  return INSTRUMENT_PITCH_POLICY.guitarra;
}

/**
 * Devuelve el desplazamiento en semitonos correspondiente al modo de escucha elegido ('real' o '+1oct').
 * @param {'real'|'+1oct'} [listeningRegister='real'] Modo de registro de escucha.
 * @returns {number} Semitonos adicionales (0 o +12).
 */
export function getListeningOffset(listeningRegister = 'real') {
  return LISTENING_REGISTER_OFFSETS[listeningRegister] ?? 0;
}

/**
 * Convierte una altura MIDI escrita en partitura al número MIDI real que debe sonar,
 * aplicando exactamente una vez la transposición propia del instrumento/clave.
 * @param {number} writtenMidi Número MIDI de la nota escrita (donde C central = 60).
 * @param {string} [instrumentOrClef='guitarra'] Instrumento o tipo de clave ABC.
 * @param {'real'|'+1oct'} [listeningRegister='real'] Registro de escucha opcional.
 * @returns {number} Número MIDI que debe reproducir el sintetizador.
 */
export function writtenMidiToSoundingMidi(writtenMidi, instrumentOrClef = 'guitarra', listeningRegister = 'real') {
  // Si se pasa explícitamente clave de sol sin octavar ('treble') no transpone; en instrumentos transpositores sí
  const shift =
    instrumentOrClef === 'treble'
      ? 0
      : getPitchPolicy(instrumentOrClef).writtenToSoundingSemitones;
  return writtenMidi + shift + getListeningOffset(listeningRegister);
}

/**
 * Convierte una altura MIDI real del instrumento a la altura MIDI escrita en su pentagrama.
 * Útil para los generadores de escalas, progresiones y walking bass.
 * @param {number} soundingMidi Altura MIDI real deseada.
 * @param {string} [instrument='guitarra'] Instrumento destino.
 * @returns {number} Altura MIDI escrita en ABC.
 */
export function soundingMidiToWrittenMidi(soundingMidi, instrument = 'guitarra') {
  const policy = getPitchPolicy(instrument);
  return soundingMidi - policy.writtenToSoundingSemitones;
}

/**
 * Función pura de referencia que calcula el número MIDI esperado para una nota escrita
 * (en notación científica como "C4", "E3", "E2" o en notación ABC como "C", "E,", "E,,").
 * Ejemplos de referencia real:
 * - expectedMidi('guitarra', 'C4') === 48 (Do de 5.ª cuerda traste 3)
 * - expectedMidi('guitarra', 'E3') === 40 (Mi grave al aire 6.ª cuerda)
 * - expectedMidi('bajo', 'E2') === 28 (Mi grave al aire 4.ª cuerda)
 * @param {'guitarra-clasica'|'guitarra'|'bajo'} instrument Instrumento de la práctica.
 * @param {string} writtenNote Nota escrita (científica "C4" o token ABC "C", "E,", "E,,").
 * @param {'real'|'+1oct'} [listeningRegister='real'] Registro de escucha.
 * @param {Record<string, number>|null} [keyMap=null] Armadura de clave opcional si es token ABC.
 * @returns {number} Número MIDI real esperado.
 */
export function expectedMidi(instrument, writtenNote, listeningRegister = 'real', keyMap = null) {
  const trimmed = String(writtenNote || '').trim();
  let writtenMidi;
  if (/^[A-Ga-g][#b]?-?\d$/.test(trimmed)) {
    writtenMidi = noteNameToMidi(trimmed);
  } else {
    writtenMidi = abcPitchToMidi(trimmed, keyMap);
  }
  if (writtenMidi === null || !Number.isFinite(writtenMidi)) {
    throw new Error(`No se pudo interpretar la nota escrita "${writtenNote}".`);
  }
  return writtenMidiToSoundingMidi(writtenMidi, instrument, listeningRegister);
}

/**
 * Aplica únicamente el desplazamiento de registro de escucha ('real' o '+1oct') sobre una altura MIDI real.
 * @param {number} soundingMidi Altura MIDI real calculada por PitchPolicy.
 * @param {'real'|'+1oct'} [listeningRegister='real'] Preferencia de escucha.
 * @returns {number} Altura MIDI final para síntesis.
 */
export function applyListeningRegister(soundingMidi, listeningRegister = 'real') {
  return soundingMidi + getListeningOffset(listeningRegister);
}

/**
 * Devuelve las cuerdas al aire de referencia de afinación para guitarra o bajo.
 * @param {'guitarra-clasica'|'guitarra'|'bajo'} instrument Instrumento.
 * @returns {Array<{ stringNumber: number, label: string, latinLabel: string, note: string, midi: number }>} Lista de cuerdas al aire.
 */
export function getTuningStrings(instrument = 'guitarra') {
  return [...getPitchPolicy(instrument).openStrings];
}
