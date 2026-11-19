import {
  NOTE_TO_PC,
  getKeySignatureMap,
  midiToAbcPitch,
  prefersFlats
} from '../core/MusicTheory.js';
import { getPitchPolicy, soundingMidiToWrittenMidi } from '../core/PitchPolicy.js';
import { Scale, SCALE_DEFINITIONS } from '../models/Scale.js';

/**
 * Configuraciones rítmicas disponibles para el generador de escalas y arpegios.
 */
export const SCALE_RHYTHMS = {
  negras: { label: 'Negras', unitLength: '1/4', notesPerBar: 4, isTriplet: false },
  corcheas: { label: 'Corcheas', unitLength: '1/8', notesPerBar: 8, isTriplet: false },
  tresillos: { label: 'Tresillos de corchea', unitLength: '1/8', notesPerBar: 12, isTriplet: true },
  semicorcheas: { label: 'Semicorcheas', unitLength: '1/16', notesPerBar: 16, isTriplet: false }
};

/**
 * Servicio de dominio puro que genera notación ABC para escalas, modos y arpegios
 * respetando la política única de registro (PitchPolicy) de cada instrumento.
 */
export class ScaleGenerator {
  /**
   * Genera la secuencia de alturas MIDI escritas y su representación ABC completa.
   * @param {object} options Parámetros de generación.
   * @param {string} [options.key='C'] Tonalidad raíz (ej. "C", "F", "Bb", "G").
   * @param {string} [options.type='mayor'] Tipo definido en SCALE_DEFINITIONS.
   * @param {number} [options.octaves=1] Rango en octavas (1 o 2).
   * @param {'negras'|'corcheas'|'tresillos'|'semicorcheas'} [options.rhythm='corcheas'] Figura rítmica.
   * @param {'asc'|'desc'|'asc-desc'} [options.direction='asc-desc'] Dirección de la escala.
   * @param {'guitarra-clasica'|'guitarra'|'bajo'} [options.instrument='guitarra'] Instrumento destino.
   * @param {string} [options.title] Título opcional de la partitura.
   * @returns {{ abc: string, midiNotes: number[], soundingMidiNotes: number[], title: string, key: string, timeSignature: string }} Resultado generado.
   */
  generate(options = {}) {
    const scale = new Scale({
      key: options.key || 'C',
      type: options.type || 'mayor',
      octaves: options.octaves ?? 1,
      direction: options.direction || 'asc-desc'
    });

    const instrument = options.instrument || 'guitarra';
    const policy = getPitchPolicy(instrument);
    const rhythmCfg = SCALE_RHYTHMS[options.rhythm] || SCALE_RHYTHMS.corcheas;
    const rootPc = NOTE_TO_PC[scale.key] ?? 0;

    // Determina la tónica real más cómoda dentro del rango físico del instrumento
    let startSoundingMidi = policy.minSoundingMidi;
    while (startSoundingMidi % 12 !== rootPc) {
      startSoundingMidi += 1;
    }

    const writtenStartMidi = soundingMidiToWrittenMidi(startSoundingMidi, instrument);

    /** Secuencia ascendente de alturas MIDI escritas incluyendo la octava superior. */
    const ascendingWritten = [];
    const ascendingSounding = [];
    for (let oct = 0; oct < scale.octaves; oct++) {
      for (const interval of scale.intervals) {
        ascendingWritten.push(writtenStartMidi + oct * 12 + interval);
        ascendingSounding.push(startSoundingMidi + oct * 12 + interval);
      }
    }
    ascendingWritten.push(writtenStartMidi + scale.octaves * 12);
    ascendingSounding.push(startSoundingMidi + scale.octaves * 12);

    let midiNotes = [];
    let soundingMidiNotes = [];
    if (scale.direction === 'asc') {
      midiNotes = [...ascendingWritten];
      soundingMidiNotes = [...ascendingSounding];
    } else if (scale.direction === 'desc') {
      midiNotes = [...ascendingWritten].reverse();
      soundingMidiNotes = [...ascendingSounding].reverse();
    } else {
      midiNotes = [...ascendingWritten, ...ascendingWritten.slice(0, -1).reverse()];
      soundingMidiNotes = [...ascendingSounding, ...ascendingSounding.slice(0, -1).reverse()];
    }

    const useFlats = prefersFlats(scale.key) || ['menor-natural', 'dorico', 'frigio', 'locrio', 'pentatonica-menor', 'blues', 'm7', 'm7b5', 'dim7'].includes(scale.type);
    const keyHeader = scale.type === 'mayor' ? scale.key : 'C';
    const keyMap = getKeySignatureMap(keyHeader);
    const title = options.title || `${scale.name} en ${scale.key}`;

    const abcTokens = midiNotes.map((m) => midiToAbcPitch(m, useFlats, keyMap));
    const bars = [];
    const perBar = rhythmCfg.notesPerBar;

    for (let i = 0; i < abcTokens.length; i += perBar) {
      const slice = abcTokens.slice(i, i + perBar);
      const missing = perBar - slice.length;
      if (rhythmCfg.isTriplet) {
        const padded = [...slice];
        for (let r = 0; r < missing; r++) padded.push('z');
        const groups = [];
        for (let g = 0; g < padded.length; g += 3) {
          groups.push(`(3${padded[g]}${padded[g + 1]}${padded[g + 2]}`);
        }
        bars.push(groups.join(' '));
      } else {
        const grouped = this._groupNotesForBeaming(slice, rhythmCfg.unitLength);
        if (missing > 0) {
          grouped.push(missing === 1 ? 'z' : `z${missing}`);
        }
        bars.push(grouped.join(' '));
      }
    }

    const lines = [];
    for (let i = 0; i < bars.length; i += 4) {
      const lineBars = bars.slice(i, i + 4);
      const isLastLine = i + 4 >= bars.length;
      lines.push(`${lineBars.join(' | ')}${isLastLine ? ' |]' : ' |'}`);
    }

    const abc = [
      'X:1',
      `T:${title}`,
      'M:4/4',
      `L:${rhythmCfg.unitLength}`,
      `K:${keyHeader} clef=${policy.clef}`,
      ...lines
    ].join('\n');

    return {
      abc,
      midiNotes,
      soundingMidiNotes,
      title,
      key: scale.key,
      timeSignature: '4/4'
    };
  }

  /**
   * Agrupa notas en corcheas o semicorcheas para una lectura clara por pulso.
   * @param {string[]} tokens Notas ABC dentro del compás.
   * @param {string} unitLength Unidad rítmica ABC ('1/4', '1/8', '1/16').
   * @returns {string[]} Grupos formateados para separar con espacios.
   */
  _groupNotesForBeaming(tokens, unitLength) {
    if (unitLength === '1/4') return [...tokens];
    const groupSize = unitLength === '1/16' ? 4 : 2;
    const out = [];
    for (let i = 0; i < tokens.length; i += groupSize) {
      out.push(tokens.slice(i, i + groupSize).join(''));
    }
    return out;
  }

  /**
   * Lista todas las opciones de escalas y arpegios disponibles para la UI del editor.
   * @returns {Array<{ id: string, name: string, kind: string }>} Catálogo de tipos soportados.
   */
  getAvailableTypes() {
    return Object.entries(SCALE_DEFINITIONS).map(([id, def]) => ({
      id,
      name: def.name,
      kind: def.kind
    }));
  }
}
