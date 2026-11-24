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
  const policyTarget = instrument === 'piano'
    ? 'piano'
    : clefMatch
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
 * Clasifica una anotación o cifrado de partitura ABC (contenido entre comillas o texto SVG)
 * en una de cuatro capas independientes:
 * - `'rightHand'`: dedos de mano derecha (`p, i, m, a, c`, alternancias `i-m`, rasgueos `↓/↑`).
 * - `'leftHand'`: dedos de mano izquierda (`0–4`), cuerdas en círculo (`①–⑥`), combinaciones (`2③`),
 *   posiciones de traste en romanos (`I`–`XII`, `pos. V`, `C.V`, `½C.II`, `tr. 5`).
 * - `'chord'`: símbolos de cifrado americano (`C`, `Dm7`, `F#m7b5/C`) o latino (`Do`, `Rem7`, `Sol7`).
 * - `'other'`: funciones armónicas de bajo (`R`, `3`, `5`, `b7`, `Crom`), análisis armónico inferior (`_I`, `_V7`, `_ii6`) y texto libre.
 * @param {string} rawText Texto crudo (puede incluir prefijo de posición `^`, `_`, `<`, `>`, `@`).
 * @param {{ isRenderedSvg?: boolean }} [opts={}] Opciones cuando se clasifica texto ya renderizado en SVG.
 * @returns {'chord'|'rightHand'|'leftHand'|'other'} Capa semántica detectada.
 */
export function classifyAbcAnnotation(rawText, { isRenderedSvg = false } = {}) {
  const raw = String(rawText || '').trim();
  if (!raw) return 'other';

  const posPrefix = /^[\\^_<>@]/.test(raw) ? raw[0] : '';
  const body = posPrefix ? raw.slice(1).trim() : raw;
  if (!body) return 'other';

  // 1) Mano derecha: p, i, m, a, c, combinaciones p-i / i-m / m-a y flechas de rasgueo/púa
  if (/^([pimac](?:[\s–-][pimac])*|[↓↑]+)$/i.test(body) && /^[pimac↓↑\s–-]+$/.test(body)) {
    return 'rightHand';
  }

  // 2) Anotaciones inferiores explícitas ("_...") suelen ser funciones de bajo o grados romanos de análisis
  if (posPrefix === '_') {
    return 'other';
  }

  // 3) Mano izquierda (o digitación numérica 1-5 en piano): dedos 0-5, cuerdas ①-⑥, combinaciones (1①, 0⑥, 2④), posiciones romanas (^V, C.V, ½C.II, pos. V, tr. 5)
  if (/^[0-5]?[①②③④⑤⑥]$/.test(body) || /^[0-5](?:[\s–-][0-5])*$/.test(body)) {
    return 'leftHand';
  }
  if (
    /^(?:pos\.?\s*|tr\.?\s*|½?C\.?\s*|B\.?\s*)(?:[IVX]+|\d+)$/i.test(body) ||
    ((posPrefix === '^' || isRenderedSvg) && /^(?:XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)$/.test(body))
  ) {
    return 'leftHand';
  }

  // 4) Cifrado de acordes (solo sin prefijo ^_<>@, o en SVG ya renderizado)
  if (!posPrefix || isRenderedSvg) {
    // Americano: C, Am7, F#m7b5, Bbmaj7/D, G7alt, Eb9sus4...
    if (/^[A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add|alt|M|\+|-|°|ø|\d|\([^)]*\))*(?:\/[A-G][#b♯♭]?)?$/.test(body)) {
      return 'chord';
    }
    // Latino renderizado: Do, Rem7, Sol7, Sib, Fa#m7/Do#...
    if (/^(?:Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?(?:m|maj|min|dim|aug|sus|add|alt|M|\+|-|°|ø|\d|\([^)]*\))*(?:\/(?:Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?)?$/.test(body)) {
      return 'chord';
    }
  }

  return 'other';
}

/**
 * Resuelve colisiones verticales entre rectángulos de texto (anotaciones y acordes) dentro de una
 * misma zona (arriba o abajo del pentagrama), desplazando únicamente los elementos que realmente
 * se pisan para garantizar lectura limpia sin solapamientos.
 * @param {Array<{ id?: string, x: number, y: number, width: number, height: number, tier?: number }>} items Rectángulos con su prioridad (`tier`: menor = más cerca del pentagrama).
 * @param {'up'|'down'} [direction='up'] Dirección de desplazamiento al resolver choque (`up` arriba del pentagrama, `down` abajo).
 * @param {{ padX?: number, gapY?: number }} [options={}] Margen horizontal y separación vertical mínima.
 * @returns {Array<{ item: object, dy: number, y: number }>} Desplazamientos calculados por elemento.
 */
export function resolveRectCollisions(items, direction = 'up', { padX = 3, gapY = 2.5 } = {}) {
  const ordered = [...items].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.x - b.x);
  const placed = [];
  const results = new Map();

  for (const item of ordered) {
    let curY = item.y;
    const x1 = item.x - padX;
    const x2 = item.x + item.width + padX;

    let moved = true;
    let guard = 0;
    while (moved && guard < 16) {
      moved = false;
      guard += 1;
      for (const p of placed) {
        const overlapsX = x1 < p.x2 && x2 > p.x1;
        if (!overlapsX) continue;
        const overlapsY = curY < p.y2 + gapY && curY + item.height > p.y1 - gapY;
        if (overlapsY) {
          curY = direction === 'up' ? p.y1 - item.height - gapY : p.y2 + gapY;
          moved = true;
        }
      }
    }

    placed.push({ x1, x2, y1: curY, y2: curY + item.height });
    results.set(item, { item, dy: curY - item.y, y: curY });
  }

  return items.map((it) => results.get(it));
}

/**
 * Servicio encapsulador sobre abcjs (versión fija 6.4.4) responsable de:
 * - Renderizar el pentagrama adaptable con reflujo de compases según ancho y orientación.
 * - Ocultar cabeceras T: duplicadas dentro del SVG y evitar recortes inferiores.
 * - Gestionar capas independientes de anotaciones (acordes, mano izquierda, mano derecha y análisis)
 *   resolviendo automáticamente cualquier superposición visual en el SVG.
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
      showLeftHand,
      showRightHand,
      showChords,
      showOtherAnnotations = true,
      fingerings = {},
      showBassFunctions = false,
      isBass = false,
      isPiano = false,
      stripTitle = true,
      showHarmonicAnalysis = false,
      harmonicAnalysis = []
    } = options;

    const effectiveLeftHand = showLeftHand !== undefined ? Boolean(showLeftHand) : Boolean(showFingerings);
    const effectiveRightHand = showRightHand !== undefined ? Boolean(showRightHand) : Boolean(showFingerings);
    const effectiveChords = showChords !== undefined ? Boolean(showChords) : viewMode !== 'pentagrama';
    const effectiveOther = Boolean(showOtherAnnotations);

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
      if (!/^%%(?:score|staves)/m.test(result) && !hasExplicitBassVoice) {
        result = result.replace(/^(K:[^\n]*)/m, `$1\n%%score (${declaredVoices.join(' ')})`);
      }
    }

    // Capa opcional de análisis armónico (grados romanos / cadencias para guitarra clásica)
    if (effectiveOther && showHarmonicAnalysis && Array.isArray(harmonicAnalysis) && harmonicAnalysis.length > 0) {
      result = this._injectHarmonicAnalysisLayer(result, harmonicAnalysis);
    }

    // 1) En bajo con funciones armónicas activas, anota R, 3, 5, 7, Crom debajo de cada nota (nunca en piano)
    if (effectiveOther && isBass && !isPiano && showBassFunctions && viewMode !== 'pentagrama') {
      result = this._injectBassFunctionAnnotations(result);
    }

    // 2) Inyecta digitaciones del campo practice.fingerings si la mano izquierda está habilitada
    if (effectiveLeftHand && fingerings && Object.keys(fingerings).length > 0) {
      result = this._injectFingeringAnnotations(result, fingerings);
    }

    // 3) Filtra de forma independiente las 4 capas de anotaciones ("...") y respeta cifrado latino/americano
    if (isPiano) {
      // En gran pentagrama de piano, asegura aire vertical limpio entre sistemas para cifrados y digitaciones 1-5
      if (!/^%%staffsep\b/m.test(result)) {
        result = result.replace(/^(K:[^\n]*)/m, '$1\n%%staffsep 50\n%%sysstaffsep 44');
      }
      // En piano, los números 1–5 en V:1 (o voz única en sol) corresponden a Mano Derecha y en V:2 (clave de fa) a Mano Izquierda
      let currentVoiceId = '1';
      result = result
        .split('\n')
        .map((line) => {
          const vm = line.trim().match(/^V:\s*(\S+)/);
          if (vm) {
            currentVoiceId = vm[1];
            return line;
          }
          if (/^[A-Za-z]:|^%%/.test(line.trim())) return line;
          return line.replace(/"([^"]+)"/g, (full, inner) => {
            const trimmedInner = String(inner || '').trim();
            const isPianoDigit = /^[\^_]?[1-5](?:[\s–-][1-5])*$/.test(trimmedInner);
            if (isPianoDigit) {
              const isPianoLhVoice = currentVoiceId === '2' || /^lh|mi$/i.test(currentVoiceId);
              return isPianoLhVoice ? (effectiveLeftHand ? full : '') : (effectiveRightHand ? full : '');
            }
            const kind = classifyAbcAnnotation(inner);
            if (kind === 'chord') return effectiveChords ? full : '';
            if (kind === 'leftHand' || kind === 'rightHand') {
              const isPianoLhVoice = currentVoiceId === '2' || /^lh|mi$/i.test(currentVoiceId);
              return isPianoLhVoice ? (effectiveLeftHand ? full : '') : (effectiveRightHand ? full : '');
            }
            return effectiveOther ? full : '';
          });
        })
        .join('\n');
    } else {
      result = result.replace(/"([^"]+)"/g, (full, inner) => {
        const kind = classifyAbcAnnotation(inner);
        if (kind === 'chord') {
          return effectiveChords ? full : '';
        }
        if (kind === 'leftHand') {
          return effectiveLeftHand ? full : '';
        }
        if (kind === 'rightHand') {
          return effectiveRightHand ? full : '';
        }
        return effectiveOther ? full : '';
      });
    }

    if (effectiveChords && chordNotation === 'latino') {
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

    // Etiqueta cada capa (acordes, mano izq., mano der., otras) y resuelve cualquier choque vertical en el SVG
    this._tagAndResolveAnnotationCollisions(container, { isPiano: Boolean(options.isPiano) });

    // Ajusta el viewBox si alguna digitación o cifrado superior/inferior sobresale del alto calculado
    this._ensureSvgNeverClips(container);

    const warnings = Array.isArray(visualObj?.warnings)
      ? visualObj.warnings.map((w) => String(w).replace(/<[^>]+>/g, '').trim()).filter(Boolean)
      : [];

    return { visualObj, warnings };
  }

  /**
   * Clasifica visualmente cada texto `.abcjs-chord` / `.abcjs-annotation` dentro del SVG
   * (aplicando clases semánticas por capa), centra horizontalmente cada digitación sobre la
   * cabeza de su nota real y organiza estrictamente las bandas verticales (digitaciones pegadas
   * al pentagrama/nota, cifrados de acorde siempre arriba en una línea uniforme y MI de piano
   * siempre centrada debajo del pentagrama en clave de Fa) sin saltos ni inversiones.
   * @param {HTMLElement} container Contenedor DOM del SVG renderizado por abcjs.
   * @param {{ isPiano?: boolean }} [options={}] Opciones de instrumento.
   */
  _tagAndResolveAnnotationCollisions(container, { isPiano = false } = {}) {
    const svg = container.querySelector('svg');
    if (!svg || typeof svg.getBBox !== 'function') return;

    const extractClassNum = (elNode, prefix) => {
      const cls = elNode?.getAttribute?.('class') || '';
      const m = cls.match(new RegExp(`\\b${prefix}(\\d+)\\b`));
      return m ? Number(m[1]) : null;
    };

    const setTextCenterX = (textNode, cx) => {
      const val = cx.toFixed(2);
      textNode.setAttribute('text-anchor', 'middle');
      textNode.setAttribute('x', val);
      const tspans = textNode.querySelectorAll('tspan');
      for (const ts of tspans) {
        ts.setAttribute('x', val);
      }
    };

    const shiftTextY = (textNode, dy) => {
      if (!Number.isFinite(dy) || Math.abs(dy) < 0.3) return;
      const curYAttr = parseFloat(textNode.getAttribute('y'));
      if (Number.isFinite(curYAttr)) {
        textNode.setAttribute('y', (curYAttr + dy).toFixed(2));
      } else {
        const existingT = textNode.getAttribute('transform') || '';
        textNode.setAttribute('transform', `${existingT} translate(0, ${dy.toFixed(2)})`.trim());
      }
    };

    const measureNoteInk = (noteGroup) => {
      if (!noteGroup) return null;
      const heads = [...noteGroup.querySelectorAll('.abcjs-notehead')];
      const inkParts = [...noteGroup.querySelectorAll('.abcjs-notehead, .abcjs-stem, .abcjs-ledger, .abcjs-flag, .abcjs-dot')];
      let headMinX = Infinity;
      let headMaxX = -Infinity;
      for (const h of heads) {
        try {
          const hb = h.getBBox();
          if (hb && hb.width > 0) {
            headMinX = Math.min(headMinX, hb.x);
            headMaxX = Math.max(headMaxX, hb.x + hb.width);
          }
        } catch {
          // Ignora cabezas sin layout
        }
      }
      let inkTop = Infinity;
      let inkBottom = -Infinity;
      for (const p of inkParts) {
        try {
          const pb = p.getBBox();
          if (pb && (pb.width > 0 || pb.height > 0)) {
            inkTop = Math.min(inkTop, pb.y);
            inkBottom = Math.max(inkBottom, pb.y + pb.height);
          }
        } catch {
          // Ignora trazos sin layout
        }
      }
      if (!Number.isFinite(headMinX) || !Number.isFinite(inkTop)) return null;
      return {
        headCx: (headMinX + headMaxX) / 2,
        inkTop,
        inkBottom
      };
    };

    try {
      // 1) Inventario exacto de cada pentagrama individual (.abcjs-staff) con su línea (l) y voz (v)
      const staffEls = [...svg.querySelectorAll('.abcjs-staff')];
      const staffs = [];
      for (const st of staffEls) {
        try {
          const b = st.getBBox();
          if (b && b.width > 0) {
            staffs.push({
              el: st,
              top: b.y,
              bottom: b.y + b.height,
              center: b.y + b.height / 2,
              lineIdx: extractClassNum(st, 'abcjs-l'),
              voiceIdx: extractClassNum(st, 'abcjs-v'),
              inkTop: b.y,
              inkBottom: b.y + b.height
            });
          }
        } catch {
          // Ignora nodos ocultos
        }
      }
      staffs.sort((a, b) => a.top - b.top);

      // Agrupa por línea para distinguir pentagrama superior (Sol/MD) e inferior (Fa/MI) en gran pentagrama
      const staffsByLine = new Map();
      for (const st of staffs) {
        const lk = st.lineIdx ?? 0;
        if (!staffsByLine.has(lk)) staffsByLine.set(lk, []);
        st.staffInLine = staffsByLine.get(lk).length;
        staffsByLine.get(lk).push(st);
      }

      const findStaffForNode = (node, cy) => {
        const lineIdx = extractClassNum(node, 'abcjs-l');
        const voiceIdx = extractClassNum(node, 'abcjs-v');
        if (lineIdx !== null && staffsByLine.has(lineIdx)) {
          const lineStaffs = staffsByLine.get(lineIdx);
          if (lineStaffs.length === 1) return lineStaffs[0];
          if (isPiano && voiceIdx !== null) {
            return voiceIdx === 0 ? lineStaffs[0] : lineStaffs[Math.min(1, lineStaffs.length - 1)];
          }
          const exactVoice = voiceIdx !== null ? lineStaffs.find((s) => s.voiceIdx === voiceIdx) : null;
          if (exactVoice) return exactVoice;
          let best = lineStaffs[0];
          let bestD = Math.abs(cy - best.center);
          for (const cand of lineStaffs) {
            const d = Math.abs(cy - cand.center);
            if (d < bestD) { best = cand; bestD = d; }
          }
          return best;
        }
        let best = staffs[0] || null;
        let bestD = best ? Math.abs(cy - best.center) : Infinity;
        for (const cand of staffs) {
          const d = Math.abs(cy - cand.center);
          if (d < bestD) { best = cand; bestD = d; }
        }
        return best;
      };

      // Mide también corchetes/barras de corcheas y ligaduras para que nunca queden pisados
      for (const beam of svg.querySelectorAll('.abcjs-beam-elem, .abcjs-slur')) {
        try {
          const bb = beam.getBBox();
          if (!bb || (bb.width === 0 && bb.height === 0)) continue;
          const st = findStaffForNode(beam, bb.y + bb.height / 2);
          if (st) {
            st.inkTop = Math.min(st.inkTop, bb.y);
            st.inkBottom = Math.max(st.inkBottom, bb.y + bb.height);
          }
        } catch {
          // Ignora elementos sin layout
        }
      }

      const textNodes = [...svg.querySelectorAll('text.abcjs-chord, text.abcjs-annotation')];
      if (textNodes.length === 0) return;

      // 2) Clasifica semánticamente, aplica clases CSS finales y centra horizontalmente sobre la cabeza de nota
      const byZone = new Map();

      for (const node of textNodes) {
        const text = (node.textContent || '').trim();
        if (!text) continue;

        let initBox;
        try {
          initBox = node.getBBox();
        } catch {
          continue;
        }
        if (!initBox || initBox.width === 0 || initBox.height === 0) continue;

        const initCy = initBox.y + initBox.height / 2;
        const staff = findStaffForNode(node, initCy);
        const staffId = staff ? staffs.indexOf(staff) : 0;
        const voiceIdx = extractClassNum(node, 'abcjs-v') ?? 0;
        const isExplicitChord = node.classList.contains('abcjs-chord');
        const isPianoDigit = isPiano && !isExplicitChord && /^[1-5](?:[\s–-][1-5])*$/.test(text);

        let side = staff ? (initCy <= staff.center ? 'up' : 'down') : 'up';
        let kind;

        if (isExplicitChord) {
          kind = 'chord';
          side = 'up';
        } else if (isPianoDigit) {
          const isLowerStaff = voiceIdx >= 1 || (staff && staff.staffInLine >= 1);
          if (isLowerStaff) {
            kind = 'leftHand';
            side = 'down';
            node.classList.add('acordate-ann--lh', 'acordate-ann--fingering', 'acordate-ann--piano-lh');
          } else {
            kind = 'rightHand';
            side = 'up';
            node.classList.add('acordate-ann--rh', 'acordate-ann--fingering', 'acordate-ann--piano-rh');
          }
        } else if (side === 'down') {
          kind = classifyAbcAnnotation(`_${text}`, { isRenderedSvg: true });
          node.classList.add(`acordate-ann--${kind === 'leftHand' ? 'lh' : kind === 'rightHand' ? 'rh' : 'other'}`);
        } else {
          kind = classifyAbcAnnotation(text, { isRenderedSvg: true });
          if (kind === 'chord' && node.classList.contains('abcjs-annotation')) {
            kind = classifyAbcAnnotation(`^${text}`, { isRenderedSvg: true });
          }
          node.classList.add(`acordate-ann--${kind === 'leftHand' ? 'lh' : kind === 'rightHand' ? 'rh' : kind === 'chord' ? 'chord' : 'other'}`);
          if (kind === 'leftHand' || kind === 'rightHand') {
            node.classList.add('acordate-ann--fingering');
          }
        }

        if (isExplicitChord) {
          node.classList.add('acordate-ann--chord');
        }

        // Centra horizontalmente digitaciones y marcas de nota exactamente sobre la cabeza de nota padre
        const noteGroup = node.closest ? node.closest('.abcjs-note') : null;
        const noteInk = measureNoteInk(noteGroup);
        if (noteInk && (kind === 'leftHand' || kind === 'rightHand' || (kind === 'other' && side === 'down'))) {
          setTextCenterX(node, noteInk.headCx);
        }

        // Vuelve a medir tras aplicar tipografía final y centrado
        let bbox;
        try {
          bbox = node.getBBox();
        } catch {
          continue;
        }
        if (!bbox || bbox.width === 0 || bbox.height === 0) continue;

        const zoneKey = `${staffId}:${side}`;
        if (!byZone.has(zoneKey)) byZone.set(zoneKey, { staff, side, items: [] });
        byZone.get(zoneKey).items.push({
          node,
          kind,
          noteInk,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        });
      }

      // 3) Posiciona cada zona por bandas estrictas (digitaciones junto al pentagrama, acordes siempre arriba)
      for (const { staff, side, items } of byZone.values()) {
        if (items.length === 0) continue;

        if (side === 'up') {
          const staffTop = staff ? staff.top : Math.min(...items.map((it) => it.y + it.height));
          const fingerings = items.filter((it) => it.kind === 'leftHand' || it.kind === 'rightHand');
          const others = items.filter((it) => it.kind === 'other');
          const chords = items.filter((it) => it.kind === 'chord');

          // Banda 1: digitaciones alineadas sobre una línea base uniforme junto al pentagrama/nota
          // (evita zigzag entre plicas arriba/abajo, elevándose solo en líneas adicionales muy agudas)
          const clearance = isPiano ? 6.5 : 7.5;
          const staffInkTop = staff ? staff.inkTop : staffTop;
          const unifiedTopBaseline = Math.min(staffTop - clearance, Math.max(staffTop - 16, staffInkTop - 4.5));
          const lowerBand = [];
          for (const it of fingerings) {
            const noteTop = it.noteInk ? it.noteInk.inkTop : staffTop;
            const targetBottom = Math.min(unifiedTopBaseline, noteTop - 4.5);
            const targetY = targetBottom - it.height;
            shiftTextY(it.node, targetY - it.y);
            it.y = targetY;
            it.tier = it.kind === 'leftHand' ? 0 : 1;
            lowerBand.push(it);
          }

          for (const it of others) {
            const noteTop = it.noteInk ? it.noteInk.inkTop : staffTop;
            const targetBottom = Math.min(unifiedTopBaseline, noteTop - 5);
            const targetY = targetBottom - it.height;
            shiftTextY(it.node, targetY - it.y);
            it.y = targetY;
            it.tier = 2;
            lowerBand.push(it);
          }

          if (lowerBand.length > 1) {
            const resolvedLower = resolveRectCollisions(lowerBand, 'up', { padX: 2.5, gapY: 2.5 });
            for (const res of resolvedLower) {
              if (Math.abs(res.dy) >= 0.3) {
                shiftTextY(res.item.node, res.dy);
                res.item.y = res.y;
              }
            }
          }

          // Banda 2: acordes siempre en una fila uniforme estrictamente ENCIMA de todas las digitaciones
          if (chords.length > 0) {
            let chordBaselineBottom;
            if (lowerBand.length > 0) {
              // Usa el tope típico de la banda de digitaciones para una línea horizontal prolija de cifrados
              const sortedTops = lowerBand.map((it) => it.y).sort((a, b) => a - b);
              const refTop = sortedTops[Math.min(sortedTops.length - 1, Math.floor(sortedTops.length * 0.2))];
              chordBaselineBottom = Math.min(staffTop - 11, refTop - 5);
            } else {
              const staffInkTop = staff ? staff.inkTop : staffTop;
              chordBaselineBottom = Math.min(staffTop - 9, staffInkTop - 5);
            }

            for (const ch of chords) {
              const targetY = chordBaselineBottom - ch.height;
              shiftTextY(ch.node, targetY - ch.y);
              ch.y = targetY;
              ch.tier = 3;
            }

            // Resuelve cualquier choque remanente entre acordes y digitaciones sobresalientes (ej. líneas adicionales agudas)
            const allUp = [...lowerBand, ...chords];
            const resolvedAll = resolveRectCollisions(allUp, 'up', { padX: 3, gapY: 3.5 });
            for (const res of resolvedAll) {
              if (res.item.kind === 'chord' && Math.abs(res.dy) >= 0.3) {
                shiftTextY(res.item.node, res.dy);
                res.item.y = res.y;
              }
            }
          }
        } else {
          // Zona inferior (MI en clave de Fa de piano, funciones de bajo R/3/5/7, grados romanos)
          // Usa una línea base uniforme acotada para evitar zigzag por plicas hacia abajo
          const staffBottom = staff ? staff.bottom : Math.max(...items.map((it) => it.y));
          const clearance = isPiano ? 6.5 : 7.5;
          const staffInkBottom = staff ? staff.inkBottom : staffBottom;
          const unifiedBottomBaseline = Math.max(staffBottom + clearance, Math.min(staffBottom + 16, staffInkBottom + 4.5));
          for (const it of items) {
            const noteBottom = it.noteInk ? it.noteInk.inkBottom : staffBottom;
            const targetTop = Math.max(unifiedBottomBaseline, noteBottom + 4.5);
            shiftTextY(it.node, targetTop - it.y);
            it.y = targetTop;
            it.tier = it.kind === 'leftHand' || it.kind === 'rightHand' ? 0 : 1;
          }

          if (items.length > 1) {
            const resolvedDown = resolveRectCollisions(items, 'down', { padX: 2.5, gapY: 2.5 });
            for (const res of resolvedDown) {
              if (Math.abs(res.dy) >= 0.3) {
                shiftTextY(res.item.node, res.dy);
                res.item.y = res.y;
              }
            }
          }
        }
      }
    } catch {
      // Protección ante entornos sin layout SVG completo
    }
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
    const isPianoPiece = Boolean(meta.instrument === 'piano' || meta.isPiano);
    const isBassPiece = !isPianoPiece && Boolean(
      meta.instrument === 'bajo' || meta.isBass || (!meta.instrument && /clef\s*=\s*bass/i.test(rawAbc || ''))
    );
    const instrument = meta.instrument || (isPianoPiece ? 'piano' : isBassPiece ? 'bajo' : 'guitarra');

    if (visualObj && Array.isArray(visualObj.lines) && visualObj.lines.length > 0) {
      return this._extractFromVisualObj(visualObj, rawAbc, { beatsPerMeasure, beatUnit, isBassPiece, isPianoPiece, instrument });
    }

    return this._extractFromRawAbc(rawAbc, { beatsPerMeasure, beatUnit, isBassPiece, isPianoPiece, instrument });
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
    const { beatsPerMeasure, beatUnit, isBassPiece, isPianoPiece = false, instrument } = cfg;
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
    /** Ligaduras de prolongación (ties) abiertas por voz: vKey -> Map<key, { soundNote, diatonicPitch }>. */
    const voicePendingTies = new Map();
    /** Profundidad activa de ligadura de expresión (slur) por voz para articulación legato. */
    const voiceSlurDepth = new Map();
    /** Dinámica vigente por voz (pp..ff -> multiplicador de volumen). */
    const voiceDynamicGain = new Map();

    const DYNAMIC_MAP = {
      ppp: 0.36,
      pp: 0.5,
      p: 0.64,
      mp: 0.78,
      mf: 0.92,
      f: 1.08,
      ff: 1.22,
      fff: 1.32
    };

    for (const line of visualObj.lines) {
      if (!Array.isArray(line.staff)) continue;
      line.staff.forEach((staff, staffIdx) => {
        const clefType = staff.clef?.type || (isBassPiece ? 'bass' : isPianoPiece ? 'treble' : 'treble-8');
        const isStaffBass = clefType.startsWith('bass');
        const policyTarget = isPianoPiece
          ? 'piano'
          : (isStaffBass ? 'bajo' : clefType === 'treble-8' ? instrument : clefType);

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
          if (!voicePendingTies.has(vKey)) voicePendingTies.set(vKey, new Map());
          if (!voiceSlurDepth.has(vKey)) voiceSlurDepth.set(vKey, 0);
          if (!voiceDynamicGain.has(vKey)) voiceDynamicGain.set(vKey, 1.0);

          let currentBeat = voiceCursors.get(vKey);
          let measureIndex = voiceMeasures.get(vKey);
          let barAcc = voiceBarAcc.get(vKey);
          const pendingTies = voicePendingTies.get(vKey);
          let slurDepth = voiceSlurDepth.get(vKey);
          let dynamicGain = voiceDynamicGain.get(vKey);
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

            // Expresiones: dinámicas, acentos, staccato, tenuto, fermata y ligaduras de expresión (slurs)
            const decs = Array.isArray(elem.decoration) ? elem.decoration : [];
            for (const d of decs) {
              if (DYNAMIC_MAP[d] !== undefined) {
                dynamicGain = DYNAMIC_MAP[d];
              }
            }
            const accent = decs.includes('accent') || decs.includes('emphasis') || decs.includes('marcato') || decs.includes('sfz');
            const sfzBoost = decs.includes('sfz') ? 1.12 : 1.0;

            const pitchStartSlurs = Array.isArray(elem.pitches)
              ? elem.pitches.reduce((acc, p) => acc + (Array.isArray(p.startSlur) ? p.startSlur.length : 0), 0)
              : 0;
            const pitchEndSlurs = Array.isArray(elem.pitches)
              ? elem.pitches.reduce((acc, p) => acc + (Array.isArray(p.endSlur) ? p.endSlur.length : 0), 0)
              : 0;
            const startSlurCount = (Array.isArray(elem.startSlur) ? elem.startSlur.length : 0) + pitchStartSlurs;
            const endSlurCount = (Array.isArray(elem.endSlur) ? elem.endSlur.length : 0) + pitchEndSlurs;

            const wasInSlur = slurDepth > 0;
            if (startSlurCount > 0) slurDepth += startSlurCount;

            let articulation = 'normal';
            if (decs.includes('staccato') || decs.includes('wedge')) {
              articulation = 'staccato';
            } else if (wasInSlur) {
              articulation = 'legato';
            } else if (startSlurCount > 0) {
              articulation = 'legato-start';
            } else if (decs.includes('fermata')) {
              articulation = 'fermata';
            } else if (decs.includes('tenuto')) {
              articulation = 'tenuto';
            }

            if (endSlurCount > 0) {
              slurDepth = Math.max(0, slurDepth - endSlurCount);
            }

            // Notas de gracia (appoggiaturas / mordentes {g}a)
            const graceMidis = [];
            if (!isRest && Array.isArray(elem.gracenotes)) {
              for (const g of elem.gracenotes) {
                const gWritten = this._abcjsPitchToWrittenMidi(g, keyMap, barAcc);
                const gSounding = writtenMidiToSoundingMidi(gWritten, policyTarget, 'real');
                if (Number.isFinite(gSounding)) graceMidis.push(gSounding);
              }
            }

            // Altura escrita -> altura MIDI real usando PitchPolicy + resolución de ligaduras de prolongación (ties)
            const midis = [];
            const soundNotes = [];
            let isTiedContinuation = false;

            if (isRest) {
              // Un silencio cierra cualquier tie huérfana en esta voz
              pendingTies.clear();
            } else if (Array.isArray(elem.pitches)) {
              for (const p of elem.pitches) {
                const writtenMidi = this._abcjsPitchToWrittenMidi(p, keyMap, barAcc);
                let soundingMidi = writtenMidiToSoundingMidi(writtenMidi, policyTarget, 'real');
                if (!Number.isFinite(soundingMidi)) continue;

                if (p.endTie) {
                  // Busca tie activa exacta o por misma altura diatónica (mantiene alteración tras barra de compás)
                  let tieKey = pendingTies.has(soundingMidi) ? soundingMidi : null;
                  if (tieKey === null) {
                    for (const [k, rec] of pendingTies.entries()) {
                      if (rec.diatonicPitch === p.pitch) {
                        tieKey = k;
                        break;
                      }
                    }
                  }
                  if (tieKey !== null) {
                    const rec = pendingTies.get(tieKey);
                    soundingMidi = rec.soundNote.midi;
                    rec.soundNote.durationBeats += durBeats;
                    midis.push(soundingMidi);
                    isTiedContinuation = true;
                    if (!p.startTie) {
                      pendingTies.delete(tieKey);
                    }
                    continue;
                  }
                }

                midis.push(soundingMidi);
                const soundNote = { midi: soundingMidi, durationBeats: durBeats };
                soundNotes.push(soundNote);
                if (p.startTie) {
                  pendingTies.set(soundingMidi, { soundNote, diatonicPitch: p.pitch });
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
              soundNotes,
              graceMidis,
              articulation,
              accent,
              dynamicGain: Math.round(dynamicGain * sfzBoost * 100) / 100,
              isTiedContinuation: isTiedContinuation && soundNotes.length === 0,
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
          voiceSlurDepth.set(vKey, slurDepth);
          voiceDynamicGain.set(vKey, dynamicGain);
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
      isPianoPiece,
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
    const { beatsPerMeasure, beatUnit, isBassPiece, isPianoPiece = false, instrument } = cfg;
    const keyMatch = String(rawAbc || '').match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');
    const clefMatch = String(rawAbc || '').match(/clef\s*=\s*([a-z0-9+-]+)/i);
    const policyTarget = isPianoPiece
      ? 'piano'
      : (clefMatch ? (clefMatch[1].startsWith('bass') ? 'bajo' : clefMatch[1] === 'treble-8' ? instrument : clefMatch[1]) : instrument);

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
    /** Ligadura de prolongación abierta en el parser de respaldo (midi -> soundNote). */
    let activeTie = null;

    const tokenRegex = /"([^"]+)"|(\|)|(z|x)(\d*\/?\d*)|(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d*\/?\d*)(-)?/g;
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
        activeTie = null;
        const dur = unitBeats * this._parseAbcDurationFactor(match[4]);
        notes.push({ beat: currentBeat, durationBeats: dur, midis: [], soundNotes: [], isRest: true, measureIndex, svgElements: [] });
        currentBeat += dur;
      } else if (match[6]) {
        const pitchStr = `${match[5] || ''}${match[6]}${match[7] || ''}`;
        const writtenMidi = abcPitchToMidi(pitchStr, keyMap, barAcc);
        const soundingMidi = writtenMidi !== null ? writtenMidiToSoundingMidi(writtenMidi, policyTarget, 'real') : null;
        const dur = unitBeats * this._parseAbcDurationFactor(match[8]);
        const hasNextTie = Boolean(match[9]);

        if (activeTie && soundingMidi !== null && (activeTie.midi === soundingMidi || activeTie.letter === match[6])) {
          activeTie.soundNote.durationBeats += dur;
          notes.push({
            noteId: `raw-${notes.length}`,
            beat: currentBeat,
            durationBeats: dur,
            midis: [activeTie.midi],
            soundNotes: [],
            isTiedContinuation: true,
            isRest: false,
            measureIndex,
            isBassVoice: isBassPiece,
            svgElements: []
          });
          if (!hasNextTie) activeTie = null;
        } else {
          const soundNote = soundingMidi !== null ? { midi: soundingMidi, durationBeats: dur } : null;
          notes.push({
            noteId: `raw-${notes.length}`,
            beat: currentBeat,
            durationBeats: dur,
            midis: soundingMidi !== null ? [soundingMidi] : [],
            soundNotes: soundNote ? [soundNote] : [],
            isTiedContinuation: false,
            isRest: false,
            measureIndex,
            isBassVoice: isBassPiece,
            svgElements: []
          });
          activeTie = hasNextTie && soundNote ? { midi: soundingMidi, letter: match[6], soundNote } : null;
        }
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
      isBassPiece,
      isPianoPiece
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
   * Extrae únicamente los símbolos de acorde válidos (clasificados como `'chord'`) dentro de un compás ABC,
   * tokenizando siempre cadenas entre comillas de forma secuencial para jamás cruzar entre dos anotaciones
   * como `"^2③"C,2 "^4③"`.
   * @param {string} barText Fragmento ABC de un compás.
   * @returns {string[]} Lista de acordes reales en ese compás.
   */
  _extractChordsFromBar(barText) {
    const chords = [];
    const re = /"([^"]*)"/g;
    let m;
    while ((m = re.exec(barText)) !== null) {
      const inner = m[1].trim();
      if (inner && classifyAbcAnnotation(inner) === 'chord') {
        chords.push(inner);
      }
    }
    return chords;
  }

  /**
   * Inyecta anotaciones de función armónica ("_R", "_2", "_3", "_5", "_b7", "_Crom") debajo de las notas de bajo.
   * Solo se aplica cuando la partitura posee cifrado armónico explícito (no inventa acordes sobre
   * lecturas puras de cuerdas al aire ni obras barrocas sin cifrado).
   * @param {string} abcText Texto ABC con cifrado americano.
   * @returns {string} Texto ABC anotado.
   */
  _injectBassFunctionAnnotations(abcText) {
    const keyMatch = abcText.match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');

    const musicLines = abcText.split('\n');
    const barChordScan = musicLines
      .filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('%') && !/^[A-Za-z]:/.test(t);
      })
      .join(' ')
      .split(/\|/);

    const measureChords = [];
    let hasExplicitChords = false;
    for (const rawBar of barChordScan) {
      if (!rawBar.trim() || !/[A-Ga-gzZ"]/.test(rawBar)) continue;
      const barChords = this._extractChordsFromBar(rawBar);
      if (barChords.length > 0) hasExplicitChords = true;
      const lastBarChord = barChords.length > 0 ? barChords[barChords.length - 1] : null;
      const firstBarChord = barChords.length > 0 ? barChords[0] : null;
      measureChords.push({
        first: firstBarChord || measureChords[measureChords.length - 1]?.last || null,
        last: lastBarChord || measureChords[measureChords.length - 1]?.last || null
      });
    }

    if (!hasExplicitChords) {
      return abcText;
    }

    let currentBar = 0;
    let currentChord = measureChords[0]?.first || null;

    return musicLines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%') || /^[A-Za-z]:/.test(trimmed)) {
          return line;
        }
        const bars = line.split('|');
        const processedBars = bars.map((barText, idx) => {
          if (!barText.trim() || !/[A-Ga-gzZ"]/.test(barText)) return barText;

          const nextBarChord = measureChords[currentBar + 1]?.first || measureChords[0]?.first || null;
          const barAcc = {};

          // Cuenta solo notas reales (ignorando letras dentro de acordes "..." y decoraciones !...!)
          const cleanedForCount = barText
            .replace(/"[^"]*"/g, ' ')
            .replace(/![^!]*!/g, ' ')
            .replace(/\[[A-Za-z]:[^\]]*\]/g, ' ');
          const totalNotesInBar = [...cleanedForCount.matchAll(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g)].length;
          let noteIdx = 0;

          const annotated = barText.replace(/"([^"]*)"|!.*?!|\[[A-Za-z]:[^\]]*\]|(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/g, (token, quotedInner, acc, letter, oct) => {
            if (!letter) {
              if (quotedInner !== undefined) {
                const trimmedInner = quotedInner.trim();
                if (trimmedInner && classifyAbcAnnotation(trimmedInner) === 'chord') {
                  currentChord = trimmedInner;
                }
              }
              return token;
            }
            noteIdx += 1;
            if (!currentChord) return token;
            const midi = abcPitchToMidi(`${acc || ''}${letter}${oct || ''}`, keyMap, barAcc);
            if (midi === null) return token;
            const isLast = noteIdx === totalNotesInBar && totalNotesInBar >= 3;
            const fnLabel = analyzeBassFunction(midi, currentChord, nextBarChord, isLast);
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
