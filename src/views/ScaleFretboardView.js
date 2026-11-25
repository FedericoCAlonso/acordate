import { formatChordSymbol } from '../core/i18n.js';

/** Espacio de nombres XML estándar para crear nodos SVG. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Trastes con marcadores visuales clásicos (un punto o doble punto en el 12). */
const INLAY_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19]);

/**
 * Crea un elemento SVG con atributos opcionales.
 * @param {string} tag Nombre de etiqueta SVG.
 * @param {Record<string, string|number>} [attrs={}] Atributos a asignar.
 * @returns {SVGElement} Nodo SVG creado.
 */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val !== undefined && val !== null) node.setAttribute(key, String(val));
  }
  return node;
}

/**
 * Formatea una etiqueta de grado (ej. "b3" -> "♭3", "#4" -> "♯4") para lectura nítida.
 * @param {string} degree Grado crudo.
 * @returns {string} Grado con alteraciones tipográficas.
 */
function formatDegreeLabel(degree) {
  return String(degree || '')
    .replace(/#/g, '♯')
    .replace(/b/g, '♭');
}

/**
 * Formatea el nombre de una nota suelta según la preferencia de notación (americano o latino).
 * @param {string} noteName Nombre americano de la nota (ej. "F#", "Bb").
 * @param {'americano'|'latino'} notation Sistema de cifrado activo.
 * @returns {string} Nombre formateado.
 */
function formatSingleNote(noteName, notation) {
  return formatChordSymbol(noteName, notation)
    .replace(/#/g, '♯')
    .replace(/b/g, '♭');
}

/**
 * Componente visual puro que dibuja un diapasón interactivo horizontal en SVG para escalas y modos
 * (soporta 4, 5 y 6 cuerdas; sin tablatura). Permite escuchar cada nota al tocarla e iluminar en vivo
 * el pulso MIDI activo durante la reproducción.
 */
export class ScaleFretboardView {
  /**
   * Construye el renderizador del diapasón SVG.
   * @param {object} [options={}] Opciones de interacción.
   * @param {Function} [options.onNoteClick] Callback al tocar/hacer clic en un punto del diapasón.
   */
  constructor({ onNoteClick = null } = {}) {
    /** Callback invocado con los datos del punto tocado ({ midi, stringIndex, fret, name, degree, finger }). */
    this._onNoteClick = onNoteClick;
    /** Elemento SVG renderizado actualmente. */
    this._svg = null;
    /** Índice rápido de MIDI -> elementos `<g>` de puntos del diapasón para iluminación en vivo. */
    this._dotsByMidi = new Map();
    /** Último MIDI resaltado durante reproducción. */
    this._highlightedMidi = null;
    /** Temporizador de destello breve al tocar un punto del diapasón. */
    this._clickFlashTimer = null;
  }

  /**
   * Renderiza el diapasón SVG dentro del contenedor indicado.
   * @param {HTMLElement} container Elemento anfitrión donde insertar el SVG.
   * @param {object} layout Resultado de `ScaleCatalogService.computeFretboardLayout`.
   * @param {object} [opts={}] Opciones visuales.
   * @param {'note'|'degree'|'finger'} [opts.labelMode='note'] Qué texto mostrar dentro de cada punto.
   * @param {'americano'|'latino'} [opts.notation='americano'] Sistema de cifrado.
   * @param {boolean} [opts.showAvoidNotes=true] Si true, marca con borde punteado las notas a evitar.
   * @param {boolean} [opts.leftHanded=false] Invierte horizontalmente el mango para personas zurdas.
   * @returns {SVGSVGElement} Nodo SVG montado.
   */
  render(container, layout, opts = {}) {
    if (!container || !layout) return null;
    this.dispose();
    container.innerHTML = '';

    const labelMode = opts.labelMode || 'note';
    const notation = opts.notation || 'americano';
    const showAvoidNotes = opts.showAvoidNotes !== false;
    const leftHanded = Boolean(opts.leftHanded);

    const { tuning, maxFret, dots, activePosition, system, root, scale } = layout;
    const stringCount = tuning.stringCount;
    const fretCount = Math.max(12, Number(maxFret) || 15);

    // Dimensiones lógicas del viewBox SVG con márgenes invertibles para modo diestro y zurdo
    const nutMargin = 72;
    const endMargin = 24;
    const leftMargin = leftHanded ? endMargin : nutMargin;
    const rightMargin = leftHanded ? nutMargin : endMargin;
    const topMargin = 28;
    const bottomMargin = 30;
    const fretW = 54;
    const stringGap = stringCount <= 4 ? 34 : stringCount === 5 ? 30 : 27;

    const neckW = fretCount * fretW;
    const neckH = (stringCount - 1) * stringGap;
    const viewW = leftMargin + neckW + rightMargin;
    const viewH = topMargin + neckH + bottomMargin;

    /** Convierte un número de traste (0..fretCount) a su coordenada X del centro de casilla. */
    const fretCenterX = (fret) => {
      if (fret === 0) {
        return leftHanded ? leftMargin + neckW + 22 : leftMargin - 22;
      }
      const visualFret = leftHanded ? fretCount - fret + 1 : fret;
      return leftMargin + (visualFret - 0.5) * fretW;
    };

    /** Convierte un número de barra de traste (0..fretCount) a su coordenada X. */
    const fretLineX = (fret) => {
      const visualPos = leftHanded ? fretCount - fret : fret;
      return leftMargin + visualPos * fretW;
    };

    /** Convierte índice de cuerda (0 = más grave) a coordenada Y (cuerda aguda arriba). */
    const stringY = (sIdx) => topMargin + (stringCount - 1 - sIdx) * stringGap;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${viewW} ${viewH}`,
      class: 'scale-fretboard-svg',
      role: 'img',
      'aria-label': `Diapasón de ${formatSingleNote(root, notation)} ${scale.name} (${system.label})`
    });

    // Fondo del diapasón
    svg.appendChild(
      svgEl('rect', {
        x: leftMargin,
        y: topMargin - 8,
        width: neckW,
        height: neckH + 16,
        rx: 6,
        class: 'scale-fretboard__wood'
      })
    );

    // Zona(s) sombreadas de la posición/caja activa (en trayectorias diagonales sombrea sub-posiciones reales en vez de un bloque gigante)
    if (system.id !== 'completo' && activePosition) {
      const zones = Array.isArray(activePosition.subZones) && activePosition.subZones.length > 0
        ? activePosition.subZones
        : activePosition.isDiagonal
          ? []
          : [{ minFret: activePosition.minFret || 1, maxFret: activePosition.maxFret || (activePosition.minFret || 1) + 3 }];
      for (const z of zones) {
        const boxMin = Math.max(1, z.minFret || 1);
        const boxMax = Math.max(boxMin, Math.min(fretCount, z.maxFret || boxMin + 3));
        const xStart = Math.min(fretLineX(boxMin - 1), fretLineX(boxMax));
        const xEnd = Math.max(fretLineX(boxMin - 1), fretLineX(boxMax));
        svg.appendChild(
          svgEl('rect', {
            x: xStart,
            y: topMargin - 8,
            width: Math.max(fretW, xEnd - xStart),
            height: neckH + 16,
            rx: 4,
            class: 'scale-fretboard__zone'
          })
        );
      }
    }

    // Incrustaciones (puntos guía de trastes 3, 5, 7, 9, 12, 15)
    for (let f = 1; f <= fretCount; f++) {
      if (!INLAY_FRETS.has(f)) continue;
      const cx = fretCenterX(f);
      if (f === 12) {
        svg.appendChild(svgEl('circle', { cx, cy: topMargin + neckH * 0.28, r: 4.2, class: 'scale-fretboard__inlay' }));
        svg.appendChild(svgEl('circle', { cx, cy: topMargin + neckH * 0.72, r: 4.2, class: 'scale-fretboard__inlay' }));
      } else {
        svg.appendChild(svgEl('circle', { cx, cy: topMargin + neckH * 0.5, r: 4.5, class: 'scale-fretboard__inlay' }));
      }
    }

    // Barras de trastes y cejuela (nut)
    for (let f = 0; f <= fretCount; f++) {
      const x = fretLineX(f);
      const isNut = f === 0;
      svg.appendChild(
        svgEl('line', {
          x1: x,
          y1: topMargin - 8,
          x2: x,
          y2: topMargin + neckH + 8,
          class: isNut ? 'scale-fretboard__nut' : 'scale-fretboard__fret'
        })
      );
    }

    // Números de traste debajo del diapasón
    for (let f = 1; f <= fretCount; f++) {
      const txt = svgEl('text', {
        x: fretCenterX(f),
        y: topMargin + neckH + 23,
        'text-anchor': 'middle',
        class: INLAY_FRETS.has(f) ? 'scale-fretboard__fretnum scale-fretboard__fretnum--accent' : 'scale-fretboard__fretnum'
      });
      txt.textContent = String(f);
      svg.appendChild(txt);
    }

    // Líneas de cuerdas (cuerda 0 más grave = mayor grosor; cuerda superior más aguda = más fina) y nombres al aire
    for (let sIdx = 0; sIdx < stringCount; sIdx++) {
      const y = stringY(sIdx);
      const strokeWidth = (1.1 + (stringCount - 1 - sIdx) * 0.28).toFixed(2);
      svg.appendChild(
        svgEl('line', {
          x1: leftMargin,
          y1: y,
          x2: leftMargin + neckW,
          y2: y,
          'stroke-width': strokeWidth,
          class: 'scale-fretboard__string'
        })
      );

      // Nombre de la cuerda al aire (separado 30px de la casilla 0, seguro para notación latina y modo zurdo)
      const openLabel = tuning.stringLabels?.[sIdx] || (tuning.noteNames?.[sIdx] || '').replace(/\d+$/, '');
      const labelX = leftHanded ? leftMargin + neckW + 54 : leftMargin - 54;
      const sTxt = svgEl('text', {
        x: labelX,
        y: y + 4,
        'text-anchor': 'middle',
        class: 'scale-fretboard__stringlabel'
      });
      sTxt.textContent = formatSingleNote(openLabel, notation);
      svg.appendChild(sTxt);
    }

    // Dibuja primero los puntos de contexto fuera de posición y luego los activos encima
    const orderedDots = [...dots].sort((a, b) => Number(a.inPosition) - Number(b.inPosition));

    for (const dot of orderedDots) {
      const cx = fretCenterX(dot.fret);
      const cy = stringY(dot.stringIndex);

      const classes = ['scale-dot'];
      if (!dot.inPosition) {
        classes.push('scale-dot--dim');
      } else if (dot.isRoot) {
        classes.push('scale-dot--root');
      } else if (dot.isCharacteristic) {
        classes.push('scale-dot--characteristic');
      } else if (dot.isAvoid && showAvoidNotes) {
        classes.push('scale-dot--avoid');
      } else if (dot.isChordTone) {
        classes.push('scale-dot--chordtone');
      } else {
        classes.push('scale-dot--scale');
      }

      const displayNote = formatSingleNote(dot.name, notation);
      const displayDeg = formatDegreeLabel(dot.degree);
      const displayText =
        labelMode === 'degree'
          ? displayDeg
          : labelMode === 'finger'
            ? dot.finger !== null && dot.finger !== undefined
              ? (dot.finger === 0 ? '0' : String(dot.finger))
              : displayDeg
            : displayNote;

      const humanStringNum = stringCount - dot.stringIndex;
      const roleHint = dot.isRoot
        ? 'raíz'
        : dot.isCharacteristic
          ? 'nota característica'
          : dot.isAvoid
            ? 'nota de paso/evitar'
            : dot.isChordTone
              ? 'nota del acorde'
              : 'nota de escala';

      const g = svgEl('g', {
        class: classes.join(' '),
        tabindex: dot.inPosition ? '0' : '-1',
        role: 'button',
        'data-midi': String(dot.midi),
        'data-in-pos': dot.inPosition ? '1' : '0',
        'aria-label': `Cuerda ${humanStringNum}, traste ${dot.fret}, ${displayNote} (grado ${displayDeg}, ${roleHint})`
      });

      const radius = dot.inPosition ? (dot.isRoot ? 11.8 : 10.6) : 7.5;
      g.appendChild(svgEl('circle', { cx, cy, r: radius, class: 'scale-dot__circle' }));

      if (dot.inPosition) {
        const txt = svgEl('text', {
          x: cx,
          y: cy + 3.8,
          'text-anchor': 'middle',
          class: displayText.length > 2 ? 'scale-dot__text scale-dot__text--sm' : 'scale-dot__text'
        });
        txt.textContent = displayText;
        g.appendChild(txt);
      }

      const triggerPlay = () => {
        this.highlightMidi(dot.midi);
        if (this._clickFlashTimer) clearTimeout(this._clickFlashTimer);
        this._clickFlashTimer = setTimeout(() => {
          this._clickFlashTimer = null;
          if (this._highlightedMidi === dot.midi) this.highlightMidi(null);
        }, 420);
        if (typeof this._onNoteClick === 'function') {
          this._onNoteClick(dot);
        }
      };

      g.addEventListener('click', triggerPlay);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerPlay();
        }
      });

      if (!this._dotsByMidi.has(dot.midi)) this._dotsByMidi.set(dot.midi, []);
      this._dotsByMidi.get(dot.midi).push(g);
      svg.appendChild(g);
    }

    this._svg = svg;
    container.appendChild(svg);

    // En móvil/pantallas angostas, centra automáticamente el scroll horizontal sobre la posición/caja activa
    if (system.id !== 'completo' && activePosition && typeof requestAnimationFrame !== 'undefined') {
      const boxMin = Math.max(0, activePosition.minFret ?? 0);
      const boxMax = Math.min(fretCount, activePosition.maxFret ?? boxMin + 4);
      const targetCenterRatio = ((fretCenterX(boxMin) + fretCenterX(boxMax)) / 2) / viewW;
      requestAnimationFrame(() => {
        const scroller = container.closest?.('.scale-fretboard-wrap') || container;
        if (scroller && scroller.scrollWidth > scroller.clientWidth + 8) {
          const targetScroll = Math.max(0, Math.round(targetCenterRatio * scroller.scrollWidth - scroller.clientWidth / 2));
          scroller.scrollLeft = targetScroll;
        }
      });
    }

    return svg;
  }

  /**
   * Resalta en tiempo real el/los punto(s) correspondientes a la altura MIDI que está sonando
   * (priorizando los puntos que pertenecen a la posición/caja activa).
   * @param {number|null} midi Altura MIDI real sonando o null para limpiar el resaltado.
   */
  highlightMidi(midi) {
    if (this._highlightedMidi !== null) {
      const prevNodes = this._dotsByMidi.get(this._highlightedMidi) || [];
      for (const n of prevNodes) n.classList.remove('scale-dot--playing');
    }
    this._highlightedMidi = midi;
    if (midi === null || midi === undefined) return;

    const candidates = this._dotsByMidi.get(midi) || [];
    const inPos = candidates.filter((n) => n.getAttribute('data-in-pos') === '1');
    const targets = inPos.length > 0 ? inPos : candidates;
    for (const n of targets) n.classList.add('scale-dot--playing');
  }

  /**
   * Cancela temporizadores de resaltado y limpia referencias del diapasón SVG.
   */
  dispose() {
    if (this._clickFlashTimer) {
      clearTimeout(this._clickFlashTimer);
      this._clickFlashTimer = null;
    }
    this._dotsByMidi.clear();
    this._highlightedMidi = null;
    this._svg = null;
  }
}
