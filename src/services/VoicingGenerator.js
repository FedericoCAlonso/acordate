import { formatChordSymbol } from '../core/i18n.js';
import { mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';

/**
 * Servicio de dominio puro para:
 * 1) Generar digitaciones (voicings) ejecutables dado un acorde, afinación y juego de cuerdas.
 * 2) Calcular conducción de voces óptima entre acordes consecutivos minimizando movimiento.
 * 3) Generar mapas de notas del acorde sobre el diapasón del bajo (R, 3, 5, 7).
 */
export class VoicingGenerator {
  /**
   * Calcula digitaciones posibles para un acorde sobre un juego de cuerdas dado,
   * respetando extensión máxima de 4 trastes, a lo sumo una cejilla, sin saltos de cuerda
   * intermedios (salvo allowSkippedStrings) y ordenadas por comodidad ergonómica.
   * @param {string} chordSymbol Acorde americano (ej. "Dm7", "C/E", "G7").
   * @param {object} [options={}] Opciones de generación.
   * @param {Tuning} [options.tuning] Afinación destino (por defecto guitarra estándar).
   * @param {number[]} [options.stringSet] Índices de cuerdas 0-based grave->aguda (ej. [2,3,4] = cuerdas 4-3-2).
   * @param {number} [options.maxSpan=4] Extensión máxima entre traste mínimo y máximo pisado.
   * @param {number} [options.maxFret=12] Traste más agudo a explorar.
   * @param {boolean} [options.allowSkippedStrings=false] Permite cuerdas silenciadas en medio.
   * @param {number} [options.limit=12] Máximo de sugerencias a retornar.
   * @returns {Voicing[]} Lista de voicings marcados como suggested: true ordenados por comodidad.
   */
  generate(chordSymbol, options = {}) {
    const chord = Chord.parse(chordSymbol);
    const tuning = options.tuning instanceof Tuning ? options.tuning : Tuning.defaultForInstrument(options.instrument || 'guitar');
    const maxSpan = Math.max(2, Math.min(5, Number(options.maxSpan) || 4));
    const maxFret = Math.max(4, Math.min(15, Number(options.maxFret) || 12));
    const allowSkipped = Boolean(options.allowSkippedStrings);
    const limit = Math.max(1, Math.min(24, Number(options.limit) || 12));

    // Juego de cuerdas por defecto: 4 cuerdas contiguas (o todas las de bajo)
    const defaultSet = tuning.stringCount >= 6 ? [1, 2, 3, 4] : Array.from({ length: tuning.stringCount }, (_, i) => i);
    const stringSet = Array.isArray(options.stringSet) && options.stringSet.length >= 2
      ? [...options.stringSet].sort((a, b) => a - b)
      : defaultSet;

    if (!allowSkipped) {
      for (let i = 1; i < stringSet.length; i++) {
        if (stringSet[i] - stringSet[i - 1] > 1) {
          throw new Error('El juego de cuerdas tiene saltos intermedios; activá allowSkippedStrings si los deseás.');
        }
      }
    }

    const chordPcs = new Set(chord.getPitchClasses());
    // Notas esenciales que deben aparecer: raíz y 3ª (y 7ª si es acorde de séptima)
    const requiredPcs = this._getEssentialPitchClasses(chord);

    const candidates = [];
    const seen = new Set();

    // Recorre ventanas deslizantes de trastes de ancho maxSpan
    for (let windowStart = 0; windowStart <= maxFret - maxSpan + 1; windowStart++) {
      const windowEnd = windowStart + maxSpan - 1;
      const perStringOptions = stringSet.map((sIdx) => {
        const opts = [];
        const openMidi = tuning.strings[sIdx];
        // Opción cuerda al aire si pertenece al acorde y estamos cerca de primera posición
        if (windowStart <= 1 && chordPcs.has(mod12(openMidi))) {
          opts.push(0);
        }
        for (let fret = Math.max(1, windowStart); fret <= windowEnd; fret++) {
          if (chordPcs.has(mod12(openMidi + fret))) {
            opts.push(fret);
          }
        }
        return opts;
      });

      if (perStringOptions.some((opts) => opts.length === 0)) continue;

      const combos = this._cartesianProduct(perStringOptions, 40);
      for (const combo of combos) {
        const fretted = combo.filter((f) => f > 0);
        if (fretted.length > 0) {
          const span = Math.max(...fretted) - Math.min(...fretted);
          if (span > maxSpan - 1) continue;
        }

        // Verifica cobertura de notas esenciales y bajo slash si existe
        const midis = combo.map((f, i) => tuning.getMidiAt(stringSet[i], f));
        const presentPcs = new Set(midis.map((m) => mod12(m)));
        let coversAll = true;
        for (const req of requiredPcs) {
          if (!presentPcs.has(req)) {
            coversAll = false;
            break;
          }
        }
        if (!coversAll) continue;

        if (chord.bassPc !== null && mod12(Math.min(...midis)) !== chord.bassPc) {
          continue;
        }

        // Verifica que no necesite más de 4 dedos (considerando hasta 1 cejilla con dedo 1)
        const fullFrets = Array(tuning.stringCount).fill(null);
        stringSet.forEach((sIdx, i) => {
          fullFrets[sIdx] = combo[i];
        });

        const fingeringResult = this._assignErgonomicFingers(fullFrets);
        if (!fingeringResult) continue;

        const sig = fullFrets.map((f) => (f === null ? 'x' : f)).join('-');
        if (seen.has(sig)) continue;
        seen.add(sig);

        const baseFret = fretted.length > 0 && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
        const v = new Voicing({
          id: `sug-${chord.americanSymbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${sig}`,
          chord: chord.americanSymbol,
          instrument: tuning.instrument,
          frets: fullFrets,
          fingers: fingeringResult.fingers,
          baseFret,
          barres: fingeringResult.barres,
          tags: ['sugerido', stringSet.length === 3 ? 'triada' : 'voicing'],
          movable: !fullFrets.includes(0),
          suggested: true
        });
        v.inversion = v.computeInversion(tuning);
        v.bassNote = v.computeBassNote(tuning, 'americano');

        const comfortScore = this._scoreComfort(fullFrets, fingeringResult, v.inversion);
        candidates.push({ voicing: v, score: comfortScore });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates.slice(0, limit).map((c) => c.voicing);
  }

  /**
   * Genera una progresión con conducción de voces óptima eligiendo inversiones/voicings que
   * minimicen el desplazamiento total de semitonos entre acordes consecutivos.
   * Devuelve además las líneas de conexión (notas comunes y movimientos conjuntos) entre pares.
   * @param {string[]} chordSymbols Lista de acordes de la progresión.
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'guitar'|'bass'} [instrument='guitar'] Instrumento.
   * @returns {Array<{ chord: string, voicing: Voicing, connectionsToNext: Array<{ fromMidi: number, toMidi: number, semitones: number, type: 'comun'|'grado'|'salto' }> }>} Progresión conducida.
   */
  findVoiceLedProgression(chordSymbols, tuning = Tuning.defaultForInstrument('guitar'), instrument = 'guitar') {
    if (!Array.isArray(chordSymbols) || chordSymbols.length === 0) return [];

    // Construye catálogo de candidatos (curados + generados en juegos de cuerdas medios) por acorde
    const pools = chordSymbols.map((sym) => {
      const curated = getCuratedVoicingsForChord(sym, instrument, tuning);
      const gen432 = tuning.stringCount >= 6
        ? this.generate(sym, { tuning, stringSet: [2, 3, 4], maxFret: 10, limit: 4 })
        : [];
      const gen321 = tuning.stringCount >= 6
        ? this.generate(sym, { tuning, stringSet: [3, 4, 5], maxFret: 10, limit: 4 })
        : [];
      const gen5432 = tuning.stringCount >= 6
        ? this.generate(sym, { tuning, stringSet: [1, 2, 3, 4], maxFret: 10, limit: 4 })
        : this.generate(sym, { tuning, maxFret: 10, limit: 4 });
      const merged = [...curated, ...gen5432, ...gen432, ...gen321];
      return merged.length > 0 ? merged : [new Voicing({ chord: sym, instrument })];
    });

    // Programación dinámica liviana para minimizar el movimiento total de voces entre pasos consecutivos
    const dpCost = pools.map((pool) => Array(pool.length).fill(Infinity));
    const dpPrev = pools.map((pool) => Array(pool.length).fill(-1));

    for (let j = 0; j < pools[0].length; j++) {
      // Prefiere comenzar en una posición cómoda (traste base <= 7)
      dpCost[0][j] = pools[0][j].baseFret * 0.4;
    }

    for (let i = 1; i < pools.length; i++) {
      for (let j = 0; j < pools[i].length; j++) {
        const curMidis = pools[i][j].getMidiNotes(tuning);
        for (let k = 0; k < pools[i - 1].length; k++) {
          const prevMidis = pools[i - 1][k].getMidiNotes(tuning);
          const dist = this._voiceLeadingDistance(prevMidis, curMidis);
          const total = dpCost[i - 1][k] + dist;
          if (total < dpCost[i][j]) {
            dpCost[i][j] = total;
            dpPrev[i][j] = k;
          }
        }
      }
    }

    // Reconstruye el camino óptimo
    const lastRow = dpCost[pools.length - 1];
    let bestIdx = 0;
    for (let j = 1; j < lastRow.length; j++) {
      if (lastRow[j] < lastRow[bestIdx]) bestIdx = j;
    }

    const chosen = Array(pools.length);
    let cursor = bestIdx;
    for (let i = pools.length - 1; i >= 0; i--) {
      chosen[i] = pools[i][cursor];
      cursor = dpPrev[i][cursor];
    }

    return chosen.map((voicing, i) => {
      const next = i + 1 < chosen.length ? chosen[i + 1] : null;
      const connectionsToNext = next
        ? this._computeVoiceConnections(voicing.getMidiNotes(tuning), next.getMidiNotes(tuning))
        : [];
      return {
        chord: chordSymbols[i],
        voicing,
        connectionsToNext
      };
    });
  }

  /**
   * Genera el mapa de notas de un acorde sobre el diapasón del bajo (raíz, 3ª, 5ª, 7ª)
   * dentro de un rango de trastes determinado.
   * @param {string} chordSymbol Acorde americano.
   * @param {Tuning} [tuning] Afinación del bajo (4 o 5 cuerdas).
   * @param {number} [fretStart=0] Traste inicial.
   * @param {number} [fretEnd=12] Traste final.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {Array<{ stringIndex: number, stringNumber: number, fret: number, midi: number, noteName: string, fnLabel: string, isRoot: boolean, isGuide: boolean }>} Puntos del diapasón.
   */
  getBassFretboardMap(chordSymbol, tuning = Tuning.defaultForInstrument('bass'), fretStart = 0, fretEnd = 12, notation = 'americano') {
    const chord = Chord.parse(chordSymbol);
    const pcs = new Set(chord.getPitchClasses());
    const useFlats = prefersFlats(chord.root) || chordSymbol.includes('b');
    const points = [];

    for (let s = 0; s < tuning.stringCount; s++) {
      for (let fret = fretStart; fret <= fretEnd; fret++) {
        const midi = tuning.getMidiAt(s, fret);
        if (midi === null) continue;
        const pc = mod12(midi);
        if (!pcs.has(pc)) continue;
        const fnLabel = chord.getFunctionLabelForMidi(midi);
        const amName = pcToNoteName(pc, useFlats);
        points.push({
          stringIndex: s,
          stringNumber: tuning.getTraditionalStringNumber(s),
          fret,
          midi,
          noteName: formatChordSymbol(amName, notation),
          fnLabel,
          isRoot: pc === chord.rootPc,
          isGuide: ['3', 'b3', '7', 'b7', 'bb7'].includes(fnLabel)
        });
      }
    }
    return points;
  }

  /**
   * Determina qué clases de altura son imprescindibles para preservar el carácter del acorde.
   * @param {Chord} chord Instancia de Chord.
   * @returns {number[]} Clases de altura obligatorias.
   */
  _getEssentialPitchClasses(chord) {
    const pcs = chord.quality.intervals.map((iv) => mod12(chord.rootPc + iv));
    if (pcs.length <= 3) return pcs;
    // En acordes de 4+ notas prioriza raíz, 3ª y 7ª (la 5ª justa puede omitirse en shell voicings)
    const essential = [pcs[0], pcs[1]];
    if (chord.quality.intervals.includes(6) || chord.quality.intervals.includes(8)) {
      essential.push(pcs[2]); // 5ª alterada (b5 o #5) sí es esencial
    }
    if (pcs[3] !== undefined) essential.push(pcs[3]);
    return [...new Set(essential)];
  }

  /**
   * Asigna dedos de mano izquierda (1-4) y detecta si se requiere una cejilla (máximo 1).
   * @param {Array<number|null>} frets Arreglo de trastes por cuerda.
   * @returns {{ fingers: Array<number|null>, barres: Array<object>, fingerCount: number }|null} Digitación válida o null si es impracticable.
   */
  _assignErgonomicFingers(frets) {
    const frettedEntries = [];
    frets.forEach((f, idx) => {
      if (f !== null && f > 0) frettedEntries.push({ stringIndex: idx, fret: f });
    });

    if (frettedEntries.length === 0) {
      return { fingers: frets.map((f) => (f === null ? null : 0)), barres: [], fingerCount: 0 };
    }

    const minFret = Math.min(...frettedEntries.map((e) => e.fret));
    const atMinFret = frettedEntries.filter((e) => e.fret === minFret);
    const barres = [];
    const fingers = frets.map((f) => (f === null ? null : f === 0 ? 0 : null));

    let nextFinger = 1;
    // Si hay >=2 notas en el traste mínimo y >=4 notas pisadas en total, usa cejilla con dedo 1
    if (atMinFret.length >= 2 && frettedEntries.length >= 4) {
      const fromS = Math.min(...atMinFret.map((e) => e.stringIndex));
      const toS = Math.max(...atMinFret.map((e) => e.stringIndex));
      // No puede haber una cuerda al aire debajo de la cejilla
      let blockedByOpen = false;
      for (let s = fromS; s <= toS; s++) {
        if (frets[s] === 0) blockedByOpen = true;
      }
      if (!blockedByOpen) {
        barres.push({ fret: minFret, fromString: fromS, toString: toS, finger: 1 });
        for (const e of atMinFret) fingers[e.stringIndex] = 1;
        nextFinger = 2;
      }
    }

    const remaining = frettedEntries
      .filter((e) => fingers[e.stringIndex] === null)
      .sort((a, b) => a.fret - b.fret || a.stringIndex - b.stringIndex);

    if (remaining.length > 5 - nextFinger) {
      return null; // Requiere más de 4 dedos disponibles
    }

    for (const entry of remaining) {
      fingers[entry.stringIndex] = nextFinger;
      nextFinger += 1;
    }

    return { fingers, barres, fingerCount: nextFinger - 1 };
  }

  /**
   * Puntúa la comodidad ergonómica de una digitación (menor puntaje = más cómoda).
   * @param {Array<number|null>} frets Trastes.
   * @param {{ barres: Array<object>, fingerCount: number }} fingering Digitación asignada.
   * @param {number} inversion Grado de inversión.
   * @returns {number} Puntaje de comodidad.
   */
  _scoreComfort(frets, fingering, inversion) {
    const fretted = frets.filter((f) => f !== null && f > 0);
    const span = fretted.length > 1 ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const avgFret = fretted.length > 0 ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
    const openCount = frets.filter((f) => f === 0).length;
    return (
      span * 3.0 +
      fingering.fingerCount * 1.4 +
      fingering.barres.length * 1.8 +
      avgFret * 0.45 -
      openCount * 1.1 +
      inversion * 0.6
    );
  }

  /**
   * Calcula la distancia total de conducción de voces entre dos conjuntos de alturas MIDI.
   * @param {number[]} fromMidis Notas MIDI del acorde anterior.
   * @param {number[]} toMidis Notas MIDI del acorde siguiente.
   * @returns {number} Costo de movimiento (menor = más suave).
   */
  _voiceLeadingDistance(fromMidis, toMidis) {
    if (fromMidis.length === 0 || toMidis.length === 0) return 24;
    const links = this._computeVoiceConnections(fromMidis, toMidis);
    const moveSum = links.reduce((sum, l) => sum + Math.abs(l.semitones), 0);
    const avgFrom = fromMidis.reduce((a, b) => a + b, 0) / fromMidis.length;
    const avgTo = toMidis.reduce((a, b) => a + b, 0) / toMidis.length;
    return moveSum / Math.max(1, links.length) + Math.abs(avgTo - avgFrom) * 0.5;
  }

  /**
   * Empareja las voces de dos acordes consecutivos identificando notas comunes y movimientos conjuntos.
   * @param {number[]} fromMidis Notas MIDI del primer acorde.
   * @param {number[]} toMidis Notas MIDI del segundo acorde.
   * @returns {Array<{ fromMidi: number, toMidi: number, semitones: number, type: 'comun'|'grado'|'salto' }>} Enlaces de voz.
   */
  _computeVoiceConnections(fromMidis, toMidis) {
    const src = [...fromMidis].sort((a, b) => a - b);
    const dst = [...toMidis].sort((a, b) => a - b);
    const count = Math.min(src.length, dst.length);
    const links = [];

    for (let i = 0; i < count; i++) {
      const a = src[Math.floor((i * src.length) / count)];
      const b = dst[Math.floor((i * dst.length) / count)];
      const diff = b - a;
      const absDiff = Math.abs(diff);
      links.push({
        fromMidi: a,
        toMidi: b,
        semitones: diff,
        type: absDiff === 0 ? 'comun' : absDiff <= 2 ? 'grado' : 'salto'
      });
    }
    return links;
  }

  /**
   * Producto cartesiano acotado de opciones por cuerda para evitar explosión combinatoria.
   * @param {number[][]} arrays Arreglo de opciones por cuerda.
   * @param {number} maxItems Límite de combinaciones.
   * @returns {number[][]} Combinaciones generadas.
   */
  _cartesianProduct(arrays, maxItems) {
    let acc = [[]];
    for (const group of arrays) {
      const next = [];
      for (const prefix of acc) {
        for (const item of group) {
          next.push([...prefix, item]);
          if (next.length >= maxItems) break;
        }
        if (next.length >= maxItems) break;
      }
      acc = next;
    }
    return acc;
  }
}
