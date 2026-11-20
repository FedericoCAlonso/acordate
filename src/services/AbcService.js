import { formatAbcChordsForDisplay } from '../core/i18n.js';
import {
  abcPitchToMidi,
  analyzeBassFunction,
  extractTimeSignatureFromAbc,
  getKeySignatureMap,
  parseTimeSignature
} from '../core/MusicTheory.js';
import { getPitchPolicy, writtenMidiToSoundingMidi } from '../core/PitchPolicy.js';

/**
 * Valida la duración exacta de cada compás por voz en un texto ABC (Control de calidad B4.1).
 * Tolera anacrusa inicial (primer compás incompleto) y compás final incompleto.
 * @param {string} abcText Partitura en notación ABC.
 * @returns {{ valid: boolean, errors: string[], measureCount: number }} Resultado de validación.
 */
export function validateAbcMeasures(abcText) {
  const errors = [];
  const text = String(abcText || '').trim();
  if (!text) return { valid: false, errors: ['ABC vacío.'], measureCount: 0 };

  const timeSig = extractTimeSignatureFromAbc(text, '4/4');
  const { beats, beatUnit } = parseTimeSignature(timeSig);
  const expectedBarQuarters = beats * (4 / beatUnit);

  const unitMatch = text.match(/^L:\s*(\d+)\/(\d+)/m);
  const unitQuarters = unitMatch ? (Number(unitMatch[1]) / Number(unitMatch[2])) * 4 : 0.5;

  // Separa el cuerpo musical por voz (V:1, V:2, etc.)
  const voices = new Map();
  let curVoice = 'V:1';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%')) continue;
    const vMatch = line.match(/^V:\s*(\S+)/);
    if (vMatch) {
      curVoice = `V:${vMatch[1]}`;
      if (!voices.has(curVoice)) voices.set(curVoice, []);
      continue;
    }
    if (/^[A-Za-z]:/.test(line)) continue;
    if (!voices.has(curVoice)) voices.set(curVoice, []);
    voices.get(curVoice).push(line);
  }

  let maxBars = 0;

  for (const [voiceId, lines] of voices.entries()) {
    const body = lines.join(' ');
    const rawBars = body
      .split(/:\|\||\|\||:\||\|:|\|\]|\[\||\|/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && /[A-Ga-gzZx]/.test(b));

    maxBars = Math.max(maxBars, rawBars.length);

    rawBars.forEach((barText, barIdx) => {
      // Limpia acordes/anotaciones entre comillas, decoraciones !...! y ligaduras de fraseo ()
      const cleaned = barText
        .replace(/"[^"]*"/g, ' ')
        .replace(/![^!]*!/g, ' ')
        .replace(/\[[A-Za-z]:[^\]]*\]/g, ' ');

      let sum = 0;
      let tupletRemaining = 0;
      let tupletFactor = 1;
      const tokenRe = /\((\d+)|\[[^\]]+\](\d*\/?\d*)|(?:\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*(\d*\/?\d*)|[zZx](\d*\/?\d*)|([<>]+)/g;
      let m;
      while ((m = tokenRe.exec(cleaned)) !== null) {
        if (m[1]) {
          const n = Number(m[1]);
          if (n === 3) {
            tupletRemaining = 3;
            tupletFactor = 2 / 3;
          } else if (n === 2) {
            tupletRemaining = 2;
            tupletFactor = 3 / 2;
          }
          continue;
        }
        if (m[5]) {
          // Ritmo punteado > o < redistribuye entre dos notas sin cambiar la suma total del compás
          continue;
        }
        const durStr = m[2] ?? m[3] ?? m[4] ?? '';
        let mult = 1;
        if (durStr) {
          if (durStr.includes('/')) {
            const [numS, denS] = durStr.split('/');
            const num = numS ? Number(numS) : 1;
            const den = denS ? Number(denS) : 2;
            if (den > 0) mult = num / den;
          } else {
            mult = Number(durStr) || 1;
          }
        }
        let durQ = unitQuarters * mult;
        if (tupletRemaining > 0) {
          durQ *= tupletFactor;
          tupletRemaining -= 1;
        }
        sum += durQ;
      }

      const isFirst = barIdx === 0;
      const isLast = barIdx === rawBars.length - 1;
      const diff = Math.abs(sum - expectedBarQuarters);

      if (diff > 0.05) {
        // Permite anacrusa inicial o compás final incompleto (nunca excedido)
        if ((isFirst || isLast) && sum > 0 && sum < expectedBarQuarters + 0.05) {
          return;
        }
        errors.push(`${voiceId} compás ${barIdx + 1}: suma ${sum.toFixed(2)} negras (esperado ${expectedBarQuarters.toFixed(2)} en ${timeSig}).`);
      }
    });
  }

  return { valid: errors.length === 0, errors, measureCount: maxBars };
}

/**
 * Valida que todas las notas sonantes de una partitura ABC estén dentro del rango físico real
 * del instrumento según PitchPolicy (Guitarra >= Mi2/MIDI 40; Bajo >= Mi1/MIDI 28) (Control B4.2).
 * @param {string} abcText Partitura ABC.
 * @param {'guitarra'|'guitarra-clasica'|'bajo'} instrument Instrumento destino.
 * @returns {{ valid: boolean, errors: string[], minMidi: number|null, maxMidi: number|null }} Resultado de rango.
 */
export function validateAbcInstrumentRange(abcText, instrument = 'guitarra') {
  const text = String(abcText || '').trim();
  const policy = getPitchPolicy(instrument);
  const keyMatch = text.match(/^K:\s*([A-G][#b]?m?)/m);
  const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');
  const clefMatch = text.match(/clef\s*=\s*([a-z0-9+-]+)/i);
  const policyTarget = clefMatch
    ? (clefMatch[1].startsWith('bass') ? 'bajo' : clefMatch[1] === 'treble-8' ? instrument : clefMatch[1])
    : instrument;

  const musicBody = text
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t && !t.startsWith('%') && !/^[A-Za-z]:/.test(t);
    })
    .join(' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/![^!]*!/g, ' ')
    .replace(/\[[A-Za-z]:[^\]]*\]/g, ' ');

  const errors = [];
  let minMidi = Infinity;
  let maxMidi = -Infinity;
  const noteRe = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g;
  let m;
  while ((m = noteRe.exec(musicBody)) !== null) {
    const token = `${m[1] || ''}${m[2]}${m[3] || ''}`;
    const written = abcPitchToMidi(token, keyMap);
    if (written === null) continue;
    const sounding = writtenMidiToSoundingMidi(written, policyTarget, 'real');
    if (sounding < minMidi) minMidi = sounding;
    if (sounding > maxMidi) maxMidi = sounding;
    if (sounding < policy.minSoundingMidi || sounding > policy.maxSoundingMidi) {
      errors.push(`Nota "${token}" suena MIDI ${sounding}, fuera de rango [${policy.minSoundingMidi}..${policy.maxSoundingMidi}] para ${instrument}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    minMidi: Number.isFinite(minMidi) ? minMidi : null,
    maxMidi: Number.isFinite(maxMidi) ? maxMidi : null
  };
}

/**
 * Servicio encapsulador sobre abcjs (versión fija 6.4.4) responsable de:
 * - Renderizar el pentagrama adaptable con reflujo de compases según ancho y orientación.
 * - Ocultar cabeceras T: duplicadas dentro del SVG y evitar recortes inferiores.
 * - Anotar digitaciones y funciones armónicas de bajo sin usar tablatura en ningún caso.
 * - Extraer la línea de tiempo reproducible aplicando únicamente PitchPolicy.
 */
export class AbcService {
  /**
   * Obtiene la referencia global a la librería vendored abcjs.
   * @returns {object|null} Objeto ABCJS o null en entornos sin navegador.
   */
  _getAbcjs() {
    if (typeof window !== 'undefined' && window.ABCJS) {
      return window.ABCJS;
    }
    return null;
  }

  /**
   * Prepara el texto ABC final para visualización aplicando modo de vista, cifrado latino/americano,
   * digitaciones, etiquetas de función armónica en bajo y eliminación de T: para evitar títulos
   * gigantes cortados dentro del SVG (el título ya vive en la barra superior).
   * @param {string} abcText ABC original (ya transpuesto si corresponde).
   * @param {object} options Opciones de visualización.
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
      isBass = false,
      stripTitle = true,
      showHarmonicAnalysis = false,
      harmonicAnalysis = []
    } = options;

    // Quita cabeceras T: del ABC que se dibuja para no duplicar ni recortar el título en el SVG
    if (stripTitle) {
      result = result
        .split('\n')
        .filter((line) => !/^T:/i.test(line.trim()))
        .join('\n');
    }

    // Detecta todas las voces declaradas (V:1, V:2, V:3...) y las alinea por sistema
    const declaredVoices = [...new Set([...result.matchAll(/^V:\s*(\S+)/gm)].map((m) => m[1]))];
    if (declaredVoices.length >= 2) {
      result = this._alignMultiVoiceLines(result);
      const hasExplicitBassVoice = /^V:\s*\S+[^\n]*clef\s*=\s*bass/im.test(result);
      if (!/^%%score/m.test(result) && !hasExplicitBassVoice) {
        result = result.replace(/^(K:[^\n]*)/m, `$1\n%%score (${declaredVoices.join(' ')})`);
      }
    }

    // Capa opcional de análisis armónico (grados romanos / cadencias para guitarra clásica)
    if (showHarmonicAnalysis && Array.isArray(harmonicAnalysis) && harmonicAnalysis.length > 0) {
      result = this._injectHarmonicAnalysisLayer(result, harmonicAnalysis);
    }

    // 1) En bajo con funciones armónicas activas, anota R, 3, 5, 7, Crom debajo de cada nota
    if (isBass && showBassFunctions && viewMode !== 'pentagrama') {
      result = this._injectBassFunctionAnnotations(result);
    }

    // 2) Inyecta digitaciones del campo practice.fingerings si están habilitadas
    if (showFingerings && fingerings && Object.keys(fingerings).length > 0) {
      result = this._injectFingeringAnnotations(result, fingerings);
    } else if (!showFingerings) {
      result = result.replace(/"\^[^"]+"/g, '');
    }

    // 3) En modo Pentagrama puro, oculta los símbolos de acorde para lectura pura (mantiene digitaciones p-i-m-a)
    if (viewMode === 'pentagrama') {
      result = result.replace(/"([^"]+)"/g, (full, inner) => {
        if (/^[\^_<>@]/.test(inner) || /^(p|i|m|a|[0-4])$/.test(inner.trim())) return full;
        return '';
      });
    } else if (chordNotation === 'latino') {
      result = formatAbcChordsForDisplay(result, 'latino');
    }

    return result;
  }

  /**
   * Alinea los saltos de línea entre voces (V:1, V:2, V:3...) escritas en bloques consecutivos
   * para que todas compartan la misma cantidad de compases por sistema al renderizar con abcjs.
   * @param {string} abcText Partitura ABC multi-voz.
   * @returns {string} Partitura con líneas alineadas por voz.
   */
  _alignMultiVoiceLines(abcText) {
    const lines = String(abcText || '').split('\n');
    const headerLines = [];
    const blocks = [];
    let currentBlock = null;

    for (const line of lines) {
      const trimmed = line.trim();
      const vMatch = trimmed.match(/^V:\s*(\S+)/);
      if (vMatch) {
        currentBlock = { id: vMatch[1], header: line, bodyLines: [] };
        blocks.push(currentBlock);
        continue;
      }
      if (!currentBlock) {
        headerLines.push(line);
      } else if (trimmed) {
        currentBlock.bodyLines.push(trimmed);
      }
    }

    // Solo re-alinea si cada voz aparece una única vez en bloques completos (no ya intercalada)
    const uniqueIds = new Set(blocks.map((b) => b.id));
    if (blocks.length < 2 || uniqueIds.size !== blocks.length) {
      return abcText;
    }

    const lineCounts = blocks.map((b) => b.bodyLines.length);
    if (new Set(lineCounts).size === 1) {
      return abcText;
    }

    // Divide cada voz en segmentos de compás conservando su barra final (|, |], :|, ||)
    const splitVoiceBars = (bodyLines) => {
      const joined = bodyLines.join(' ');
      const bars = [];
      const re = /([^|]+?(?::\|\||\|\||:\||\|\]|\|))/g;
      let match;
      let lastIdx = 0;
      while ((match = re.exec(joined)) !== null) {
        const seg = match[1].trim();
        if (seg) bars.push(seg);
        lastIdx = re.lastIndex;
      }
      const tail = joined.slice(lastIdx).trim();
      if (tail) bars.push(tail);
      return bars;
    };

    const voiceBars = blocks.map((b) => splitVoiceBars(b.bodyLines));
    const firstCount = voiceBars[0].length;
    if (firstCount === 0 || voiceBars.some((bars) => bars.length !== firstCount)) {
      return abcText;
    }

    // Toma los compases por línea de la primera línea de V:1 como referencia de sistema
    const refBarsPerLine = Math.max(1, splitVoiceBars([blocks[0].bodyLines[0]]).length);
    const rebuilt = [...headerLines];
    blocks.forEach((b, idx) => {
      rebuilt.push(b.header);
      const bars = voiceBars[idx];
      for (let i = 0; i < bars.length; i += refBarsPerLine) {
        rebuilt.push(bars.slice(i, i + refBarsPerLine).join(' '));
      }
    });
    return rebuilt.join('\n');
  }

  /**
   * Calcula la cantidad óptima de compases por línea según el ancho efectivo disponible.
   * Vertical móvil: 2-3 compases; apaisado/tablet: 4-6; escritorio amplio: hasta 6-8.
   * @param {number} effectiveWidth Ancho útil del contenedor dividido por el zoom.
   * @returns {number} Cantidad sugerida de compases por sistema.
   */
  computeMeasuresPerLine(effectiveWidth) {
    if (effectiveWidth < 380) return 2;
    if (effectiveWidth < 560) return 3;
    if (effectiveWidth < 760) return 4;
    if (effectiveWidth < 980) return 6;
    return 8;
  }

  /**
   * Renderiza la partitura ABC en el contenedor usando todo el ancho disponible,
   * con reflujo de compases y protección contra recortes en la última línea.
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

    const styles = typeof window !== 'undefined' && window.getComputedStyle
      ? window.getComputedStyle(container)
      : null;
    const padX = styles
      ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      : 16;

    const rawWidth = options.width || container.clientWidth || 340;
    const availableWidth = Math.max(260, Math.floor(rawWidth - padX));
    const zoom = Math.max(0.75, Math.min(1.6, Number(options.zoom) || 1));
    const effectiveWidth = availableWidth / zoom;
    const preferredMeasuresPerLine = this.computeMeasuresPerLine(effectiveWidth);

    const isMultiVoice = [...new Set([...String(abcText || '').matchAll(/^V:\s*(\S+)/gm)].map((m) => m[1]))].length >= 2;

    const visualParams = {
      add_classes: true,
      responsive: 'resize',
      staffwidth: Math.max(250, Math.floor(effectiveWidth)),
      scale: zoom,
      // Desactivado para que "Em" y "Am" se muestren normales y no como "Eᵐ" / "Aᵐ"
      jazzchords: false,
      paddingtop: 16,
      paddingbottom: 36,
      paddingleft: 6,
      paddingright: 6
    };

    // El ajuste automático wrap de abcjs es solo para una voz; en obras polifónicas desalinea voces
    if (!isMultiVoice) {
      visualParams.wrap = {
        preferredMeasuresPerLine,
        minSpacing: 1.35,
        maxSpacing: 2.7
      };
    }

    if (typeof options.clickListener === 'function') {
      visualParams.clickListener = options.clickListener;
    }

    container.innerHTML = '';
    const tunes = ABCJS.renderAbc(container, abcText, visualParams);
    const visualObj = tunes && tunes[0] ? tunes[0] : null;

    // Ajusta el viewBox si alguna digitación o cifrado inferior sobresale del alto calculado
    this._ensureSvgNeverClips(container);

    const warnings = Array.isArray(visualObj?.warnings)
      ? visualObj.warnings.map((w) => String(w).replace(/<[^>]+>/g, '').trim()).filter(Boolean)
      : [];

    return { visualObj, warnings };
  }

  /**
   * Revisa el bounding box real del SVG generado por abcjs y amplía el viewBox si
   * alguna anotación, cifrado o digitación inferior quedaría recortada.
   * @param {HTMLElement} container Contenedor que aloja el SVG renderizado.
   */
  _ensureSvgNeverClips(container) {
    const svg = container.querySelector('svg');
    if (!svg || typeof svg.getBBox !== 'function') return;
    try {
      const vb = svg.getAttribute('viewBox');
      if (!vb) return;
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length !== 4 || parts.some(Number.isNaN)) return;
      const [vx, vy, vw, vh] = parts;
      const bbox = svg.getBBox();
      if (!bbox || bbox.width === 0 || bbox.height === 0) return;

      const minY = Math.min(vy, Math.floor(bbox.y - 10));
      const maxY = Math.max(vy + vh, Math.ceil(bbox.y + bbox.height + 18));
      const nextH = Math.max(vh, maxY - minY);

      if (minY !== vy || nextH > vh) {
        svg.setAttribute('viewBox', `${vx} ${minY} ${vw} ${nextH}`);
      }
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.overflow = 'visible';
    } catch {
      // Algunos entornos sin layout (display:none) lanzan en getBBox: se ignora sin error
    }
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
   * Extrae una línea de tiempo reproducible completa (notas con MIDI real según PitchPolicy,
   * acordes, compases y elementos SVG) a partir del visualObj de abcjs o del ABC crudo.
   * @param {object|null} visualObj Objeto retornado por ABCJS.renderAbc o ABCJS.parseOnly.
   * @param {string} rawAbc Texto ABC fuente (en cifrado americano).
   * @param {object} [meta={}] Metadatos de respaldo (instrument, isBass, timeSignature).
   * @returns {object} Línea de tiempo lista para AudioSynthService.
   */
  extractTimeline(visualObj, rawAbc, meta = {}) {
    const timeSig = extractTimeSignatureFromAbc(rawAbc, meta.timeSignature || '4/4');
    const { beats, beatUnit } = parseTimeSignature(timeSig);
    const beatsPerMeasure = beats * (4 / beatUnit);
    const isBassPiece = Boolean(
      meta.instrument === 'bajo' || meta.isBass || /clef\s*=\s*bass/i.test(rawAbc || '')
    );
    const instrument = meta.instrument || (isBassPiece ? 'bajo' : 'guitarra');

    if (visualObj && Array.isArray(visualObj.lines) && visualObj.lines.length > 0) {
      return this._extractFromVisualObj(visualObj, rawAbc, { beatsPerMeasure, beatUnit, isBassPiece, instrument });
    }

    return this._extractFromRawAbc(rawAbc, { beatsPerMeasure, beatUnit, isBassPiece, instrument });
  }

  /**
   * Extrae eventos reproducibles y referencias a elementos SVG directamente desde visualObj de abcjs.
   * Aplica la conversión de octava exclusivamente mediante PitchPolicy.writtenMidiToSoundingMidi.
   * @param {object} visualObj Objeto renderizado/parseado por abcjs.
   * @param {string} rawAbc ABC original en cifrado americano.
   * @param {{ beatsPerMeasure: number, beatUnit: number, isBassPiece: boolean, instrument: string }} cfg Configuración.
   * @returns {object} Timeline estructurada.
   */
  _extractFromVisualObj(visualObj, rawAbc, cfg) {
    const { beatsPerMeasure, beatUnit, isBassPiece, instrument } = cfg;
    const notes = [];
    const chords = [];
    const keyMatch = String(rawAbc || '').match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');

    // Acordes en cifrado americano del texto ABC original (independiente del cifrado latino visual)
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

    const voiceCursors = new Map();
    const voiceMeasures = new Map();
    const voiceBarAcc = new Map();
    /** Asigna índice lógico estable 0, 1, ... a cada voz (funciona con o sin %%score (1 2)). */
    const voiceLogicalIndex = new Map();

    for (const line of visualObj.lines) {
      if (!Array.isArray(line.staff)) continue;
      line.staff.forEach((staff, staffIdx) => {
        const clefType = staff.clef?.type || (isBassPiece ? 'bass' : 'treble-8');
        const isStaffBass = clefType.startsWith('bass');
        const policyTarget = isStaffBass ? 'bajo' : clefType === 'treble-8' ? instrument : clefType;

        if (!Array.isArray(staff.voices)) return;
        staff.voices.forEach((voice, voiceIdx) => {
          const vKey = `${staffIdx}-${voiceIdx}`;
          if (!voiceLogicalIndex.has(vKey)) {
            voiceLogicalIndex.set(vKey, voiceLogicalIndex.size);
          }
          const logicalVoice = voiceLogicalIndex.get(vKey);
          if (!voiceCursors.has(vKey)) voiceCursors.set(vKey, 0);
          if (!voiceMeasures.has(vKey)) voiceMeasures.set(vKey, 1);
          if (!voiceBarAcc.has(vKey)) voiceBarAcc.set(vKey, {});

          let currentBeat = voiceCursors.get(vKey);
          let measureIndex = voiceMeasures.get(vKey);
          let barAcc = voiceBarAcc.get(vKey);
          /** Multiplicador activo de tresillo/tuplet (abcjs deja elem.duration sin multiplicar). */
          let activeTripletMult = 1;

          for (const elem of voice) {
            if (elem.el_type === 'bar') {
              barAcc = {};
              activeTripletMult = 1;
              voiceBarAcc.set(vKey, barAcc);
              if (currentBeat > 0.01) {
                measureIndex += 1;
              }
              continue;
            }

            if (elem.el_type !== 'note') continue;

            if (elem.startTriplet) {
              activeTripletMult =
                typeof elem.tripletMultiplier === 'number' && elem.tripletMultiplier > 0
                  ? elem.tripletMultiplier
                  : elem.startTriplet === 3
                    ? 2 / 3
                    : elem.startTriplet === 2
                      ? 3 / 2
                      : 1;
            }
            const durBeats = (elem.duration || 0.25) * 4 * activeTripletMult;
            if (elem.endTriplet) {
              activeTripletMult = 1;
            }
            const isRest = Boolean(elem.rest);

            if (logicalVoice === 0 && Array.isArray(elem.chord)) {
              for (const chObj of elem.chord) {
                if (
                  chObj.position === 'default' &&
                  chObj.name &&
                  !/^[\^_<>@]/.test(chObj.name) &&
                  /^[A-G][#b]?/.test(chObj.name.trim())
                ) {
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

            // Altura escrita -> altura MIDI real usando únicamente PitchPolicy
            const midis = [];
            if (!isRest && Array.isArray(elem.pitches)) {
              for (const p of elem.pitches) {
                const writtenMidi = this._abcjsPitchToWrittenMidi(p, keyMap, barAcc);
                const soundingMidi = writtenMidiToSoundingMidi(writtenMidi, policyTarget, 'real');
                if (Number.isFinite(soundingMidi)) {
                  midis.push(soundingMidi);
                }
              }
            }

            const svgElements = [];
            if (elem.abselem?.elemset) {
              for (const node of elem.abselem.elemset) {
                if (node) svgElements.push(node);
              }
            }

            notes.push({
              noteId: `${vKey}-${notes.length}`,
              beat: currentBeat,
              durationBeats: durBeats,
              midis,
              isRest,
              measureIndex,
              voiceIndex: logicalVoice,
              isBassStaff: isStaffBass,
              isBassVoice: isStaffBass || logicalVoice > 0,
              svgElements
            });

            currentBeat += durBeats;
          }

          voiceCursors.set(vKey, currentBeat);
          voiceMeasures.set(vKey, measureIndex);
        });
      });
    }

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
      isBassPiece,
      hasMultipleVoices: voiceCursors.size > 1
    };
  }

  /**
   * Convierte un objeto pitch interno de abcjs ({ pitch, accidental }) a altura MIDI escrita
   * (donde pitch=0 corresponde a C4 = MIDI 60), sin desplazar octavas.
   * @param {object} pitchObj Objeto pitch de abcjs.
   * @param {Record<string, number>} keyMap Armadura de clave activa.
   * @param {Record<string, number>} barAcc Alteraciones vigentes en el compás.
   * @returns {number} Número MIDI escrito.
   */
  _abcjsPitchToWrittenMidi(pitchObj, keyMap, barAcc) {
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
   * Parser de respaldo para entornos sin DOM (pruebas unitarias) que extrae una línea de tiempo
   * aplicando exactamente la misma PitchPolicy que el parser visual.
   * @param {string} rawAbc Texto ABC.
   * @param {{ beatsPerMeasure: number, beatUnit: number, isBassPiece: boolean, instrument: string }} cfg Configuración.
   * @returns {object} Timeline estructurada.
   */
  _extractFromRawAbc(rawAbc, cfg) {
    const { beatsPerMeasure, beatUnit, isBassPiece, instrument } = cfg;
    const keyMatch = String(rawAbc || '').match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');
    const clefMatch = String(rawAbc || '').match(/clef\s*=\s*([a-z0-9+-]+)/i);
    const policyTarget = clefMatch ? (clefMatch[1].startsWith('bass') ? 'bajo' : clefMatch[1] === 'treble-8' ? instrument : clefMatch[1]) : instrument;

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
        const writtenMidi = abcPitchToMidi(pitchStr, keyMap, barAcc);
        const soundingMidi = writtenMidi !== null ? writtenMidiToSoundingMidi(writtenMidi, policyTarget, 'real') : null;
        const dur = unitBeats * this._parseAbcDurationFactor(match[8]);
        notes.push({
          beat: currentBeat,
          durationBeats: dur,
          midis: soundingMidi !== null ? [soundingMidi] : [],
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
   * @param {Record<string, string>} fingerings Mapa índice de nota (1-based) -> texto de digitación.
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

  /**
   * Inyecta la capa opcional de análisis armónico (grados romanos y cadencias, ej. I, V7, ii6)
   * debajo del primer pulso de cada compás de la voz principal en obras de guitarra clásica.
   * @param {string} abcText Texto ABC.
   * @param {Array<{ measure: number, label: string }|string>} analysis Lista de grados por compás.
   * @returns {string} ABC enriquecido con anotaciones inferiores "_...".
   */
  _injectHarmonicAnalysisLayer(abcText, analysis) {
    const byMeasure = new Map();
    analysis.forEach((entry, idx) => {
      if (typeof entry === 'string') {
        if (entry.trim()) byMeasure.set(idx + 1, entry.trim());
      } else if (entry && entry.label) {
        byMeasure.set(Number(entry.measure) || idx + 1, String(entry.label).trim());
      }
    });
    if (byMeasure.size === 0) return abcText;

    let measureCounter = 0;
    let inFirstVoice = true;

    return abcText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%')) return line;
        if (/^V:\s*/.test(trimmed)) {
          inFirstVoice = /^V:\s*1\b/.test(trimmed);
          return line;
        }
        if (/^[A-Za-z]:/.test(trimmed) || !inFirstVoice) return line;

        const bars = line.split('|');
        return bars
          .map((bar) => {
            if (!/[A-Ga-gz]/.test(bar)) return bar;
            measureCounter += 1;
            const roman = byMeasure.get(measureCounter);
            if (!roman) return bar;
            return bar.replace(/(\[?[A-Ga-g][,']*)/, `"_${roman}"$1`);
          })
          .join('|');
      })
      .join('\n');
  }
}
