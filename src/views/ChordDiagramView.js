import { formatChordSymbol, splitChordTypography } from '../core/i18n.js';
import { mod12, pcToNoteName } from '../core/MusicTheory.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';
import { VoicingGenerator } from '../services/VoicingGenerator.js';
import { el } from './uiHelpers.js';

/**
 * Determina el par de colores Material 3 (relleno y texto) según la función armónica de la nota
 * (Raíz, 3ª, 5ª o 7ª/extensión) para mantener consistencia con la leyenda de colores.
 * @param {string} fnLabel Etiqueta de función armónica ('R', '3', 'b3', '5', '7', 'b7', etc.).
 * @param {boolean} isRoot True si la nota es la raíz.
 * @returns {{ fill: string, textFill: string }} Tokens CSS de color.
 */
function getFunctionDotColors(fnLabel, isRoot) {
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
 * Construye un nodo DOM tipográfico para un símbolo de acorde manteniendo 'm' normal ("Em", "Am")
 * y aplicando superíndice solo a extensiones (7, maj7, 9, 13, ♭5…).
 * @param {string} chordSymbol Símbolo americano.
 * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
 * @returns {HTMLElement} Elemento span con tipografía armónica limpia.
 */
export function createChordSymbolElement(chordSymbol, notation = 'americano') {
  const { base, ext, bass } = splitChordTypography(chordSymbol, notation);
  const children = [base];
  if (ext) children.push(el('sup', { className: 'chord-ext-sup' }, [ext]));
  if (bass) children.push(`/${bass}`);
  return el('span', { className: 'chord-symbol' }, children);
}

/**
 * Crea la leyenda visual de colores de los puntos del diagrama (Raíz, 3.ª, 5.ª, 7.ª / tensión).
 * @returns {HTMLElement} Fila de leyenda accesible.
 */
export function createChordColorLegendElement() {
  const items = [
    { label: 'Raíz (R)', color: 'var(--md-sys-color-primary)' },
    { label: '3.ª (3 / ♭3)', color: 'var(--md-sys-color-tertiary)' },
    { label: '5.ª (5)', color: 'var(--md-sys-color-secondary)' },
    { label: '7.ª / tensión', color: 'var(--md-sys-color-on-surface)' }
  ];
  return el(
    'div',
    { className: 'chord-legend', role: 'note', 'aria-label': 'Leyenda de colores de los puntos' },
    items.map((it) =>
      el('span', { className: 'chord-legend__item' }, [
        el('span', { className: 'chord-legend__dot', style: `background:${it.color}`, 'aria-hidden': 'true' }),
        it.label
      ])
    )
  );
}

/**
 * Crea un diagrama SVG vectorial accesible y escalable para un Voicing de guitarra (6 cuerdas) o bajo (4/5 cuerdas).
 * Soporta mano derecha/izquierda, cejillas, traste inicial, raíz resaltada, etiquetas dentro de los puntos
 * (dedos 1-4, funciones R-3-5-7 o nombres de nota) y reproducción al tocar.
 * @param {Voicing} voicing Instancia del voicing a dibujar.
 * @param {object} [options={}] Opciones de visualización e interacción.
 * @param {Tuning} [options.tuning] Afinación activa.
 * @param {'americano'|'latino'} [options.notation='americano'] Sistema de cifrado.
 * @param {'fingers'|'functions'|'notes'} [options.labelMode='fingers'] Texto dentro de cada punto pisado.
 * @param {boolean} [options.leftHanded=false] Invierte el orden horizontal de cuerdas para zurdos.
 * @param {'sm'|'md'|'lg'} [options.size='md'] Tamaño visual del diagrama.
 * @param {boolean} [options.showTitle=true] Muestra el nombre del acorde encima.
 * @param {Function} [options.onPlay] Callback al tocar/hacer clic sobre el diagrama.
 * @returns {HTMLElement} Contenedor interactivo con el diagrama SVG accesible.
 */
export function createChordDiagramElement(voicing, options = {}) {
  const v = voicing instanceof Voicing ? voicing : new Voicing(voicing);
  const tuning = options.tuning instanceof Tuning ? options.tuning : Tuning.defaultForInstrument(v.instrument);
  const notation = options.notation || 'americano';
  const labelMode = options.labelMode || 'fingers';
  const leftHanded = Boolean(options.leftHanded);
  const size = options.size || 'md';
  const showTitle = options.showTitle !== false;

  const chordObj = Chord.parse(v.chord);
  const stringCount = Math.min(v.frets.length, tuning.stringCount);
  const fretRows = 5;
  const baseFret = Math.max(1, v.baseFret || 1);
  const detailsByString = new Map(v.getDetailedNotes(tuning, notation).map((d) => [d.stringIndex, d]));

  // Geometría SVG normalizada (escala limpiamente a cualquier ancho)
  const padLeft = 28;
  const padRight = 18;
  const padTop = 28;
  const padBottom = 18;
  const stringSpacing = stringCount === 4 ? 28 : 22;
  const fretSpacing = 26;
  const gridWidth = (stringCount - 1) * stringSpacing;
  const gridHeight = fretRows * fretSpacing;
  const svgW = padLeft + gridWidth + padRight;
  const svgH = padTop + gridHeight + padBottom;

  const xForString = (sIdx) => {
    const visualIdx = leftHanded ? stringCount - 1 - sIdx : sIdx;
    return padLeft + visualIdx * stringSpacing;
  };

  const parts = [];

  // Cejuela superior gruesa cuando baseFret === 1, o etiqueta "5ª" cuando baseFret > 1
  if (baseFret === 1) {
    parts.push(`<rect x="${padLeft - 1}" y="${padTop - 3}" width="${gridWidth + 2}" height="5" rx="2" fill="var(--md-sys-color-on-surface)"/>`);
  } else {
    parts.push(
      `<text x="${padLeft - 8}" y="${padTop + fretSpacing * 0.65}" text-anchor="end" font-size="11" font-weight="700" fill="var(--md-sys-color-on-surface-variant)">${baseFret}ª</text>`
    );
  }

  // Líneas horizontales de trastes
  for (let r = 0; r <= fretRows; r++) {
    const y = padTop + r * fretSpacing;
    parts.push(`<line x1="${padLeft}" y1="${y}" x2="${padLeft + gridWidth}" y2="${y}" stroke="var(--md-sys-color-outline)" stroke-width="${r === 0 ? 1.8 : 1}"/>`);
  }

  // Líneas verticales de cuerdas
  for (let s = 0; s < stringCount; s++) {
    const x = xForString(s);
    const strokeW = 1 + (stringCount - 1 - s) * 0.16;
    parts.push(`<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + gridHeight}" stroke="var(--md-sys-color-on-surface-variant)" stroke-width="${strokeW.toFixed(2)}"/>`);
  }

  // Cejillas (barres) dibujadas como barra continua redondeada
  for (const barre of v.barres || []) {
    const relRow = barre.fret - baseFret + 1;
    if (relRow < 1 || relRow > fretRows) continue;
    const x1 = xForString(barre.fromString);
    const x2 = xForString(barre.toString);
    const leftX = Math.min(x1, x2) - 8;
    const rightX = Math.max(x1, x2) + 8;
    const cy = padTop + (relRow - 0.5) * fretSpacing;
    parts.push(`<rect x="${leftX}" y="${cy - 8}" width="${rightX - leftX}" height="16" rx="8" fill="var(--md-sys-color-secondary)"/>`);
  }

  // Indicadores ×, ○ y puntos pisados en cada cuerda
  for (let s = 0; s < stringCount; s++) {
    const fret = v.frets[s];
    const x = xForString(s);
    const det = detailsByString.get(s);
    const isRoot = det ? mod12(det.midi) === chordObj.rootPc : false;

    if (fret === null) {
      parts.push(`<text x="${x}" y="${padTop - 10}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--md-sys-color-on-surface-variant)">×</text>`);
      continue;
    }

    if (fret === 0) {
      const strokeColor = isRoot ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface)';
      parts.push(`<circle cx="${x}" cy="${padTop - 13}" r="5.5" fill="none" stroke="${strokeColor}" stroke-width="${isRoot ? 2.4 : 1.7}"/>`);
      if (labelMode !== 'fingers' && det) {
        const lbl = labelMode === 'functions' ? det.fnLabel : det.noteName;
        parts.push(`<text x="${x}" y="${padTop + gridHeight + 13}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${isRoot ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)'}">${lbl}</text>`);
      }
      continue;
    }

    const relRow = fret - baseFret + 1;
    if (relRow < 1 || relRow > fretRows) continue;
    const cy = padTop + (relRow - 0.5) * fretSpacing;
    const { fill, textFill } = getFunctionDotColors(det?.fnLabel || '', isRoot);

    let dotLabel = '';
    if (labelMode === 'fingers') dotLabel = v.fingers[s] ? String(v.fingers[s]) : '';
    else if (labelMode === 'functions') dotLabel = det?.fnLabel || '';
    else dotLabel = det?.noteName || '';

    parts.push(`<circle cx="${x}" cy="${cy}" r="9" fill="${fill}"/>`);
    if (dotLabel) {
      const fSize = dotLabel.length > 2 ? 7.5 : 9.5;
      parts.push(`<text x="${x}" y="${cy + 3.2}" text-anchor="middle" font-size="${fSize}" font-weight="700" fill="${textFill}">${dotLabel}</text>`);
    }
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', v.toAccessibleDescription(tuning, notation));
  svg.classList.add('chord-diagram-svg', `chord-diagram-svg--${size}`);
  svg.innerHTML = parts.join('');

  const header = showTitle
    ? el('div', { className: 'chord-diagram__title' }, [
        el('strong', {}, [createChordSymbolElement(v.chord, notation)]),
        v.suggested ? el('span', { className: 'm3-badge' }, ['Sugerido']) : null
      ])
    : null;

  const containerTag = typeof options.onPlay === 'function' ? 'button' : 'div';
  return el(
    containerTag,
    {
      type: containerTag === 'button' ? 'button' : undefined,
      className: `chord-diagram-box chord-diagram-box--${size}`,
      ripple: containerTag === 'button',
      title: typeof options.onPlay === 'function' ? 'Tocá para escuchar este acorde' : undefined,
      onClick: typeof options.onPlay === 'function' ? () => options.onPlay(v) : undefined
    },
    [header, svg]
  );
}

/**
 * Dibuja un mapa horizontal del diapasón para Bajo (4 o 5 cuerdas) resaltando en colores
 * raíz (R), tercera (3/b3), quinta (5) y séptima (7/b7) del acorde elegido.
 * @param {string} chordSymbol Símbolo americano del acorde.
 * @param {object} [options={}] Opciones de afinación, rango de trastes y cifrado.
 * @returns {HTMLElement} Componente DOM con el mapa SVG accesible.
 */
export function createBassFretboardMapElement(chordSymbol, options = {}) {
  const tuning = options.tuning instanceof Tuning ? options.tuning : Tuning.defaultForInstrument('bass');
  const notation = options.notation || 'americano';
  const fretStart = options.fretStart ?? 0;
  const fretEnd = options.fretEnd ?? 9;
  const labelMode = options.labelMode || 'functions';

  const gen = new VoicingGenerator();
  const points = gen.getBassFretboardMap(chordSymbol, tuning, fretStart, fretEnd, notation);
  const chordObj = Chord.parse(chordSymbol);

  const fretCount = fretEnd - fretStart + 1;
  const fretW = 42;
  const strH = 26;
  const padL = 34;
  const padT = 22;
  const svgW = padL + fretCount * fretW + 14;
  const svgH = padT + (tuning.stringCount - 1) * strH + 26;

  const parts = [];
  // Líneas verticales de trastes y números
  for (let i = 0; i <= fretCount; i++) {
    const x = padL + i * fretW;
    const fretNum = fretStart + i;
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + (tuning.stringCount - 1) * strH}" stroke="var(--md-sys-color-outline)" stroke-width="${fretNum === 0 ? 3 : 1}"/>`);
    if (i < fretCount) {
      parts.push(`<text x="${x + fretW * 0.5}" y="${padT - 8}" text-anchor="middle" font-size="10" fill="var(--md-sys-color-on-surface-variant)">${fretNum}</text>`);
    }
  }

  // Líneas horizontales de cuerdas (aguda arriba, grave abajo como vista natural del bajista)
  for (let s = 0; s < tuning.stringCount; s++) {
    const visualRow = tuning.stringCount - 1 - s;
    const y = padT + visualRow * strH;
    const openName = formatChordSymbol(pcToNoteName(mod12(tuning.strings[s]), false), notation);
    parts.push(`<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="var(--md-sys-color-on-surface-variant)">${openName}</text>`);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${padL + fretCount * fretW}" y2="${y}" stroke="var(--md-sys-color-on-surface-variant)" stroke-width="${1.2 + (tuning.stringCount - 1 - s) * 0.25}"/>`);
  }

  // Puntos coloreados por función (Raíz = primary, Guías 3/7 = tertiary, 5ª/otras = secondary)
  for (const pt of points) {
    const visualRow = tuning.stringCount - 1 - pt.stringIndex;
    const cx = padL + (pt.fret - fretStart + 0.5) * fretW;
    const cy = padT + visualRow * strH;
    const fill = pt.isRoot
      ? 'var(--md-sys-color-primary)'
      : pt.isGuide
        ? 'var(--md-sys-color-tertiary)'
        : 'var(--md-sys-color-secondary)';
    const textFill = pt.isRoot
      ? 'var(--md-sys-color-on-primary)'
      : pt.isGuide
        ? 'var(--md-sys-color-on-tertiary)'
        : 'var(--md-sys-color-on-secondary)';
    const text = labelMode === 'notes' ? pt.noteName : pt.fnLabel;

    parts.push(`<circle cx="${cx}" cy="${cy}" r="10.5" fill="${fill}"/>`);
    parts.push(`<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="${text.length > 2 ? 8 : 10}" font-weight="700" fill="${textFill}">${text}</text>`);
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Mapa de notas de ${chordObj.getSymbol(notation)} sobre el diapasón del bajo`);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.innerHTML = parts.join('');

  return el('div', { className: 'bass-fretboard-card' }, [
    el('div', { className: 'player-toolbar', style: 'margin-bottom:8px' }, [
      el('strong', {}, [`Diapasón de bajo — ${chordObj.getSymbol(notation)}`]),
      el('div', { className: 'm3-chip-row' }, [
        el('span', { className: 'm3-badge m3-badge--primary' }, ['R = Raíz']),
        el('span', { className: 'm3-badge m3-badge--tertiary' }, ['3 / 7 = Notas guía']),
        el('span', { className: 'm3-badge' }, ['5 = Quinta'])
      ])
    ]),
    el('div', { style: 'overflow-x:auto' }, [svg])
  ]);
}

/**
 * Crea un editor visual interactivo de 6×5 (o 4×5) para que el usuario cree su propio voicing
 * tocando directamente los trastes, cuerdas al aire o silenciadas.
 * @param {Voicing} initialVoicing Estado inicial del voicing.
 * @param {Tuning} tuning Afinación activa.
 * @param {Function} onChange Callback invocado con el nuevo Voicing ante cada toque.
 * @returns {HTMLElement} Contenedor interactivo del constructor de voicings.
 */
export function createInteractiveVoicingPicker(initialVoicing, tuning, onChange) {
  let state = {
    frets: [...initialVoicing.frets],
    fingers: [...initialVoicing.fingers],
    baseFret: Math.max(1, initialVoicing.baseFret || 1)
  };
  const stringCount = tuning.stringCount;
  while (state.frets.length < stringCount) state.frets.push(null);
  while (state.fingers.length < stringCount) state.fingers.push(null);

  const host = el('div', { className: 'voicing-picker' });

  const emitChange = () => {
    const next = new Voicing({
      ...initialVoicing.toJSON(),
      frets: state.frets.slice(0, stringCount),
      fingers: state.fingers.slice(0, stringCount),
      baseFret: state.baseFret,
      barres: []
    });
    next.inversion = next.computeInversion(tuning);
    next.bassNote = next.computeBassNote(tuning, 'americano');
    onChange(next);
  };

  const render = () => {
    host.innerHTML = '';

    const baseRow = el('div', { className: 'stepper-inline', style: 'margin-bottom:8px' }, [
      el('span', { className: 'm3-body-md' }, ['Traste inicial:']),
      el('button', {
        type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal',
        onClick: () => {
          if (state.baseFret > 1) {
            state.baseFret -= 1;
            render();
            emitChange();
          }
        }
      }, ['−']),
      el('strong', {}, [`${state.baseFret}ª`]),
      el('button', {
        type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal',
        onClick: () => {
          if (state.baseFret < 12) {
            state.baseFret += 1;
            render();
            emitChange();
          }
        }
      }, ['+'])
    ]);

    // Fila superior de estado de cuerda (× / ○)
    const openCells = [];
    for (let s = 0; s < stringCount; s++) {
      const val = state.frets[s];
      openCells.push(
        el(
          'button',
          {
            type: 'button',
            className: `voicing-picker__cell ${val === 0 ? 'voicing-picker__cell--open' : ''}`,
            onClick: () => {
              state.frets[s] = val === 0 ? null : 0;
              state.fingers[s] = state.frets[s] === 0 ? 0 : null;
              render();
              emitChange();
            }
          },
          [val === null ? '×' : val === 0 ? '○' : `T${val}`]
        )
      );
    }

    const rows = [el('div', { className: 'voicing-picker__row', style: `grid-template-columns: repeat(${stringCount}, 1fr)` }, openCells)];

    for (let r = 0; r < 5; r++) {
      const absFret = state.baseFret + r;
      const cells = [];
      for (let s = 0; s < stringCount; s++) {
        const active = state.frets[s] === absFret;
        cells.push(
          el(
            'button',
            {
              type: 'button',
              className: `voicing-picker__cell ${active ? 'voicing-picker__cell--active' : ''}`,
              'aria-pressed': String(active),
              onClick: () => {
                if (active) {
                  state.frets[s] = null;
                  state.fingers[s] = null;
                } else {
                  state.frets[s] = absFret;
                  state.fingers[s] = Math.min(4, Math.max(1, r + 1));
                }
                render();
                emitChange();
              }
            },
            [active ? String(state.fingers[s] || r + 1) : String(absFret)]
          )
        );
      }
      rows.push(el('div', { className: 'voicing-picker__row', style: `grid-template-columns: repeat(${stringCount}, 1fr)` }, cells));
    }

    host.append(baseRow, ...rows);
  };

  render();
  return host;
}

/**
 * Dibuja un conector visual compacto de conducción de voces entre dos diagramas consecutivos,
 * mostrando notas comunes (=) y movimientos por grado conjunto (±1/±2 st).
 * @param {Array<{ fromMidi: number, toMidi: number, semitones: number, type: 'comun'|'grado'|'salto' }>} connections Enlaces.
 * @returns {HTMLElement} Nodo SVG/badge de conexión entre acordes.
 */
export function createVoiceLeadingConnector(connections = []) {
  if (!connections.length) return el('span');
  const common = connections.filter((c) => c.type === 'comun').length;
  const stepwise = connections.filter((c) => c.type === 'grado').length;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 42 70');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '60');
  svg.setAttribute('aria-hidden', 'true');

  const lines = connections.slice(0, 4).map((c, idx) => {
    const y1 = 12 + idx * 15;
    const shift = Math.max(-10, Math.min(10, -c.semitones * 3));
    const y2 = Math.max(6, Math.min(64, y1 + shift));
    const color =
      c.type === 'comun'
        ? 'var(--md-sys-color-success)'
        : c.type === 'grado'
          ? 'var(--md-sys-color-primary)'
          : 'var(--md-sys-color-outline)';
    return `<line x1="2" y1="${y1}" x2="40" y2="${y2}" stroke="${color}" stroke-width="${c.type === 'comun' ? 2.4 : 1.8}" stroke-dasharray="${c.type === 'salto' ? '3 3' : ''}"/>`;
  });
  svg.innerHTML = lines.join('');

  return el('div', { className: 'voice-leading-bridge', title: `${common} nota(s) común(es), ${stepwise} grado conjunto` }, [
    svg,
    el('span', { className: 'm3-label' }, [
      common > 0 ? `=${common}` : stepwise > 0 ? `±${stepwise}` : '→'
    ])
  ]);
}
