import { formatAbcChordsForDisplay } from '../core/i18n.js';
import {
  abcPitchToMidi,
  analyzeBassFunction,
  extractTimeSignatureFromAbc,
  getKeySignatureMap,
  parseTimeSignature
} from '../core/MusicTheory.js';

/**
 * Servicio encapsulador sobre abcjs (versión fija 6.4.4) responsable de:
 * - Renderizar el pentagrama adaptable con reflujo de compases según ancho disponible.
 * - Anotar digitaciones y funciones armónicas de bajo sin usar tablatura en ningún caso.
 * - Detectar advertencias de sintaxis ABC para el editor en vivo.
 * - Extraer la línea de tiempo reproducible vinculada a los elementos SVG para el resaltado.
 */
export class AbcService {
  /**
   * Obtiene la referencia global a la librería vendored abcjs.
   * @returns {object|null} Objeto ABCJS o null en entornos sin navegador (tests unitarios).
   */
  _getAbcjs() {
    if (typeof window !== 'undefined' && window.ABCJS) {
      return window.ABCJS;
    }
    return null;
  }

  /**
   * Prepara el texto ABC final para visualización aplicando modo de vista, cifrado latino/americano,
   * digitaciones y etiquetas de función armónica en bajo (nunca tablatura).
   * @param {string} abcText ABC original (ya transpuesto si corresponde).
   * @param {object} options Opciones de visualización.
   * @param {'pentagrama'|'mixto'|'cifrado'} [options.viewMode='mixto'] Modo de notación.
   * @param {'americano'|'latino'} [options.chordNotation='americano'] Sistema de cifrado.
   * @param {boolean} [options.showFingerings=true] Mostrar digitaciones anotadas.
   * @param {Record<string, string>} [options.fingerings={}] Mapa nota/compás -> digitación.
   * @param {boolean} [options.showBassFunctions=false] Mostrar función armónica (R, 3, 5, 7, Crom) sobre bajo.
   * @param {boolean} [options.isBass=false] Indica si la práctica corresponde a bajo.
   * @returns {string} Cadena ABC preparada para renderAbc.
   */
  prepareAbcForRender(abcText, options = {}) {
    let result = String(abcText || '').trim();
    if (!result) return '';

    const {
      viewMode = 'mixto',
      chordNotation = 'americano',
      showFingerings = true,
      fingerings = {},
      showBassFunctions = false,
      isBass = false
    } = options;

    // 1) En bajo con funciones armónicas activas, anota R, 3, 5, 7, Crom debajo de cada nota
    if (isBass && showBassFunctions && viewMode !== 'pentagrama') {
      result = this._injectBassFunctionAnnotations(result);
    }

    // 2) Inyecta digitaciones del campo practice.fingerings si están habilitadas
    if (showFingerings && fingerings && Object.keys(fingerings).length > 0) {
      result = this._injectFingeringAnnotations(result, fingerings);
    } else if (!showFingerings) {
      // Quita anotaciones explícitas de digitación (^1, ^①, etc.) si el usuario las ocultó
      result = result.replace(/"\^[^"]+"/g, '');
    }

    // 3) En modo Pentagrama puro, oculta los símbolos de acorde para lectura pura
    if (viewMode === 'pentagrama') {
      result = result.replace(/"([^"]+)"/g, (full, inner) => {
        if (/^[\^_<>@]/.test(inner)) return full;
        return '';
      });
    } else if (chordNotation === 'latino') {
      result = formatAbcChordsForDisplay(result, 'latino');
    }

    return result;
  }

  /**
   * Renderiza la partitura ABC en el elemento contenedor con reflujo de compases adaptable al ancho.
   * Nunca pasa opciones de tablatura a abcjs.
   * @param {HTMLElement} container Contenedor DOM destino.
   * @param {string} abcText Texto ABC preparado para mostrar.
   * @param {object} [options={}] Opciones de ancho, zoom y clickListener.
   * @returns {{ visualObj: object|null, warnings: string[] }} Objeto visual de abcjs y advertencias.
   */
  renderScore(container, abcText, options = {}) {
    const ABCJS = this._getAbcjs();
    if (!ABCJS || !container) {
      return { visualObj: null, warnings: [] };
    }

    const containerWidth = Math.max(280, options.width || container.clientWidth || 680);
    const zoom = Math.max(0.7, Math.min(1.8, Number(options.zoom) || 1));

    // Reflujo inteligente: ajusta la cantidad de compases preferidos por línea según ancho y zoom
    const effectiveWidth = containerWidth / zoom;
    let preferredMeasuresPerLine = 4;
    if (effectiveWidth < 420) preferredMeasuresPerLine = 2;
    else if (effectiveWidth < 680) preferredMeasuresPerLine = 3;
    else if (effectiveWidth > 1050) preferredMeasuresPerLine = 4;

    const visualParams = {
      add_classes: true,
      staffwidth: Math.max(260, Math.floor(containerWidth / zoom) - 24),
      scale: zoom,
      jazzchords: true,
      paddingtop: 12,
      paddingbottom: 16,
      paddingleft: 10,
      paddingright: 10,
      wrap: {
        preferredMeasuresPerLine,
        minSpacing: 1.4,
        maxSpacing: 2.8
      }
    };

    if (typeof options.clickListener === 'function') {
      visualParams.clickListener = options.clickListener;
    }

    container.innerHTML = '';
    const tunes = ABCJS.renderAbc(container, abcText, visualParams);
    const visualObj = tunes && tunes[0] ? tunes[0] : null;
    const warnings = Array.isArray(visualObj?.warnings)
      ? visualObj.warnings.map((w) => String(w).replace(/<[^>]+>/g, '').trim()).filter(Boolean)
      : [];

    return { visualObj, warnings };
  }

  /**
   * Valida la sintaxis de un texto ABC sin necesidad de renderizarlo visiblemente.
   * @param {string} abcText Texto ABC a comprobar.
   * @returns {{ valid: boolean, warnings: string[] }} Resultado de validación sintáctica.
   */
  validateAbcSyntax(abcText) {
    const warnings = [];
    const text = String(abcText || '').trim();
    if (!text) {
      return { valid: false, warnings: ['El contenido ABC está vacío.'] };
    }
    if (!/^K:/m.test(text)) {
      warnings.push('Falta la cabecera de tonalidad (por ejemplo K:C o K:F clef=bass).');
    }
    if (!/^M:/m.test(text)) {
      warnings.push('Recomendación: incluí la cabecera de compás (por ejemplo M:4/4).');
    }

    const ABCJS = this._getAbcjs();
    if (ABCJS && typeof document !== 'undefined') {
      const ghost = document.createElement('div');
      const tunes = ABCJS.renderAbc(ghost, text, { staffwidth: 500 });
      const vo = tunes?.[0];
      if (vo?.warnings?.length) {
        for (const w of vo.warnings) {
          warnings.push(String(w).replace(/<[^>]+>/g, '').trim());
        }
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Extrae una línea de tiempo reproducible completa (notas, acordes, compases y elementos SVG)
   * a partir del visualObj de abcjs (o mediante parser puro si no hay navegador).
   * @param {object|null} visualObj Objeto retornado por ABCJS.renderAbc.
   * @param {string} rawAbc Texto ABC fuente (en cifrado americano para generar voicings).
   * @param {object} [meta={}] Metadatos de respaldo (isBass, timeSignature).
   * @returns {object} Línea de tiempo lista para AudioSynthService.
   */
  extractTimeline(visualObj, rawAbc, meta = {}) {
    const timeSig = extractTimeSignatureFromAbc(rawAbc, meta.timeSignature || '4/4');
    const { beats, beatUnit } = parseTimeSignature(timeSig);
    const beatsPerMeasure = beats * (4 / beatUnit);
    const isBassPiece = Boolean(meta.isBass || /clef\s*=\s*bass/i.test(rawAbc || ''));

    // Si disponemos del visualObj de abcjs con setUpAudio / lines, extraemos exactamente las posiciones y SVG elements
    if (visualObj && Array.isArray(visualObj.lines) && visualObj.lines.length > 0) {
      return this._extractFromVisualObj(visualObj, rawAbc, { beatsPerMeasure, beatUnit, isBassPiece });
    }

    // Fallback puro (sin navegador) para tests unitarios
    return this._extractFromRawAbc(rawAbc, { beatsPerMeasure, beatUnit, isBassPiece });
  }

  /**
   * Extrae eventos reproducibles y referencias a elementos SVG directamente desde visualObj de abcjs.
   * @param {object} visualObj Objeto renderizado por abcjs.
   * @param {string} rawAbc ABC original en cifrado americano.
   * @param {{ beatsPerMeasure: number, beatUnit: number, isBassPiece: boolean }} cfg Configuración métrica.
   * @returns {object} Timeline estructurada.
   */
  _extractFromVisualObj(visualObj, rawAbc, cfg) {
    const { beatsPerMeasure, beatUnit, isBassPiece } = cfg;
    const notes = [];
    const chords = [];
    const keyMatch = String(rawAbc || '').match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');

    // Mapa de acordes originales en americano desde el ABC crudo por índice de compás
    const rawChordQueue = [];
    const chordRegex = /"([^"]+)"/g;
    let cm;
    while ((cm = chordRegex.exec(rawAbc || '')) !== null) {
      const txt = cm[1].trim();
      if (!/^[\^_<>@]/.test(txt) && /^[A-G][#b]?/.test(txt)) {
        rawChordQueue.push(txt);
      }
    }
    let chordCursor = 0;

    // Recorre las voces acumulando tiempos exactos en negras (en abcjs duration=1 equivale a redonda = 4 negras)
    const voiceCursors = new Map();
    const voiceMeasures = new Map();
    const voiceBarAcc = new Map();

    for (const line of visualObj.lines) {
      if (!Array.isArray(line.staff)) continue;
      line.staff.forEach((staff, staffIdx) => {
        const clefType = staff.clef?.type || (isBassPiece ? 'bass' : 'treble-8');
        const isStaffBass = clefType.startsWith('bass');
        const octaveShift = isStaffBass ? -12 : clefType === 'treble-8' ? -12 : 0;

        if (!Array.isArray(staff.voices)) return;
        staff.voices.forEach((voice, voiceIdx) => {
          const vKey = `${staffIdx}-${voiceIdx}`;
          if (!voiceCursors.has(vKey)) voiceCursors.set(vKey, 0);
          if (!voiceMeasures.has(vKey)) voiceMeasures.set(vKey, 1);
          if (!voiceBarAcc.has(vKey)) voiceBarAcc.set(vKey, {});

          let currentBeat = voiceCursors.get(vKey);
          let measureIndex = voiceMeasures.get(vKey);
          let barAcc = voiceBarAcc.get(vKey);

          for (const elem of voice) {
            if (elem.el_type === 'bar') {
              barAcc = {};
              voiceBarAcc.set(vKey, barAcc);
              if (currentBeat > 0.01) {
                measureIndex += 1;
              }
              continue;
            }

            if (elem.el_type !== 'note') continue;

            const durBeats = (elem.duration || 0.25) * 4;
            const isRest = Boolean(elem.rest);

            // Detecta acordes cifrados asociados a la nota (solo en voz 0)
            if (staffIdx === 0 && voiceIdx === 0 && Array.isArray(elem.chord)) {
              for (const chObj of elem.chord) {
                if (chObj.position === 'default' && chObj.name && !/^[\^_<>@]/.test(chObj.name)) {
                  const americanSymbol = rawChordQueue[chordCursor] || chObj.name;
                  chordCursor += 1;
                  chords.push({
                    beat: currentBeat,
                    durationBeats: beatsPerMeasure,
                    symbol: americanSymbol,
                    measureIndex
                  });
                }
              }
            }

            // Calcula alturas MIDI desde elem.pitches usando keyMap y alteraciones del compás
            const midis = [];
            if (!isRest && Array.isArray(elem.pitches)) {
              for (const p of elem.pitches) {
                const midi = this._abcjsPitchToMidi(p, keyMap, barAcc) + octaveShift;
                if (Number.isFinite(midi)) {
                  midis.push(midi);
                }
              }
            }

            // Recolecta los elementos SVG renderizados para resaltado visual
            const svgElements = [];
            if (elem.abselem?.elemset) {
              for (const node of elem.abselem.elemset) {
                if (node) svgElements.push(node);
              }
            }

            notes.push({
              beat: currentBeat,
              durationBeats: durBeats,
              midis,
              isRest,
              measureIndex,
              isBassVoice: isStaffBass || voiceIdx > 0,
              svgElements
            });

            currentBeat += durBeats;
          }

          voiceCursors.set(vKey, currentBeat);
          voiceMeasures.set(vKey, measureIndex);
        });
      });
    }

    // Ajusta duración de cada acorde hasta el acorde siguiente
    chords.sort((a, b) => a.beat - b.beat);
    const totalBeats = Math.max(beatsPerMeasure, ...[...voiceCursors.values(), 0]);
    for (let i = 0; i < chords.length; i++) {
      const nextBeat = i + 1 < chords.length ? chords[i + 1].beat : totalBeats;
      chords[i].durationBeats = Math.max(0.5, nextBeat - chords[i].beat);
    }

    notes.sort((a, b) => a.beat - b.beat);
    const measureCount = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure));

    return {
      notes,
      chords,
      totalBeats,
      beatsPerMeasure,
      beatUnit,
      measureCount,
      isBassPiece
    };
  }

  /**
   * Convierte un objeto pitch interno de abcjs ({ pitch, accidental, name }) a número MIDI.
   * En abcjs, pitch=0 corresponde a C4 (MIDI 60), pitch=7 a C5 (MIDI 72).
   * @param {object} pitchObj Objeto pitch de abcjs.
   * @param {Record<string, number>} keyMap Armadura de clave activa.
   * @param {Record<string, number>} barAcc Alteraciones vigentes en el compás.
   * @returns {number} Número MIDI.
   */
  _abcjsPitchToMidi(pitchObj, keyMap, barAcc) {
    const diatonicSemitones = [0, 2, 4, 5, 7, 9, 11];
    const letterNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const p = Number(pitchObj.pitch || 0);
    const octaveOffset = Math.floor(p / 7);
    const step = ((p % 7) + 7) % 7;
    const letter = letterNames[step];
    const octave = 4 + octaveOffset;
    const pitchKey = `${letter}${octave}`;

    let acc = 0;
    if (pitchObj.accidental) {
      const map = { sharp: 1, dblsharp: 2, flat: -1, dblflat: -2, natural: 0 };
      acc = map[pitchObj.accidental] ?? 0;
      barAcc[pitchKey] = acc;
    } else if (barAcc[pitchKey] !== undefined) {
      acc = barAcc[pitchKey];
    } else {
      acc = keyMap[letter] || 0;
    }

    return 60 + octaveOffset * 12 + diatonicSemitones[step] + acc;
  }

  /**
   * Parser de respaldo para entornos sin DOM (pruebas unitarias) que extrae una línea de tiempo básica desde ABC.
   * @param {string} rawAbc Texto ABC.
   * @param {{ beatsPerMeasure: number, beatUnit: number, isBassPiece: boolean }} cfg Configuración métrica.
   * @returns {object} Timeline estructurada.
   */
  _extractFromRawAbc(rawAbc, cfg) {
    const { beatsPerMeasure, beatUnit, isBassPiece } = cfg;
    const keyMatch = String(rawAbc || '').match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');
    const unitMatch = String(rawAbc || '').match(/^L:\s*(\d+)\/(\d+)/m);
    const unitBeats = unitMatch ? (Number(unitMatch[1]) / Number(unitMatch[2])) * 4 : 0.5;

    const musicBody = String(rawAbc || '')
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('%') && !/^[A-Za-z]:/.test(t);
      })
      .join(' ');

    const notes = [];
    const chords = [];
    let currentBeat = 0;
    let measureIndex = 1;
    let barAcc = {};

    const tokenRegex = /"([^"]+)"|(\|)|(z|x)(\d*\/?\d*)|(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d*\/?\d*)/g;
    let match;
    while ((match = tokenRegex.exec(musicBody)) !== null) {
      if (match[1]) {
        const txt = match[1].trim();
        if (!/^[\^_<>@]/.test(txt) && /^[A-G][#b]?/.test(txt)) {
          chords.push({ beat: currentBeat, durationBeats: beatsPerMeasure, symbol: txt, measureIndex });
        }
      } else if (match[2]) {
        barAcc = {};
        if (currentBeat > 0) measureIndex += 1;
      } else if (match[3]) {
        const dur = unitBeats * this._parseAbcDurationFactor(match[4]);
        notes.push({ beat: currentBeat, durationBeats: dur, midis: [], isRest: true, measureIndex, svgElements: [] });
        currentBeat += dur;
      } else if (match[6]) {
        const pitchStr = `${match[5] || ''}${match[6]}${match[7] || ''}`;
        const midi = abcPitchToMidi(pitchStr, keyMap, barAcc);
        const dur = unitBeats * this._parseAbcDurationFactor(match[8]);
        notes.push({
          beat: currentBeat,
          durationBeats: dur,
          midis: midi !== null ? [midi - 12] : [],
          isRest: false,
          measureIndex,
          isBassVoice: isBassPiece,
          svgElements: []
        });
        currentBeat += dur;
      }
    }

    const totalBeats = Math.max(beatsPerMeasure, currentBeat);
    return {
      notes,
      chords,
      totalBeats,
      beatsPerMeasure,
      beatUnit,
      measureCount: Math.max(1, Math.ceil(totalBeats / beatsPerMeasure)),
      isBassPiece
    };
  }

  /**
   * Interpreta un modificador de duración ABC (ej. "2", "/2", "3/2") a factor multiplicador.
   * @param {string} durStr Cadena de duración.
   * @returns {number} Multiplicador numérico.
   */
  _parseAbcDurationFactor(durStr) {
    if (!durStr) return 1;
    if (durStr === '/') return 0.5;
    if (durStr.startsWith('/')) return 1 / (Number(durStr.slice(1)) || 2);
    if (durStr.includes('/')) {
      const [num, den] = durStr.split('/');
      return (Number(num) || 1) / (Number(den) || 2);
    }
    return Number(durStr) || 1;
  }

  /**
   * Inyecta anotaciones de función armónica ("_R", "_3", "_5", "_b7", "_Crom") debajo de las notas de bajo.
   * @param {string} abcText Texto ABC con cifrado americano.
   * @returns {string} Texto ABC anotado.
   */
  _injectBassFunctionAnnotations(abcText) {
    const keyMatch = abcText.match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');

    // Recolecta todos los acordes por compás para conocer el acorde siguiente en tiempo 4
    const measureChords = [];
    const musicLines = abcText.split('\n');
    const barChordScan = musicLines
      .filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('%') && !/^[A-Za-z]:/.test(t);
      })
      .join(' ')
      .split(/\|/);

    for (const rawBar of barChordScan) {
      const m = rawBar.match(/"([A-G][#b]?[^"]*)"/);
      if (rawBar.trim()) {
        measureChords.push(m ? m[1] : measureChords[measureChords.length - 1] || null);
      }
    }

    let currentBar = 0;
    let currentChord = measureChords[0] || null;

    return musicLines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%') || /^[A-Za-z]:/.test(trimmed)) {
          return line;
        }
        const bars = line.split('|');
        const processedBars = bars.map((barText, idx) => {
          if (!barText.trim()) return barText;
          const localChordMatch = barText.match(/"([A-G][#b]?[^"]*)"/);
          if (localChordMatch) currentChord = localChordMatch[1];
          const nextChord = measureChords[currentBar + 1] || measureChords[0] || null;
          const barAcc = {};

          // Cuenta cuántas notas tiene el compás para identificar la última nota (aproximación)
          const noteMatches = [...barText.matchAll(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g)];
          const totalNotesInBar = noteMatches.length;
          let noteIdx = 0;

          const annotated = barText.replace(/"[^"]*"|!.*?!|(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g, (token, acc, letter, oct) => {
            if (!letter) {
              const cm = token.match(/^"([A-G][#b]?[^"]*)"$/);
              if (cm) currentChord = cm[1];
              return token;
            }
            noteIdx += 1;
            if (!currentChord) return token;
            const midi = abcPitchToMidi(`${acc || ''}${letter}${oct || ''}`, keyMap, barAcc);
            if (midi === null) return token;
            const isLast = noteIdx === totalNotesInBar && totalNotesInBar >= 3;
            const fnLabel = analyzeBassFunction(midi, currentChord, nextChord, isLast);
            return fnLabel ? `"_${fnLabel}"${token}` : token;
          });

          if (idx < bars.length - 1) {
            currentBar += 1;
          }
          return annotated;
        });
        return processedBars.join('|');
      })
      .join('\n');
  }

  /**
   * Inyecta digitaciones definidas en practice.fingerings sobre el número de nota correspondiente.
   * @param {string} abcText Texto ABC.
   * @param {Record<string, string>} fingerings Mapa índice de nota (1-based) -> texto de digitación (ej. "1-3", "①").
   * @returns {string} ABC con anotaciones "^..." sobre las notas indicadas.
   */
  _injectFingeringAnnotations(abcText, fingerings) {
    let noteCounter = 0;
    return abcText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%') || /^[A-Za-z]:/.test(trimmed)) {
          return line;
        }
        return line.replace(/"[^"]*"|!.*?!|(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g, (token, acc, letter) => {
          if (!letter) return token;
          noteCounter += 1;
          const fing = fingerings[String(noteCounter)];
          if (fing && !token.includes('"^')) {
            return `"^${fing}"${token}`;
          }
          return token;
        });
      })
      .join('\n');
  }
}
