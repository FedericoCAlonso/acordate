import { formatChordSymbol } from '../core/i18n.js';
import { mod12, pcToNoteName } from '../core/MusicTheory.js';
import { isBlackKeyMidi } from '../services/PianoVoicingService.js';
import { el } from './uiHelpers.js';

/** Espacio de nombres XML estándar para crear nodos SVG. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Crea un nodo SVG con atributos.
 * @param {string} tag Etiqueta SVG.
 * @param {Record<string, string|number>} [attrs={}] Atributos.
 * @returns {SVGElement} Nodo SVG.
 */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Formatea una etiqueta musical (grado o nota) convirtiendo alteraciones # / b a ♯ / ♭
 * sin alterar palabras normales en español (como "Bajo").
 * @param {string} txt Texto crudo.
 * @returns {string} Texto formateado.
 */
function fmtAcc(txt) {
  return String(txt || '')
    .replace(/#/g, '♯')
    .replace(/^bb(?=\d)/, '𝄫')
    .replace(/^b(?=[235679]|1[13])/, '♭')
    .replace(/([A-G]|Do|Re|Mi|Fa|Sol|La|Si)b(?=$|\/)/g, '$1♭');
}

/**
 * Devuelve el par de colores Material 3 (relleno y texto) según la función armónica de un acorde.
 * Coincide exactamente con la leyenda de ChordDiagramView.js.
 * @param {string} fnLabel Etiqueta de función ('R', '3', 'b3', '5', '7', etc.).
 * @param {boolean} isRoot True si es raíz.
 * @returns {{ fill: string, textFill: string }} Tokens CSS.
 */
function getChordDotColors(fnLabel, isRoot) {
  if (isRoot || fnLabel === 'R') {
    return { fill: 'var(--md-sys-color-primary)', textFill: 'var(--md-sys-color-on-primary)' };
  }
  if (['3', 'b3', '2', '4'].includes(fnLabel)) {
    return { fill: 'var(--md-sys-color-tertiary)', textFill: 'var(--md-sys-color-on-tertiary)' };
  }
  if (['5', 'b5', '#5'].includes(fnLabel)) {
    return { fill: 'var(--md-sys-color-secondary)', textFill: 'var(--md-sys-color-on-secondary)' };
  }
  return { fill: 'var(--md-sys-color-on-surface)', textFill: 'var(--md-sys-color-surface)' };
}

/**
 * Calcula la geometría horizontal exacta (teclas blancas y negras) para cualquier rango MIDI [startMidi..endMidi].
 * @param {number} startMidi Nota MIDI inicial (idealmente tecla blanca).
 * @param {number} endMidi Nota MIDI final.
 * @param {number} whiteW Ancho de cada tecla blanca.
 * @returns {{ whites: Array<object>, blacks: Array<object>, totalWidth: number }} Geometría del teclado.
 */
function buildKeyboardGeometry(startMidi, endMidi, whiteW) {
  const whites = [];
  const blacks = [];
  const blackW = whiteW * 0.62;
  let whiteIndex = 0;

  // Asegura comenzar y terminar en tecla blanca para evitar teclas negras colgadas en los bordes
  const safeStart = isBlackKeyMidi(startMidi) ? startMidi - 1 : startMidi;
  const safeEnd = isBlackKeyMidi(endMidi) ? endMidi + 1 : endMidi;

  for (let midi = safeStart; midi <= safeEnd; midi++) {
    if (!isBlackKeyMidi(midi)) {
      whites.push({ midi, x: whiteIndex * whiteW, w: whiteW });
      whiteIndex += 1;
    } else {
      // Tecla negra centrada sobre el borde entre la tecla blanca anterior y la siguiente
      const x = whiteIndex * whiteW - blackW / 2;
      blacks.push({ midi, x, w: blackW });
    }
  }

  return { whites, blacks, totalWidth: Math.max(whiteW, whiteIndex * whiteW) };
}

/**
 * Crea un teclado SVG interactivo para visualizar y escuchar un voicing de Acorde de Piano
 * (fundamental, inversiones, Shell MI+MD, Rootless o Drop 2).
 * @param {object} pianoVoicing Objeto retornado por `PianoVoicingService.generatePianoVoicings`.
 * @param {object} [options={}] Opciones visuales e interactivas.
 * @param {'americano'|'latino'} [options.notation='americano'] Sistema de cifrado.
 * @param {'fingers'|'functions'|'notes'} [options.labelMode='fingers'] Texto dentro de cada marcador.
 * @param {'sm'|'md'|'lg'} [options.size='lg'] Tamaño visual.
 * @param {Function} [options.onPlay] Callback al tocar el teclado completo (reproduce el acorde).
 * @param {Function} [options.onNoteClick] Callback opcional al tocar una tecla puntual ({ midi }).
 * @returns {HTMLElement} Contenedor interactivo con el teclado SVG.
 */
export function createPianoChordElement(pianoVoicing, options = {}) {
  const notation = options.notation || 'americano';
  const labelMode = options.labelMode || 'fingers';
  const size = options.size || 'lg';
  const onPlay = typeof options.onPlay === 'function' ? options.onPlay : null;
  const onNoteClick = typeof options.onNoteClick === 'function' ? options.onNoteClick : null;

  const details = pianoVoicing.getDetailedNotes(notation);
  const detailByMidi = new Map(details.map((d) => [d.midi, d]));
  const midis = pianoVoicing.getMidiNotes();
  const minMidi = midis.length > 0 ? Math.min(...midis) : 48;
  const maxMidi = midis.length > 0 ? Math.max(...midis) : 72;

  // Calcula un rango compacto de 2 octavas (o lo justo para cubrir MI+MD) iniciando en C o F
  const startOctaveC = Math.floor(minMidi / 12) * 12;
  const startMidi = minMidi - startOctaveC >= 5 ? startOctaveC + 5 : startOctaveC;
  const minSpan = size === 'sm' ? 19 : 24;
  const rawEnd = Math.max(startMidi + minSpan, maxMidi + 2);
  const endMidi = Math.min(96, rawEnd);

  const whiteW = size === 'sm' ? 20 : size === 'md' ? 26 : 30;
  const whiteH = size === 'sm' ? 76 : size === 'md' ? 104 : 118;
  const blackH = Math.round(whiteH * 0.62);
  const padX = 4;
  const showHandBands = size !== 'sm' && ((pianoVoicing.lhMidis?.length > 0) || (pianoVoicing.rhMidis?.length > 0));
  const padTop = showHandBands ? 22 : 6;
  const padBottom = size === 'sm' ? 8 : 16;

  const { whites, blacks, totalWidth } = buildKeyboardGeometry(startMidi, endMidi, whiteW);
  const svgW = totalWidth + padX * 2;
  const svgH = padTop + whiteH + padBottom;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${svgW} ${svgH}`,
    class: `piano-chord-svg piano-chord-svg--${size}`,
    role: 'img',
    'aria-label': `Teclado de piano para ${formatChordSymbol(pianoVoicing.chord, notation)} (${pianoVoicing.label})`
  });

  // Indicadores superiores claros de mano (MI / MD) alineados con el rango real de teclas de cada mano
  if (showHandBands) {
    const keyCenterByMidi = new Map();
    for (const w of whites) keyCenterByMidi.set(w.midi, { left: padX + w.x, right: padX + w.x + w.w, cx: padX + w.x + w.w / 2 });
    for (const b of blacks) keyCenterByMidi.set(b.midi, { left: padX + b.x, right: padX + b.x + b.w, cx: padX + b.x + b.w / 2 });

    const drawHandSpan = (handMidis, label, colorVar) => {
      const spans = (handMidis || []).map((m) => keyCenterByMidi.get(m)).filter(Boolean);
      if (spans.length === 0) return;
      const x1 = Math.min(...spans.map((s) => s.left)) + 2;
      const x2 = Math.max(...spans.map((s) => s.right)) - 2;
      const cx = (x1 + x2) / 2;
      if (x2 - x1 >= 14) {
        svg.appendChild(
          svgEl('path', {
            d: `M ${x1.toFixed(1)} 17 L ${x1.toFixed(1)} 14 L ${x2.toFixed(1)} 14 L ${x2.toFixed(1)} 17`,
            fill: 'none',
            stroke: colorVar,
            'stroke-width': 1.4,
            'stroke-linecap': 'round'
          })
        );
      }
      const badge = svgEl('text', {
        x: cx.toFixed(1),
        y: 11,
        'text-anchor': 'middle',
        fill: colorVar,
        'font-size': 9.5,
        'font-weight': '700'
      });
      badge.textContent = label;
      svg.appendChild(badge);
    };

    drawHandSpan(pianoVoicing.lhMidis, 'MI', 'var(--md-sys-color-on-surface)');
    drawHandSpan(pianoVoicing.rhMidis, 'MD', 'var(--md-sys-color-tertiary)');
  }

  // Marco sutil superior (listón de fieltro rojo/oscuro de estudio)
  svg.appendChild(
    svgEl('rect', {
      x: padX,
      y: padTop - 3,
      width: totalWidth,
      height: 5,
      rx: 2,
      class: 'piano-kb__rail'
    })
  );

  const renderKey = (k, isBlack) => {
    const det = detailByMidi.get(k.midi);
    const x = padX + k.x;
    const y = padTop;
    const h = isBlack ? blackH : whiteH;
    const g = svgEl('g', {
      class: `piano-key ${isBlack ? 'piano-key--black' : 'piano-key--white'} ${det ? 'piano-key--active' : ''}`,
      'data-midi': k.midi
    });

    const rect = svgEl('rect', {
      x,
      y,
      width: k.w,
      height: h,
      rx: isBlack ? 3 : 4,
      class: 'piano-key__rect'
    });
    g.appendChild(rect);

    // Marca sutil de Do central (C4 = 60) y otros Do (C) en el pie de las teclas blancas
    if (!isBlack && mod12(k.midi) === 0 && size !== 'sm') {
      const oct = Math.floor(k.midi / 12) - 1;
      const cLbl = svgEl('text', {
        x: x + k.w / 2,
        y: y + h + 11,
        'text-anchor': 'middle',
        class: `piano-key__oct-label ${k.midi === 60 ? 'piano-key__oct-label--middle' : ''}`
      });
      cLbl.textContent = notation === 'latino' ? `Do${oct}` : `C${oct}`;
      g.appendChild(cLbl);
    }

    if (det) {
      const { fill, textFill } = getChordDotColors(det.label, det.isRoot);
      // Tinte sutil de la tecla presionada
      g.appendChild(
        svgEl('rect', {
          x: x + 1,
          y: y + 1,
          width: Math.max(2, k.w - 2),
          height: Math.max(2, h - 2),
          rx: isBlack ? 2.5 : 3.5,
          fill,
          opacity: isBlack ? '0.32' : '0.16',
          'pointer-events': 'none'
        })
      );

      const r = isBlack ? Math.min(k.w * 0.44, size === 'sm' ? 6.5 : 9.5) : Math.min(k.w * 0.38, size === 'sm' ? 7.5 : 11);
      const cy = isBlack ? y + h - r - 5 : y + h - r - 8;
      const cx = x + k.w / 2;

      g.appendChild(
        svgEl('circle', {
          cx,
          cy,
          r,
          fill,
          stroke: det.hand === 'lh' && pianoVoicing.rhMidis?.length > 0 ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-surface)',
          'stroke-width': det.hand === 'lh' && pianoVoicing.rhMidis?.length > 0 ? 1.8 : 1.4,
          'stroke-dasharray': det.hand === 'lh' && pianoVoicing.rhMidis?.length > 0 ? '2.5 1.5' : undefined,
          'pointer-events': 'none'
        })
      );

      let txt = '';
      if (labelMode === 'fingers') txt = det.finger ? String(det.finger) : fmtAcc(det.label);
      else if (labelMode === 'notes') txt = fmtAcc(det.name);
      else txt = fmtAcc(det.label);

      const fontSize = size === 'sm' ? (txt.length > 2 ? 6.5 : 8) : (txt.length > 2 ? 7.5 : isBlack ? 9.5 : 10.5);
      const labelNode = svgEl('text', {
        x: cx,
        y: cy + fontSize * 0.36,
        'text-anchor': 'middle',
        fill: textFill,
        'font-size': fontSize,
        'font-weight': '700',
        'pointer-events': 'none'
      });
      labelNode.textContent = txt;
      g.appendChild(labelNode);
    }

    if (onNoteClick) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onNoteClick({ midi: k.midi });
      });
    }
    svg.appendChild(g);
  };

  for (const w of whites) renderKey(w, false);
  for (const b of blacks) renderKey(b, true);

  const wrap = el(
    'div',
    {
      className: `piano-chord-card piano-chord-card--${size}`,
      role: onPlay ? 'button' : 'group',
      tabindex: onPlay ? '0' : undefined,
      title: onPlay ? `Escuchar ${formatChordSymbol(pianoVoicing.chord, notation)} (${pianoVoicing.label})` : undefined,
      onClick: onPlay ? () => onPlay(pianoVoicing) : undefined,
      onKeydown: onPlay
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPlay(pianoVoicing);
            }
          }
        : undefined
    },
    [svg]
  );

  return wrap;
}

/**
 * Componente visual interactivo de Teclado SVG de Piano para el módulo Escalas y Modos (#/escalas).
 * Comparte el mismo contrato de ciclo de vida que `ScaleFretboardView` (`render`, `highlightMidi`, `dispose`)
 * para iluminación sincronizada nota a nota y reproducción al tocar cualquier tecla.
 */
export class PianoKeyboardView {
  /**
   * Construye el renderizador del teclado SVG de escalas.
   * @param {object} [options={}] Opciones de interacción.
   * @param {Function} [options.onNoteClick] Callback al tocar una tecla ({ midi, name, degree, finger }).
   */
  constructor({ onNoteClick = null } = {}) {
    /** Callback invocado al tocar cualquier tecla del teclado. */
    this._onNoteClick = onNoteClick;
    /** Nodo SVG activo. */
    this._svg = null;
    /** Mapa midi -> `<g>` de tecla para resaltado instantáneo durante reproducción. */
    this._keysByMidi = new Map();
    /** Último MIDI resaltado. */
    this._highlightedMidi = null;
    /** Temporizador de destello breve al tocar manualmente una tecla. */
    this._clickFlashTimer = null;
  }

  /**
   * Renderiza el teclado SVG interactivo de 2 octavas para una escala/modo.
   * @param {HTMLElement} container Contenedor anfitrión.
   * @param {object} layout Layout retornado por `computePianoScaleLayout`.
   * @param {object} [opts={}] Opciones visuales (`labelMode`, `notation`, `showAvoidNotes`).
   * @returns {SVGSVGElement|null} SVG creado.
   */
  render(container, layout, opts = {}) {
    if (!container || !layout) return null;
    this.dispose();
    container.innerHTML = '';

    const labelMode = opts.labelMode || 'note';
    const notation = opts.notation || 'americano';
    const showAvoidNotes = opts.showAvoidNotes !== false;

    const { startMidi, endMidi, dots, root, scale } = layout;
    const dotByMidi = new Map((dots || []).map((d) => [d.midi, d]));

    const whiteW = 36;
    const whiteH = 136;
    const blackH = 84;
    const padX = 8;
    const showScaleHandBands = labelMode === 'finger';
    const padTop = showScaleHandBands ? 24 : 10;
    const padBottom = 20;

    const { whites, blacks, totalWidth } = buildKeyboardGeometry(startMidi, endMidi, whiteW);
    const svgW = totalWidth + padX * 2;
    const svgH = padTop + whiteH + padBottom;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${svgW} ${svgH}`,
      class: 'piano-scale-svg',
      role: 'img',
      'aria-label': `Teclado de piano para ${formatChordSymbol(root, notation)} ${scale.name}`
    });

    if (showScaleHandBands) {
      const keyRects = new Map();
      for (const w of whites) keyRects.set(w.midi, { left: padX + w.x, right: padX + w.x + w.w });
      for (const b of blacks) keyRects.set(b.midi, { left: padX + b.x, right: padX + b.x + b.w });
      const activeDots = (dots || []).filter((d) => d.inPosition && d.finger);
      const lhDots = activeDots.filter((d) => d.hand === 'lh');
      const rhDots = activeDots.filter((d) => d.hand !== 'lh');

      const drawScaleSpan = (list, label, colorVar) => {
        const boxes = list.map((d) => keyRects.get(d.midi)).filter(Boolean);
        if (boxes.length === 0) return;
        const x1 = Math.min(...boxes.map((b) => b.left)) + 3;
        const x2 = Math.max(...boxes.map((b) => b.right)) - 3;
        const cx = (x1 + x2) / 2;
        svg.appendChild(
          svgEl('path', {
            d: `M ${x1.toFixed(1)} 19 L ${x1.toFixed(1)} 15 L ${x2.toFixed(1)} 15 L ${x2.toFixed(1)} 19`,
            fill: 'none',
            stroke: colorVar,
            'stroke-width': 1.5,
            'stroke-linecap': 'round'
          })
        );
        const lbl = svgEl('text', {
          x: cx.toFixed(1),
          y: 12,
          'text-anchor': 'middle',
          fill: colorVar,
          'font-size': 10.5,
          'font-weight': '700'
        });
        lbl.textContent = label;
        svg.appendChild(lbl);
      };

      drawScaleSpan(lhDots, 'MI (5–1)', 'var(--md-sys-color-on-surface)');
      drawScaleSpan(rhDots, 'MD (1–5)', 'var(--md-sys-color-tertiary)');
    }

    svg.appendChild(
      svgEl('rect', {
        x: padX,
        y: padTop - 4,
        width: totalWidth,
        height: 6,
        rx: 2,
        class: 'piano-kb__rail'
      })
    );

    const drawKey = (k, isBlack) => {
      const dot = dotByMidi.get(k.midi) || null;
      const x = padX + k.x;
      const y = padTop;
      const h = isBlack ? blackH : whiteH;
      const inPos = dot ? dot.inPosition : false;

      const keyClasses = ['piano-key', isBlack ? 'piano-key--black' : 'piano-key--white'];
      if (dot) {
        keyClasses.push('piano-key--in-scale');
        if (!inPos) keyClasses.push('piano-key--dim');
        if (dot.isRoot) keyClasses.push('piano-key--root');
        else if (dot.isCharacteristic) keyClasses.push('piano-key--char');
        else if (dot.isAvoid && showAvoidNotes) keyClasses.push('piano-key--avoid');
        else if (dot.isChordTone) keyClasses.push('piano-key--chord');
      }

      const g = svgEl('g', {
        class: keyClasses.join(' '),
        'data-midi': k.midi,
        role: 'button',
        tabindex: '0',
        'aria-label': dot
          ? `${formatChordSymbol(dot.name, notation)} (grado ${dot.degree}${dot.finger ? `, dedo ${dot.finger}` : ''})`
          : formatChordSymbol(pcToNoteName(mod12(k.midi), false), notation)
      });

      g.appendChild(
        svgEl('rect', {
          x,
          y,
          width: k.w,
          height: h,
          rx: isBlack ? 3.5 : 5,
          class: 'piano-key__rect'
        })
      );

      // Etiqueta de octava en cada Do (C3, C4, C5...)
      if (!isBlack && mod12(k.midi) === 0) {
        const oct = Math.floor(k.midi / 12) - 1;
        const lbl = svgEl('text', {
          x: x + k.w / 2,
          y: y + h + 14,
          'text-anchor': 'middle',
          class: `piano-key__oct-label ${k.midi === 60 ? 'piano-key__oct-label--middle' : ''}`
        });
        lbl.textContent = notation === 'latino' ? `Do${oct}` : `C${oct}`;
        g.appendChild(lbl);
      }

      if (dot) {
        const dotKind = dot.isRoot
          ? 'root'
          : dot.isCharacteristic
            ? 'char'
            : dot.isAvoid && showAvoidNotes
              ? 'avoid'
              : dot.isChordTone
                ? 'chord'
                : 'scale';

        const r = isBlack ? 10 : 12.5;
        const cx = x + k.w / 2;
        const cy = isBlack ? y + h - r - 6 : y + h - r - 10;

        g.appendChild(
          svgEl('circle', {
            cx,
            cy,
            r,
            class: `piano-scale-dot piano-scale-dot--${dotKind}`
          })
        );

        let txt = '';
        if (labelMode === 'finger') {
          txt = dot.finger ? String(dot.finger) : fmtAcc(formatChordSymbol(dot.name, notation));
        } else if (labelMode === 'degree') {
          txt = fmtAcc(dot.degree);
        } else {
          txt = fmtAcc(formatChordSymbol(dot.name, notation));
        }

        const fontSize = txt.length > 2 ? 8 : isBlack ? 9.5 : 10.5;
        const textNode = svgEl('text', {
          x: cx,
          y: cy + fontSize * 0.36,
          'text-anchor': 'middle',
          'font-size': fontSize,
          class: `piano-scale-dot__text piano-scale-dot__text--${dotKind}`
        });
        textNode.textContent = txt;
        g.appendChild(textNode);
      }

      const trigger = () => {
        this._flashKey(k.midi);
        if (this._onNoteClick) {
          this._onNoteClick(
            dot || {
              midi: k.midi,
              name: pcToNoteName(mod12(k.midi), false),
              degree: '',
              finger: null
            }
          );
        }
      };

      g.addEventListener('click', trigger);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });

      this._keysByMidi.set(k.midi, g);
      svg.appendChild(g);
    };

    for (const w of whites) drawKey(w, false);
    for (const b of blacks) drawKey(b, true);

    container.appendChild(svg);
    this._svg = svg;
    return svg;
  }

  /** Resalta brevemente una tecla tocada por el usuario. */
  _flashKey(midi) {
    if (this._clickFlashTimer) clearTimeout(this._clickFlashTimer);
    this.highlightMidi(midi);
    this._clickFlashTimer = setTimeout(() => {
      this.highlightMidi(null);
      this._clickFlashTimer = null;
    }, 340);
  }

  /**
   * Ilumina en tiempo real la tecla correspondiente a la altura MIDI activa durante reproducción.
   * @param {number|null} midi Altura MIDI real o null para limpiar.
   */
  highlightMidi(midi) {
    if (this._highlightedMidi !== null) {
      const prev = this._keysByMidi.get(this._highlightedMidi);
      if (prev) prev.classList.remove('piano-key--playing');
    }
    this._highlightedMidi = midi;
    if (midi !== null && midi !== undefined) {
      const next = this._keysByMidi.get(midi);
      if (next) next.classList.add('piano-key--playing');
    }
  }

  /** Libera referencias DOM y temporizadores. */
  dispose() {
    if (this._clickFlashTimer) {
      clearTimeout(this._clickFlashTimer);
      this._clickFlashTimer = null;
    }
    this._keysByMidi.clear();
    this._highlightedMidi = null;
    this._svg = null;
  }
}
