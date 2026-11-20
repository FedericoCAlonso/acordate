import { formatChordSymbol } from '../core/i18n.js';
import { mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';

/**
 * Servicio de dominio puro para:
 * 1) Generar digitaciones (voicings) ejecutables para guitarra y bajo (respetando Low Interval Limit).
 * 2) Calcular conducción de voces óptima entre acordes consecutivos (con opción de zona del mango y estilo).
 * 3) Generar mapas de notas del acorde sobre el diapasón del bajo (R, 3, 5, 7).
 */
export class VoicingGenerator {
  /**
   * Calcula digitaciones posibles para un acorde sobre un juego de cuerdas dado,
   * respetando extensión máxima de 4 trastes, a lo sumo una cejilla, Low Interval Limit en bajo
   * y ordenadas por comodidad ergonómica.
   * @param {string} chordSymbol Acorde americano (ej. "Dm7", "C/E", "G7").
   * @param {object} [options={}] Opciones de generación.
   * @param {Tuning} [options.tuning] Afinación destino (por defecto guitarra estándar).
   * @param {number[]} [options.stringSet] Índices de cuerdas 0-based grave->aguda (ej. [2,3,4] = cuerdas 4-3-2).
   * @param {number} [options.maxSpan=4] Extensión máxima entre traste mínimo y máximo pisado.
   * @param {number} [options.minFret=0] Traste mínimo a explorar.
   * @param {number} [options.maxFret] Traste más agudo a explorar (12 en guitarra, 17 en bajo).
   * @param {boolean} [options.allowSkippedStrings] Permite cuerdas silenciadas en medio (true por defecto en bajo).
   * @param {boolean} [options.allowRootless=false] Permite díadas sin fundamental (ej. notas guía 3–7 en bajo).
   * @param {number} [options.limit=12] Máximo de sugerencias a retornar.
   * @returns {Voicing[]} Lista de voicings marcados como suggested: true ordenados por comodidad.
   */
  generate(chordSymbol, options = {}) {
    const chord = Chord.parse(chordSymbol);
    const tuning = options.tuning instanceof Tuning ? options.tuning : Tuning.defaultForInstrument(options.instrument || 'guitar');
    const isBass = tuning.instrument === 'bass';
    const maxSpan = Math.max(2, Math.min(5, Number(options.maxSpan) || 4));
    const minFret = Math.max(0, Number(options.minFret) || 0);
    const maxFret = Math.max(4, Math.min(19, Number(options.maxFret) || (isBass ? 17 : 12)));
    const allowSkipped = options.allowSkippedStrings !== undefined ? Boolean(options.allowSkippedStrings) : isBass;
    const allowRootless = Boolean(options.allowRootless);
    const limit = Math.max(1, Math.min(28, Number(options.limit) || 12));

    // Juego de cuerdas por defecto: 4 cuerdas medias en guitarra o las 3 agudas (A-D-G) en bajo
    const bassPad = isBass ? Math.max(0, tuning.stringCount - 4) : 0;
    const defaultSet = tuning.stringCount >= 6
      ? [1, 2, 3, 4]
      : [bassPad + 1, bassPad + 2, bassPad + 3].filter((idx) => idx < tuning.stringCount);

    const stringSet = Array.isArray(options.stringSet) && options.stringSet.length >= 2
      ? [...options.stringSet].filter((s) => s >= 0 && s < tuning.stringCount).sort((a, b) => a - b)
      : defaultSet;

    if (stringSet.length < 2) return [];

    if (!allowSkipped) {
      for (let i = 1; i < stringSet.length; i++) {
        if (stringSet[i] - stringSet[i - 1] > 1) {
          throw new Error('El juego de cuerdas tiene saltos intermedios; activá allowSkippedStrings si los deseás.');
        }
      }
    }

    const chordPcs = new Set(chord.getPitchClasses());
    if (chord.bassPc !== null) chordPcs.add(chord.bassPc);
    const requiredPcs = this._getEssentialPitchClasses(chord, stringSet.length, allowRootless);

    const candidates = [];
    const seen = new Set();

    // Recorre ventanas deslizantes de trastes de ancho maxSpan
    for (let windowStart = minFret; windowStart <= maxFret - maxSpan + 1; windowStart++) {
      const windowEnd = windowStart + maxSpan - 1;
      const perStringOptions = stringSet.map((sIdx) => {
        const opts = [];
        const openMidi = tuning.strings[sIdx];
        // Opción cuerda al aire si pertenece al acorde y el rango incluye primera posición
        if (minFret === 0 && windowStart <= 1 && chordPcs.has(mod12(openMidi))) {
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

      const combos = this._cartesianProduct(perStringOptions, 180);
      for (const combo of combos) {
        const fretted = combo.filter((f) => f > 0);
        if (fretted.length > 0) {
          const span = Math.max(...fretted) - Math.min(...fretted);
          if (span > maxSpan - 1) continue;
        }

        const midis = combo.map((f, i) => tuning.getMidiAt(stringSet[i], f));

        // En bajo, evita intervalos cerrados fangosos en el registro grave (Low Interval Limit)
        if (isBass && !this._respectsLowIntervalLimit(midis)) continue;

        // Verifica cobertura de notas esenciales y bajo slash si existe
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

        // Verifica que no necesite más de 4 dedos (considerando hasta 1 cejilla o media cejilla con dedo 1)
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
        const styleTag = isBass
          ? (stringSet.length === 2 ? 'diada' : stringSet.length === 3 ? 'shell' : 'voicing')
          : (stringSet.length === 3 ? 'triada' : 'voicing');

        const v = new Voicing({
          id: `sug-${chord.americanSymbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${sig}`,
          chord: chord.americanSymbol,
          instrument: tuning.instrument,
          frets: fullFrets,
          fingers: fingeringResult.fingers,
          baseFret,
          barres: fingeringResult.barres,
          tags: ['sugerido', styleTag],
          movable: !fullFrets.includes(0),
          suggested: true
        });
        v.inversion = v.computeInversion(tuning);
        v.bassNote = v.computeBassNote(tuning, 'americano');

        const comfortScore = this._scoreComfort(fullFrets, fingeringResult, v.inversion, midis, chord, isBass);
        candidates.push({ voicing: v, score: comfortScore });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates.slice(0, limit).map((c) => c.voicing);
  }

  /**
   * Genera una progresión con conducción de voces óptima eligiendo inversiones/voicings que
   * minimicen el desplazamiento total de semitonos entre acordes consecutivos.
   * Soporta guitarra, guitarra clásica y bajo (4 o 5 cuerdas), con filtro opcional de zona del mango y estilo.
   * @param {string[]} chordSymbols Lista de acordes de la progresión.
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'guitar'|'bass'} [instrument='guitar'] Instrumento.
   * @param {object} [options={}] Opciones de zona y estilo.
   * @param {'libre'|'abierto'|'medio'|'agudo'} [options.fretZone='libre'] Zona preferida del diapasón.
   * @param {string} [options.style='auto'] Estilo/juego de cuerdas ('auto', '321', '432', '5432', 'shell', 'decima', 'triadas-agudas', 'guias').
   * @returns {Array<{ chord: string, voicing: Voicing, connectionsToNext: Array<{ fromMidi: number, toMidi: number, semitones: number, type: 'comun'|'grado'|'salto' }> }>} Progresión conducida.
   */
  findVoiceLedProgression(
    chordSymbols,
    tuning = Tuning.defaultForInstrument('guitar'),
    instrument = 'guitar',
    options = {}
  ) {
    if (!Array.isArray(chordSymbols) || chordSymbols.length === 0) return [];

    const isBass = instrument === 'bass' || tuning.instrument === 'bass';
    const fretZone = options.fretZone || 'libre';
    const style = options.style || 'auto';
    const bassPad = isBass ? Math.max(0, tuning.stringCount - 4) : 0;

    // Rango de trastes según zona solicitada
    const zoneBounds = {
      libre: { min: 0, max: isBass ? 17 : 12 },
      abierto: { min: 0, max: isBass ? 8 : 5 },
      medio: { min: 3, max: isBass ? 12 : 9 },
      agudo: { min: 7, max: isBass ? 17 : 14 }
    }[fretZone] || { min: 0, max: isBass ? 17 : 12 };

    // Construye catálogo de candidatos por acorde según instrumento, estilo y zona
    const pools = chordSymbols.map((sym) => {
      const curated = getCuratedVoicingsForChord(sym, isBass ? 'bass' : 'guitar', tuning);
      let pool = [];

      if (isBass) {
        if (style === 'decima') {
          pool = [
            ...curated.filter((v) => v.tags.includes('decima') || v.tags.includes('diada')),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 0, bassPad + 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 6 }),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 0, bassPad + 1, bassPad + 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 6 })
          ];
        } else if (style === 'shell') {
          pool = [
            ...curated.filter((v) => v.tags.includes('shell')),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 0, bassPad + 2, bassPad + 3], minFret: Math.max(3, zoneBounds.min), maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 6 }),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 1, bassPad + 2, bassPad + 3], minFret: Math.max(5, zoneBounds.min), maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 6 })
          ];
        } else if (style === 'guias') {
          pool = [
            ...curated.filter((v) => v.tags.includes('guias') || v.tags.includes('diada')),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 2, bassPad + 3], minFret: Math.max(3, zoneBounds.min), maxFret: zoneBounds.max, allowRootless: true, limit: 8 })
          ];
        } else if (style === 'triadas-agudas') {
          pool = [
            ...curated.filter((v) => v.tags.includes('triada')),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 1, bassPad + 2, bassPad + 3], minFret: Math.max(5, zoneBounds.min), maxFret: zoneBounds.max, limit: 8 })
          ];
        } else {
          pool = [
            ...curated,
            ...this.generate(sym, { tuning, stringSet: [bassPad + 0, bassPad + 2, bassPad + 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 5 }),
            ...this.generate(sym, { tuning, stringSet: [bassPad + 1, bassPad + 2, bassPad + 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 5 })
          ];
        }
      } else {
        if (style === '321') {
          pool = [
            ...curated.filter((v) => v.frets[0] === null && v.frets[1] === null && v.frets[2] === null),
            ...this.generate(sym, { tuning, stringSet: [3, 4, 5], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 8 })
          ];
        } else if (style === '432') {
          pool = [
            ...curated.filter((v) => v.frets[0] === null && v.frets[1] === null && v.frets[5] === null),
            ...this.generate(sym, { tuning, stringSet: [2, 3, 4], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 8 })
          ];
        } else if (style === '5432') {
          pool = [
            ...curated.filter((v) => v.tags.includes('drop2')),
            ...this.generate(sym, { tuning, stringSet: [1, 2, 3, 4], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 8 })
          ];
        } else if (style === 'shell') {
          pool = [
            ...curated.filter((v) => v.tags.includes('shell')),
            ...this.generate(sym, { tuning, stringSet: [0, 2, 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, allowSkippedStrings: true, limit: 6 }),
            ...this.generate(sym, { tuning, stringSet: [1, 2, 3], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 6 })
          ];
        } else {
          const gen432 = tuning.stringCount >= 6
            ? this.generate(sym, { tuning, stringSet: [2, 3, 4], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 5 })
            : [];
          const gen321 = tuning.stringCount >= 6
            ? this.generate(sym, { tuning, stringSet: [3, 4, 5], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 5 })
            : [];
          const gen5432 = tuning.stringCount >= 6
            ? this.generate(sym, { tuning, stringSet: [1, 2, 3, 4], minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 5 })
            : this.generate(sym, { tuning, minFret: zoneBounds.min, maxFret: zoneBounds.max, limit: 5 });
          pool = [...curated, ...gen5432, ...gen432, ...gen321];
        }
      }

      // Deduplica por trastes y aplica preferencia de zona sin vaciar el pool
      const unique = [];
      const seen = new Set();
      for (const v of pool) {
        if (!v) continue;
        const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
        if (seen.has(sig)) continue;
        seen.add(sig);
        unique.push(v);
      }

      const inZone = unique.filter((v) => v.baseFret >= zoneBounds.min && v.baseFret <= zoneBounds.max);
      if (inZone.length > 0) return inZone;
      if (unique.length > 0) return unique;
      return curated.length > 0 ? curated : [new Voicing({ chord: sym, instrument: isBass ? 'bass' : 'guitar' })];
    });

    // Programación dinámica para minimizar movimiento de voces superiores y saltos de posición
    const dpCost = pools.map((pool) => Array(pool.length).fill(Infinity));
    const dpPrev = pools.map((pool) => Array(pool.length).fill(-1));

    const targetFretCenter = fretZone === 'abierto' ? 2 : fretZone === 'medio' ? 6 : fretZone === 'agudo' ? 10 : isBass ? 7 : 4;
    for (let j = 0; j < pools[0].length; j++) {
      dpCost[0][j] = Math.abs(pools[0][j].baseFret - targetFretCenter) * 0.45;
    }

    for (let i = 1; i < pools.length; i++) {
      for (let j = 0; j < pools[i].length; j++) {
        const curV = pools[i][j];
        const curMidis = curV.getMidiNotes(tuning);
        for (let k = 0; k < pools[i - 1].length; k++) {
          const prevV = pools[i - 1][k];
          const prevMidis = prevV.getMidiNotes(tuning);
          const dist = this._voiceLeadingDistance(prevMidis, curMidis, prevV, curV);
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
   * Verifica el Low Interval Limit (LIL) para acordes en bajo eléctrico, rechazando
   * intervalos cerrados fangosos en el registro grave.
   * @param {number[]} midis Alturas MIDI del voicing candidato.
   * @returns {boolean} True si suena claro en registro de bajo.
   */
  _respectsLowIntervalLimit(midis) {
    const sorted = [...midis].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const low = sorted[i];
      const diff = sorted[i + 1] - low;
      if (diff === 0) return false;
      if (diff <= 2 && low < 50) return false;
      if (diff === 3 && low < 41) return false;
      if (diff === 4 && low < 39) return false;
      if ((diff === 5 || diff === 6) && low < 36) return false;
      if (diff === 7 && low < 31) return false;
    }
    return true;
  }

  /**
   * Determina qué clases de altura son imprescindibles según el valor real de los intervalos
   * (raíz, 3ª/sus, 5ª alterada, 7ª/6ª y extensión característica), adaptándose a la cantidad de cuerdas.
   * @param {Chord} chord Instancia de Chord.
   * @param {number} [voiceBudget=4] Cantidad de cuerdas disponibles.
   * @param {boolean} [allowRootless=false] Permite omitir raíz (ej. díadas de notas guía 3-7).
   * @returns {number[]} Clases de altura obligatorias.
   */
  _getEssentialPitchClasses(chord, voiceBudget = 4, allowRootless = false) {
    const intervals = chord.quality.intervals;
    const pcOf = (iv) => mod12(chord.rootPc + iv);

    // En díadas (2 cuerdas) prioriza notas guía (3 + 7) si es rootless o raíz + carácter (3ª / 5ª)
    if (voiceBudget <= 2) {
      const thirdOrSus = intervals.find((iv) => [2, 3, 4, 5].includes(iv));
      const seventh = intervals.find((iv) => [9, 10, 11].includes(iv));
      if (allowRootless && thirdOrSus !== undefined && seventh !== undefined) {
        return [pcOf(thirdOrSus), pcOf(seventh)];
      }
      if (thirdOrSus !== undefined) return [pcOf(0), pcOf(thirdOrSus)];
      return intervals.slice(0, 2).map(pcOf);
    }

    if (intervals.length <= 3) {
      return intervals.map(pcOf);
    }

    const essential = [];
    if (!allowRootless) essential.push(pcOf(0));

    // 3ª o suspensión característica
    const thirdOrSus = intervals.find((iv) => [2, 3, 4, 5].includes(iv));
    if (thirdOrSus !== undefined) essential.push(pcOf(thirdOrSus));

    // 5ª alterada (b5 o #5) es esencial
    const altFifth = intervals.find((iv) => iv === 6 || iv === 8);
    if (altFifth !== undefined) essential.push(pcOf(altFifth));

    // 7ª o 6ª característica
    const seventhOrSixth = intervals.find((iv) => [9, 10, 11].includes(iv));
    if (seventhOrSixth !== undefined) essential.push(pcOf(seventhOrSixth));

    // Extensión más alta (9, b9, #9, 11, #11, 13) si entra en el presupuesto de voces
    const extensions = intervals.filter((iv) => iv > 12);
    if (extensions.length > 0 && essential.length < voiceBudget) {
      essential.push(pcOf(extensions[extensions.length - 1]));
    }

    return [...new Set(essential)].slice(0, voiceBudget);
  }

  /**
   * Asigna dedos de mano izquierda (1-4) y detecta si se requiere una cejilla o media cejilla (máximo 1).
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
    // Permite cejilla completa o media cejilla (2+ notas contiguas en el traste mínimo)
    const shouldBarre =
      (atMinFret.length >= 2 && frettedEntries.length >= 4) ||
      (atMinFret.length >= 2 && atMinFret.length === frettedEntries.length && atMinFret.every((e, i, arr) => i === 0 || e.stringIndex - arr[i - 1].stringIndex === 1));

    if (shouldBarre) {
      const fromS = Math.min(...atMinFret.map((e) => e.stringIndex));
      const toS = Math.max(...atMinFret.map((e) => e.stringIndex));
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
   * Puntúa la comodidad ergonómica y claridad armónica de una digitación (menor puntaje = mejor).
   * @param {Array<number|null>} frets Trastes.
   * @param {{ barres: Array<object>, fingerCount: number }} fingering Digitación asignada.
   * @param {number} inversion Grado de inversión.
   * @param {number[]} midis Alturas MIDI resultantes.
   * @param {Chord} chord Acorde destino.
   * @param {boolean} isBass Si es bajo eléctrico.
   * @returns {number} Puntaje de comodidad.
   */
  _scoreComfort(frets, fingering, inversion, midis, chord, isBass) {
    const fretted = frets.filter((f) => f !== null && f > 0);
    const span = fretted.length > 1 ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const avgFret = fretted.length > 0 ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
    const openCount = frets.filter((f) => f === 0).length;

    // Penaliza duplicación innecesaria de 3ª mayor o 7ª (menos limpio armónicamente)
    const thirdPc = mod12(chord.rootPc + 4);
    const sevPc = mod12(chord.rootPc + 11);
    const thirdCount = midis.filter((m) => mod12(m) === thirdPc).length;
    const sevCount = midis.filter((m) => mod12(m) === sevPc).length;
    const dupPenalty = Math.max(0, thirdCount - 1) * 2.0 + Math.max(0, sevCount - 1) * 2.2;

    // En bajo, el registro ideal para acordes es medio-agudo (trastes 5–12)
    const fretPenalty = isBass ? Math.abs(avgFret - 8.5) * 0.35 : avgFret * 0.4;

    return (
      span * 2.8 +
      fingering.fingerCount * 1.3 +
      fingering.barres.length * 1.6 +
      fretPenalty -
      openCount * (isBass ? 0.2 : 1.0) +
      inversion * 0.5 +
      dupPenalty
    );
  }

  /**
   * Calcula la distancia musical de conducción de voces entre dos voicings consecutivos,
   * ponderando más la suavidad de las voces superiores y consistencia de posición/textura.
   * @param {number[]} fromMidis Notas MIDI del acorde anterior.
   * @param {number[]} toMidis Notas MIDI del acorde siguiente.
   * @param {Voicing} [prevV] Voicing anterior.
   * @param {Voicing} [curV] Voicing actual.
   * @returns {number} Costo de movimiento (menor = más suave).
   */
  _voiceLeadingDistance(fromMidis, toMidis, prevV = null, curV = null) {
    if (fromMidis.length === 0 || toMidis.length === 0) return 24;
    const links = this._computeVoiceConnections(fromMidis, toMidis);
    const lowestFrom = Math.min(...fromMidis);

    let weightedMove = 0;
    for (const l of links) {
      // El bajo puede saltar por 4ª/5ª naturalmente; las voces superiores y guía pesan más
      const weight = l.fromMidi === lowestFrom && links.length >= 3 ? 0.55 : 1.15;
      weightedMove += Math.abs(l.semitones) * weight;
    }

    const avgFrom = fromMidis.reduce((a, b) => a + b, 0) / fromMidis.length;
    const avgTo = toMidis.reduce((a, b) => a + b, 0) / toMidis.length;
    const textureDiff = Math.abs(fromMidis.length - toMidis.length) * 1.1;
    const posJump = prevV && curV ? Math.max(0, Math.abs(curV.baseFret - prevV.baseFret) - 3) * 0.7 : 0;

    return weightedMove / Math.max(1, links.length) + Math.abs(avgTo - avgFrom) * 0.4 + textureDiff + posJump;
  }

  /**
   * Empareja las voces de dos acordes consecutivos priorizando primero notas comunes exactas
   * y luego el desplazamiento mínimo por semitonos para las voces restantes.
   * @param {number[]} fromMidis Notas MIDI del primer acorde.
   * @param {number[]} toMidis Notas MIDI del segundo acorde.
   * @returns {Array<{ fromMidi: number, toMidi: number, semitones: number, type: 'comun'|'grado'|'salto' }>} Enlaces de voz.
   */
  _computeVoiceConnections(fromMidis, toMidis) {
    const src = [...fromMidis].sort((a, b) => a - b);
    const dst = [...toMidis].sort((a, b) => a - b);
    const usedSrc = new Set();
    const usedDst = new Set();
    const links = [];

    // 1) Detecta primero todas las notas comunes exactas (0 semitonos)
    for (let i = 0; i < src.length; i++) {
      for (let j = 0; j < dst.length; j++) {
        if (!usedDst.has(j) && src[i] === dst[j]) {
          usedSrc.add(i);
          usedDst.add(j);
          links.push({ fromMidi: src[i], toMidi: dst[j], semitones: 0, type: 'comun' });
          break;
        }
      }
    }

    // 2) Empareja voces restantes manteniendo orden grave->aguda por distancia mínima
    const remSrc = src.filter((_, i) => !usedSrc.has(i));
    const remDst = dst.filter((_, j) => !usedDst.has(j));
    const pairs = [];
    for (let i = 0; i < remSrc.length; i++) {
      for (let j = 0; j < remDst.length; j++) {
        pairs.push({ i, j, dist: Math.abs(remDst[j] - remSrc[i]) });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);

    const pairedI = new Set();
    const pairedJ = new Set();
    for (const p of pairs) {
      if (pairedI.has(p.i) || pairedJ.has(p.j)) continue;
      pairedI.add(p.i);
      pairedJ.add(p.j);
      const diff = remDst[p.j] - remSrc[p.i];
      const absDiff = Math.abs(diff);
      links.push({
        fromMidi: remSrc[p.i],
        toMidi: remDst[p.j],
        semitones: diff,
        type: absDiff === 0 ? 'comun' : absDiff <= 2 ? 'grado' : 'salto'
      });
    }

    links.sort((a, b) => a.fromMidi - b.fromMidi);
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
