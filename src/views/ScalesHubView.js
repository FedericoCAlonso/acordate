import { formatChordSymbol } from '../core/i18n.js';
import { FLAT_NOTES, SHARP_NOTES } from '../core/MusicTheory.js';
import { VOICING_INSTRUMENT_OPTIONS } from '../services/FingeringDesignService.js';
import { PianoKeyboardView } from './PianoKeyboardView.js';
import { ScaleFretboardView } from './ScaleFretboardView.js';
import { el, icon } from './uiHelpers.js';

/** Instrumentos seleccionables en Escalas y Modos (incluye teclado SVG de Piano). */
const SCALE_INSTRUMENT_OPTIONS = [
  ...VOICING_INSTRUMENT_OPTIONS,
  { id: 'piano', label: 'Piano' }
];

/** Pestañas del módulo Escalas y Modos (#/escalas). */
const SCALES_TABS = [
  { id: 'explorador', label: 'Explorador' },
  { id: 'modos', label: 'Modos' },
  { id: 'patrones', label: 'Patrones' },
  { id: 'oido', label: 'Oído modal' }
];

/** Opciones de combinación de dedos de mano derecha en guitarra clásica. */
const CLASSICAL_RH_PATTERNS = [
  { id: 'i-m', label: 'i–m' },
  { id: 'm-i', label: 'm–i' },
  { id: 'm-a', label: 'm–a' }
];

/**
 * Formatea grados (ej. "b3" -> "♭3", "#4" -> "♯4") con símbolos musicales nítidos.
 * @param {string} deg Grado crudo.
 * @returns {string} Grado formateado.
 */
function fmtDeg(deg) {
  return String(deg || '').replace(/#/g, '♯').replace(/b/g, '♭');
}

/**
 * Formatea el nombre de una nota o acorde respetando la notación elegida (americano/latino).
 * @param {string} sym Símbolo americano.
 * @param {'americano'|'latino'} notation Sistema de cifrado.
 * @returns {string} Símbolo formateado con ♯/♭.
 */
function fmtSym(sym, notation) {
  return formatChordSymbol(sym, notation).replace(/#/g, '♯').replace(/b/g, '♭');
}

/**
 * Vista principal del módulo Escalas y Modos (#/escalas).
 * Renderiza el Explorador (diapasón interactivo SVG + digitaciones + teoría + acordes y repertorio),
 * la comparativa paralela de Modos por brillo, Patrones de estudio con partitura ABC (sin tablatura)
 * y el Entrenador de oído modal con pedal armónico (drone).
 */
export class ScalesHubView {
  /**
   * Construye la vista inyectando su ViewModel, el AppViewModel y AbcService.
   * @param {import('../viewmodels/ScalesHubViewModel.js').ScalesHubViewModel} vm ViewModel de Escalas.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel global.
   * @param {import('../services/AbcService.js').AbcService} abcService Servicio de partitura ABC.
   */
  constructor(vm, appVm, abcService) {
    /** ViewModel del módulo Escalas. */
    this._vm = vm;
    /** ViewModel global (ajustes, tema, catálogo). */
    this._appVm = appVm;
    /** Servicio de renderizado de partitura ABC. */
    this._abc = abcService;
    /** Contenedor DOM montado. */
    this._container = null;
    /** Barra de pestañas segmentadas. */
    this._tabsBar = null;
    /** Contenedor del panel de la pestaña activa. */
    this._panelHost = null;
    /** Instancia viva del diapasón SVG para resaltar notas MIDI sin re-renderizar. */
    this._fretboardView = new ScaleFretboardView({
      onNoteClick: (dot) => this._vm.playSingleNote(dot.midi)
    });
    /** Instancia viva del teclado SVG de piano para escalas y modos. */
    this._pianoKeyboardView = new PianoKeyboardView({
      onNoteClick: (dot) => this._vm.playSingleNote(dot.midi)
    });
    /** Lista de desuscripciones activas. */
    this._unsubs = [];
  }

  /**
   * Monta la vista de Escalas en el contenedor recibido y suscribe los observables del ViewModel.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this.unmount();
    this._container = container;
    this._container.innerHTML = '';

    this._tabsBar = el('div', {
      className: 'm3-tabs',
      role: 'tablist',
      'aria-label': 'Herramientas de escalas y modos'
    });
    this._panelHost = el('div', { className: 'scales-panel' });

    this._container.appendChild(
      el('div', { className: 'chords-hub' }, [this._tabsBar, this._panelHost])
    );

    this._unsubs = [
      this._vm.activeTab.subscribe(() => this._renderAll()),
      this._vm.voicingInstrument.subscribe(() => this._renderPanel()),
      this._vm.selectedRoot.subscribe(() => this._renderPanel()),
      this._vm.preferSharps.subscribe(() => this._renderPanel()),
      this._vm.selectedScaleId.subscribe(() => this._renderPanel()),
      this._vm.fingeringSystemId.subscribe(() => this._renderPanel()),
      this._vm.positionIndex.subscribe(() => this._renderPanel()),
      this._vm.labelMode.subscribe(() => this._renderPanel()),
      this._vm.showAvoidNotes.subscribe(() => this._renderPanel()),
      this._vm.leftHanded.subscribe(() => this._renderPanel()),
      this._vm.classicalMelodicDesc.subscribe(() => this._renderPanel()),
      this._vm.rightHandPattern.subscribe(() => this._renderPanel()),
      this._vm.studyPattern.subscribe(() => this._renderPanel()),
      this._vm.octaves.subscribe(() => this._renderPanel()),
      this._vm.bpm.subscribe(() => this._renderPanel()),
      this._vm.droneActive.subscribe(() => this._renderPanel()),
      this._vm.isPlayingSequence.subscribe(() => this._renderPanel()),
      this._vm.activeHighlightMidi.subscribe((midi) => {
        this._fretboardView.highlightMidi(midi);
        this._pianoKeyboardView.highlightMidi(midi);
      }),
      this._vm.earLevel.subscribe(() => this._renderPanel()),
      this._vm.earQuestion.subscribe(() => this._renderPanel()),
      this._vm.earSelectedId.subscribe(() => this._renderPanel()),
      this._vm.earScore.subscribe(() => this._renderPanel()),
      this._appVm.settings.subscribe(() => this._renderPanel()),
      this._appVm.allPractices.subscribe(() => this._renderPanel())
    ];

    this._renderAll();
  }

  /**
   * Abre una pestaña específica desde el router hash (#/escalas/:tab).
   * @param {string} tab Nombre de la pestaña.
   */
  openTab(tab) {
    if (tab) this._vm.setActiveTab(tab);
  }

  /**
   * Detiene el audio/drone al abandonar la pantalla y libera las suscripciones reactivas.
   */
  unmount() {
    this._vm.stopAudio();
    this._fretboardView.dispose();
    this._pianoKeyboardView.dispose();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Renderiza la barra superior de pestañas y el panel activo.
   */
  _renderAll() {
    if (!this._tabsBar) return;
    const active = this._vm.activeTab.value;
    this._tabsBar.innerHTML = '';
    for (const tab of SCALES_TABS) {
      this._tabsBar.appendChild(
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: 'm3-tabs__btn',
            ripple: true,
            'aria-pressed': String(active === tab.id),
            'aria-selected': String(active === tab.id),
            onClick: () => this._vm.setActiveTab(tab.id)
          },
          [tab.label]
        )
      );
    }
    this._renderPanel();
  }

  /**
   * Despacha el renderizado de la pestaña activa.
   */
  _renderPanel() {
    if (!this._panelHost) return;
    this._panelHost.innerHTML = '';
    const tab = this._vm.activeTab.value;
    if (tab === 'explorador') this._renderExplorerTab();
    else if (tab === 'modos') this._renderModesTab();
    else if (tab === 'patrones') this._renderPatternsTab();
    else this._renderEarTab();
  }

  /**
   * Construye la barra compartida de Instrumento (Clásica / Guitarra / Bajo 4c / Bajo 5c) y Raíz con ♯/♭.
   * @param {string} notation Sistema de cifrado activo.
   * @returns {HTMLElement} Tarjeta de controles de instrumento y tonalidad.
   */
  _buildInstrumentAndRootBar(notation) {
    const activeInst = this._vm.voicingInstrument.value;
    const shortLabels = {
      guitarra: 'Guit.',
      'guitarra-clasica': 'Clás.',
      bajo: 'Bajo 4',
      'bajo-5': 'Bajo 5',
      piano: 'Piano'
    };
    const instSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full scales-inst-seg', role: 'group', 'aria-label': 'Instrumento de digitación' },
      SCALE_INSTRUMENT_OPTIONS.map((inst) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            title: inst.label,
            'aria-pressed': String(activeInst === inst.id),
            onClick: () => this._vm.setVoicingInstrument(inst.id)
          },
          [shortLabels[inst.id] || inst.label]
        )
      )
    );

    const preferSharps = this._vm.preferSharps.value;
    const roots = preferSharps ? SHARP_NOTES : FLAT_NOTES;
    const activeRoot = this._vm.selectedRoot.value;

    const enhToggle = el('div', { className: 'm3-segmented', role: 'group', 'aria-label': 'Enarmonía' }, [
      el(
        'button',
        {
          type: 'button',
          className: 'm3-segmented__btn',
          'aria-pressed': String(preferSharps),
          onClick: () => this._vm.setPreferSharps(true)
        },
        ['♯']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-segmented__btn',
          'aria-pressed': String(!preferSharps),
          onClick: () => this._vm.setPreferSharps(false)
        },
        ['♭']
      )
    ]);

    const rootGrid = el(
      'div',
      { className: 'root-grid', role: 'group', 'aria-label': 'Nota tónica de la escala' },
      roots.map((note) =>
        el(
          'button',
          {
            type: 'button',
            className: `m3-chip ${activeRoot === note ? 'm3-chip--selected' : ''}`,
            ripple: true,
            'aria-pressed': String(activeRoot === note),
            onClick: () => this._vm.selectRoot(note)
          },
          [fmtSym(note, notation)]
        )
      )
    );

    return el('section', { className: 'm3-card scales-controls-card' }, [
      instSeg,
      el('div', { className: 'scales-root-header' }, [
        el('span', { className: 'm3-label-md' }, ['Tónica']),
        enhToggle
      ]),
      rootGrid
    ]);
  }

  /**
   * Construye el selector agrupado de las 22 escalas y modos (por familia y nivel).
   * @returns {HTMLElement} Control select accesible.
   */
  _buildScaleSelector() {
    const { scales, families } = this._vm.getCatalogMeta();
    const activeId = this._vm.selectedScaleId.value;

    const select = el(
      'select',
      {
        className: 'm3-field__select',
        'aria-label': 'Seleccionar escala o modo',
        onChange: (e) => this._vm.selectScale(e.target.value)
      },
      families.map((fam) => {
        const groupScales = scales.filter((s) => s.family === fam.id);
        return el(
          'optgroup',
          { label: fam.label },
          groupScales.map((s) =>
            el(
              'option',
              { value: s.id, selected: s.id === activeId },
              [`[Nivel ${s.level}] ${s.name}`]
            )
          )
        );
      })
    );
    select.value = activeId;
    return select;
  }

  /**
   * Pestaña 1: Explorador completo de escalas (diapasón interactivo, digitaciones, teoría y enlaces).
   */
  _renderExplorerTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const scale = this._vm.activeScale.value;
    const layout = this._vm.fretboardLayout.value;
    const systems = this._vm.availableSystems.value;
    const associatedChords = this._vm.associatedChords.value;
    const linkedRepertoire = this._vm.linkedRepertoirePractices.value;
    const relLabel = this._vm.relativeParentLabel.value;
    const isPiano = this._vm.voicingInstrument.value === 'piano';
    const isClassical = this._vm.voicingInstrument.value === 'guitarra-clasica';

    // 1) Barra superior de instrumento y raíz
    this._panelHost.appendChild(this._buildInstrumentAndRootBar(notation));

    // 2) Tarjeta principal de escala: selector, fórmula, notas escritas, drone y diapasón SVG
    const notesRow = el(
      'div',
      { className: 'scale-notes-strip', 'aria-label': 'Notas de la escala' },
      layout.notesMeta.map((n) => {
        const cls = ['scale-note-pill'];
        if (n.isRoot) cls.push('scale-note-pill--root');
        else if (n.isCharacteristic) cls.push('scale-note-pill--char');
        else if (n.isAvoid && this._vm.showAvoidNotes.value) cls.push('scale-note-pill--avoid');
        return el('div', { className: cls.join(' ') }, [
          el('strong', {}, [fmtSym(n.name, notation)]),
          el('span', {}, [fmtDeg(n.degree)])
        ]);
      })
    );

    // Toggle exclusivo para menor melódica (Clásica vs Jazz)
    const melodicToggle = scale.hasClassicalDualMode
      ? el('div', { className: 'scale-melodic-toggle' }, [
          el('span', { className: 'm3-label-md' }, ['Menor melódica:']),
          el('div', { className: 'm3-segmented' }, [
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                'aria-pressed': String(!this._vm.classicalMelodicDesc.value),
                onClick: () => this._vm.classicalMelodicDesc.set(false)
              },
              ['Jazz (sube y baja igual)']
            ),
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                'aria-pressed': String(this._vm.classicalMelodicDesc.value),
                onClick: () => this._vm.classicalMelodicDesc.set(true)
              },
              ['Clásica (baja como natural)']
            )
          ])
        ])
      : null;

    // Selector de sistema de digitación + posiciones
    const systemChips = el(
      'div',
      { className: 'filter-row', role: 'group', 'aria-label': 'Sistema de digitación' },
      systems.map((sys) =>
        el(
          'button',
          {
            type: 'button',
            className: `m3-chip ${layout.system.id === sys.id ? 'm3-chip--selected' : ''}`,
            ripple: true,
            'aria-pressed': String(layout.system.id === sys.id),
            onClick: () => this._vm.setFingeringSystem(sys.id)
          },
          [sys.label]
        )
      )
    );

    const posChips =
      layout.positions.length > 1
        ? el(
            'div',
            { className: 'filter-row', role: 'group', 'aria-label': 'Posiciones y cajas' },
            layout.positions.map((pos, idx) =>
              el(
                'button',
                {
                  type: 'button',
                  className: `m3-chip ${layout.positionIndex === idx ? 'm3-chip--selected' : ''}`,
                  ripple: true,
                  'aria-pressed': String(layout.positionIndex === idx),
                  onClick: () => this._vm.setPositionIndex(idx)
                },
                [pos.label]
              )
            )
          )
        : null;

    // Opciones visuales del diapasón (Notas / Grados / Dedos + Evitar + Zurdo)
    const displayRow = el('div', { className: 'scales-display-bar' }, [
      el('div', { className: 'm3-segmented', role: 'group', 'aria-label': 'Etiqueta en los puntos' }, [
        ['note', 'Notas'],
        ['degree', 'Grados'],
        ['finger', 'Dedos']
      ].map(([mode, lbl]) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            'aria-pressed': String(this._vm.labelMode.value === mode),
            onClick: () => this._vm.labelMode.set(mode)
          },
          [lbl]
        )
      )),
      el(
        'button',
        {
          type: 'button',
          className: `m3-chip ${this._vm.showAvoidNotes.value ? 'm3-chip--selected' : ''}`,
          'aria-pressed': String(this._vm.showAvoidNotes.value),
          onClick: () => this._vm.showAvoidNotes.set(!this._vm.showAvoidNotes.value)
        },
        ['Notas a evitar']
      ),
      !isPiano
        ? el(
            'button',
            {
              type: 'button',
              className: `m3-chip ${this._vm.leftHanded.value ? 'm3-chip--selected' : ''}`,
              'aria-pressed': String(this._vm.leftHanded.value),
              onClick: () => this._vm.leftHanded.set(!this._vm.leftHanded.value)
            },
            ['Zurdo']
          )
        : null
    ]);

    // Contenedor del diapasón o teclado SVG interactivo (con pista de deslizamiento en móvil)
    const fretboardHost = el('div', { className: 'scale-fretboard-wrap' });
    if (isPiano) {
      this._pianoKeyboardView.render(fretboardHost, layout, {
        labelMode: this._vm.labelMode.value,
        notation,
        showAvoidNotes: this._vm.showAvoidNotes.value
      });
    } else {
      this._fretboardView.render(fretboardHost, layout, {
        labelMode: this._vm.labelMode.value,
        notation,
        showAvoidNotes: this._vm.showAvoidNotes.value,
        leftHanded: this._vm.leftHanded.value
      });
    }
    const fretboardHint = el('div', { className: 'fretboard-scroll-hint' }, [
      isPiano
        ? 'Tocá una tecla · Deslizá el teclado ↔'
        : 'Deslizá el mástil horizontalmente ↔'
    ]);

    // Leyenda visual del diapasón
    const legend = el('div', { className: 'scale-legend', 'aria-label': 'Leyenda de colores del diapasón' }, [
      el('span', { className: 'scale-legend__item' }, [el('i', { className: 'scale-legend__swatch scale-legend__swatch--root' }), 'Raíz']),
      el('span', { className: 'scale-legend__item' }, [el('i', { className: 'scale-legend__swatch scale-legend__swatch--char' }), 'Nota característica']),
      el('span', { className: 'scale-legend__item' }, [el('i', { className: 'scale-legend__swatch scale-legend__swatch--chord' }), 'Nota del acorde']),
      el('span', { className: 'scale-legend__item' }, [el('i', { className: 'scale-legend__swatch scale-legend__swatch--scale' }), 'Escala']),
      this._vm.showAvoidNotes.value
        ? el('span', { className: 'scale-legend__item' }, [el('i', { className: 'scale-legend__swatch scale-legend__swatch--avoid' }), 'Nota a evitar / paso'])
        : null
    ]);

    // Barra de audio, drone modal y botón "Practicar esta escala"
    const isPlaying = this._vm.isPlayingSequence.value;
    const droneOn = this._vm.droneActive.value;
    const actionBar = el('div', { className: 'scales-action-bar' }, [
      el(
        'button',
        {
          type: 'button',
          className: `m3-btn ${droneOn ? 'm3-btn--filled' : 'm3-btn--tonal'}`,
          ripple: true,
          'aria-pressed': String(droneOn),
          onClick: () => this._vm.toggleDrone()
        },
        [icon('music', 18), droneOn ? `Detener drone (${scale.droneVoicingLabel})` : `Drone modal (${scale.droneVoicingLabel})`]
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--tonal',
          ripple: true,
          onClick: () => (isPlaying ? this._vm.stopAudio() : this._vm.playCurrentScale('asc-desc'))
        },
        [icon(isPlaying ? 'stop' : 'play', 18), isPlaying ? 'Detener' : 'Escuchar escala']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--filled',
          ripple: true,
          onClick: () => this._vm.practiceCurrentScale(true)
        },
        [icon('play', 18), 'Practicar en reproductor']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--outlined',
          ripple: true,
          onClick: () => this._vm.practiceCurrentScale(false)
        },
        [icon('plus', 18), 'Guardar práctica']
      )
    ]);

    const mainCard = el('section', { className: 'm3-card scales-main-card' }, [
      el('div', { className: 'scales-header-row' }, [
        el('div', { style: 'flex:1 1 220px; min-width:0' }, [
          this._buildScaleSelector()
        ]),
        el('div', { className: 'scales-title-meta' }, [
          el('span', { className: 'm3-badge' }, [`N${scale.level}`]),
          relLabel ? el('span', { className: 'm3-body-md', style: 'font-size:0.8rem' }, [relLabel]) : null
        ])
      ]),
      fretboardHost,
      fretboardHint,
      displayRow,
      actionBar,
      el('div', { style: 'margin-top:10px; display:flex; flex-direction:column; gap:8px' }, [
        systemChips,
        posChips,
        layout.activePosition?.hint
          ? el('p', { className: 'm3-body-md', style: 'margin:0; opacity:0.86' }, [layout.activePosition.hint])
          : null
      ]),
      melodicToggle,
      notesRow,
      legend
    ]);

    this._panelHost.appendChild(mainCard);

    // 3) Grilla de teoría, usos, acordes asociados y obras del repertorio
    const theoryCard = el('section', { className: 'm3-card' }, [
      el('h3', { className: 'm3-title-md', style: 'margin-top:0' }, ['Usos musicales y técnica']),
      el('p', { className: 'm3-body-md' }, [el('strong', {}, ['Dónde usarla: ']), scale.uses]),
      scale.avoidNoteExplanation
        ? el('p', { className: 'm3-body-md' }, [el('strong', {}, ['Notas a cuidar: ']), scale.avoidNoteExplanation])
        : null,
      el('p', { className: 'm3-body-md' }, [el('strong', {}, ['Consejo de estudio: ']), scale.techniqueTip]),
      isClassical
        ? el('div', { style: 'margin-top:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap' }, [
            el('span', { className: 'm3-label-md' }, ['Mano derecha (clásica):']),
            el(
              'div',
              { className: 'm3-segmented' },
              CLASSICAL_RH_PATTERNS.map((rh) =>
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'm3-segmented__btn',
                    'aria-pressed': String(this._vm.rightHandPattern.value === rh.id),
                    onClick: () => this._vm.rightHandPattern.set(rh.id)
                  },
                  [rh.label]
                )
              )
            )
          ])
        : null
    ]);

    const chordsCard = el('section', { className: 'm3-card' }, [
      el('h3', { className: 'm3-title-md', style: 'margin-top:0' }, ['Acordes asociados']),
      el('p', { className: 'm3-body-md', style: 'margin-top:0' }, [
        'Tocá ▶ para escuchar el acorde o su nombre para abrir las digitaciones en Acordes.'
      ]),
      el(
        'div',
        { className: 'scale-chords-grid' },
        associatedChords.map((item) =>
          el('div', { className: 'scale-chord-chip' }, [
            el(
              'button',
              {
                type: 'button',
                className: 'm3-icon-btn',
                'aria-label': `Escuchar ${fmtSym(item.symbol, notation)}`,
                onClick: () => this._vm.playAssociatedChord(item.symbol)
              },
              [icon('play', 16)]
            ),
            el(
              'button',
              {
                type: 'button',
                className: 'scale-chord-chip__main',
                onClick: () => this._vm.openChordInHub(item.symbol)
              },
              [
                el('strong', {}, [fmtSym(item.symbol, notation)]),
                el('span', {}, [item.role])
              ]
            )
          ])
        )
      )
    ]);

    const repertoireCard =
      linkedRepertoire.length > 0
        ? el('section', { className: 'm3-card' }, [
            el('h3', { className: 'm3-title-md', style: 'margin-top:0' }, ['Aplicala en el Repertorio']),
            el('p', { className: 'm3-body-md', style: 'margin-top:0' }, [
              'Obras y progresiones del catálogo donde esta escala suena en contexto real:'
            ]),
            el(
              'div',
              { className: 'scale-repertoire-list' },
              linkedRepertoire.map((pr) =>
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'scale-repertoire-item',
                    ripple: true,
                    onClick: () => this._vm.openRepertoirePractice(pr.id)
                  },
                  [
                    el('div', { style: 'text-align:left' }, [
                      el('strong', {}, [pr.title]),
                      el('div', { className: 'm3-body-md', style: 'font-size:0.82rem; opacity:0.8' }, [
                        `Nivel ${pr.level}${pr.style ? ` · ${pr.style}` : ''}${pr.key ? ` · Tonalidad ${fmtSym(pr.key, notation)}` : ''}`
                      ])
                    ]),
                    icon('play', 18)
                  ]
                )
              )
            )
          ])
        : null;

    this._panelHost.appendChild(
      el('div', { className: 'scale-info-grid' }, [theoryCard, chordsCard, repertoireCard])
    );
  }

  /**
   * Pestaña 2: Modos griegos comparados en paralelo (misma tónica, ordenados del más brillante al más oscuro).
   */
  _renderModesTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const modes = this._vm.parallelModesComparison.value;
    const displayRoot = fmtSym(this._vm.selectedRoot.value, notation);

    this._panelHost.appendChild(this._buildInstrumentAndRootBar(notation));

    const intro = el('section', { className: 'm3-card' }, [
      el('h2', { className: 'm3-title-lg', style: 'margin:0 0 6px' }, [
        `Los 7 modos en paralelo desde ${displayRoot}`
      ]),
      el('p', { className: 'm3-body-md', style: 'margin:0' }, [
        'Ordenados del más brillante (Lidio, con ♯4) al más oscuro (Locrio, con ♭2 y ♭5). Escuchá varios seguidos desde la misma raíz para sentir el color de cada nota característica.'
      ])
    ]);
    this._panelHost.appendChild(intro);

    const grid = el(
      'div',
      { className: 'modes-compare-grid' },
      modes.map((entry, idx) => {
        const { scale, notes, characteristicNotes, tonicChord } = entry;
        const isCurrent = this._vm.selectedScaleId.value === scale.id;
        return el('article', { className: `m3-card mode-card ${isCurrent ? 'mode-card--active' : ''}` }, [
          el('div', { className: 'mode-card__head' }, [
            el('div', {}, [
              el('span', { className: 'm3-badge' }, [`Brillo ${idx + 1}/7`]),
              el('h3', { className: 'm3-title-md', style: 'margin:6px 0 2px' }, [`${displayRoot} ${scale.name}`])
            ]),
            el('span', { className: 'm3-chip' }, [fmtSym(tonicChord, notation)])
          ]),
          el('div', { className: 'mode-card__formula' }, [
            notes.map((n) =>
              el(
                'span',
                {
                  className: `mode-deg ${n.isRoot ? 'mode-deg--root' : n.isCharacteristic ? 'mode-deg--char' : n.isAvoid ? 'mode-deg--avoid' : ''}`
                },
                [`${fmtDeg(n.degree)} (${fmtSym(n.name, notation)})`]
              )
            )
          ].flat()),
          el('p', { className: 'm3-body-md', style: 'margin:8px 0 4px' }, [
            el('strong', {}, ['Nota característica: ']),
            characteristicNotes.map((n) => `${fmtDeg(n.degree)} (${fmtSym(n.name, notation)})`).join(', ') || '—'
          ]),
          el('p', { className: 'm3-body-md', style: 'margin:0 0 10px; font-size:0.88rem; opacity:0.88' }, [scale.uses]),
          el('div', { className: 'scales-action-bar', style: 'margin-top:auto' }, [
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--tonal m3-btn--compact',
                ripple: true,
                onClick: () => this._vm.playParallelMode(scale.id)
              },
              [icon('play', 16), 'Escuchar con drone']
            ),
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--outlined m3-btn--compact',
                ripple: true,
                onClick: () => {
                  this._vm.selectScale(scale.id);
                  this._vm.setActiveTab('explorador');
                }
              },
              ['Ver en diapasón']
            )
          ])
        ]);
      })
    );
    this._panelHost.appendChild(grid);
  }

  /**
   * Pestaña 3: Patrones de estudio melódicos y técnicos con partitura ABC sincronizada (sin tablatura).
   */
  _renderPatternsTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const { patterns } = this._vm.getCatalogMeta();
    const scale = this._vm.activeScale.value;
    const activePattern = this._vm.studyPattern.value;
    const isPlaying = this._vm.isPlayingSequence.value;
    const isClassical = this._vm.voicingInstrument.value === 'guitarra-clasica';

    this._panelHost.appendChild(this._buildInstrumentAndRootBar(notation));

    const patternChips = el(
      'div',
      { className: 'filter-row', role: 'group', 'aria-label': 'Patrón de estudio' },
      patterns.map((pat) =>
        el(
          'button',
          {
            type: 'button',
            className: `m3-chip ${activePattern === pat.id ? 'm3-chip--selected' : ''}`,
            ripple: true,
            'aria-pressed': String(activePattern === pat.id),
            onClick: () => this._vm.studyPattern.set(pat.id)
          },
          [pat.label]
        )
      )
    );

    const activePatMeta = patterns.find((p) => p.id === activePattern) || patterns[0];

    const scoreBox = el('div', {
      className: 'score-stage scale-score-preview',
      'aria-label': 'Partitura de estudio en pentagrama (sin tablatura)'
    });

    const controlsCard = el('section', { className: 'm3-card' }, [
      el('div', { className: 'scales-header-row' }, [
        el('div', { style: 'flex:1 1 240px' }, [
          el('div', { className: 'm3-label-md', style: 'margin-bottom:4px' }, ['Escala base']),
          this._buildScaleSelector()
        ]),
        el('div', { style: 'display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end' }, [
          el('div', {}, [
            el('div', { className: 'm3-label-md', style: 'margin-bottom:4px' }, ['Extensión']),
            el('div', { className: 'm3-segmented' }, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-segmented__btn',
                  'aria-pressed': String(this._vm.octaves.value === 1),
                  onClick: () => this._vm.octaves.set(1)
                },
                ['1 octava']
              ),
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-segmented__btn',
                  'aria-pressed': String(this._vm.octaves.value === 2),
                  onClick: () => this._vm.octaves.set(2)
                },
                ['2 octavas']
              )
            ])
          ]),
          el('div', {}, [
            el('div', { className: 'm3-label-md', style: 'margin-bottom:4px' }, [`Tempo: ${this._vm.bpm.value} BPM`]),
            el('input', {
              type: 'range',
              className: 'm3-slider',
              min: '50',
              max: '170',
              step: '2',
              value: String(this._vm.bpm.value),
              'aria-label': 'Tempo en BPM',
              onInput: (e) => this._vm.bpm.set(Number(e.target.value))
            })
          ])
        ])
      ]),
      el('div', { style: 'margin-top:12px' }, [
        el('div', { className: 'm3-label-md', style: 'margin-bottom:6px' }, ['Patrón técnico / melódico']),
        patternChips,
        el('p', { className: 'm3-body-md', style: 'margin:8px 0 0' }, [activePatMeta.description])
      ]),
      isClassical
        ? el('div', { style: 'margin-top:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap' }, [
            el('span', { className: 'm3-label-md' }, ['Pulsación mano derecha:']),
            el(
              'div',
              { className: 'm3-segmented' },
              CLASSICAL_RH_PATTERNS.map((rh) =>
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'm3-segmented__btn',
                    'aria-pressed': String(this._vm.rightHandPattern.value === rh.id),
                    onClick: () => this._vm.rightHandPattern.set(rh.id)
                  },
                  [rh.label]
                )
              )
            )
          ])
        : null,
      el('div', { className: 'scales-action-bar' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--tonal',
            ripple: true,
            onClick: () => (isPlaying ? this._vm.stopAudio() : this._vm.playCurrentScale())
          },
          [icon(isPlaying ? 'stop' : 'play', 18), isPlaying ? 'Detener' : 'Escuchar patrón']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--filled',
            ripple: true,
            onClick: () => this._vm.practiceCurrentScale(true)
          },
          [icon('play', 18), 'Practicar en reproductor (con bucle y metrónomo)']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--outlined',
            ripple: true,
            onClick: () => this._vm.practiceCurrentScale(false)
          },
          [icon('plus', 18), 'Guardar en Mis prácticas']
        )
      ]),
      el('div', { style: 'margin-top:12px' }, [
        el('div', { className: 'm3-label-md', style: 'margin-bottom:6px' }, [
          `Partitura: ${fmtSym(this._vm.selectedRoot.value, notation)} ${scale.name} · ${activePatMeta.label}`
        ]),
        scoreBox
      ])
    ]);

    this._panelHost.appendChild(controlsCard);

    // Renderiza la partitura ABC usando AbcService (100 % pentagrama, cero tablatura)
    if (this._abc) {
      const isPianoInst = this._vm.voicingInstrument.value === 'piano';
      const prepared = this._abc.prepareAbcForRender(this._vm.previewAbc.value, {
        chordNotation: notation,
        showFingerings: true,
        isBass: !isPianoInst && this._vm.voicingInstrument.value.startsWith('bajo'),
        isPiano: isPianoInst
      });
      this._abc.renderScore(scoreBox, prepared, {
        width: Math.max(300, scoreBox.clientWidth || 680),
        isPiano: isPianoInst
      });
    }
  }

  /**
   * Pestaña 4: Entrenador de oído modal en enfoque paralelo (misma tónica + drone armónico).
   */
  _renderEarTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const { earLevels } = this._vm.getCatalogMeta();
    const level = this._vm.earLevel.value;
    const q = this._vm.earQuestion.value;
    const selectedId = this._vm.earSelectedId.value;
    const score = this._vm.earScore.value;

    const levelChips = el(
      'div',
      { className: 'filter-row', role: 'group', 'aria-label': 'Nivel de oído modal' },
      earLevels.map((lv) =>
        el(
          'button',
          {
            type: 'button',
            className: `m3-chip ${level === lv.level ? 'm3-chip--selected' : ''}`,
            ripple: true,
            'aria-pressed': String(level === lv.level),
            onClick: () => this._vm.setEarLevel(lv.level)
          },
          [lv.label]
        )
      )
    );

    const card = el('section', { className: 'm3-card' }, [
      el('div', { className: 'scales-header-row' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-lg', style: 'margin:0 0 4px' }, ['Oído modal en paralelo']),
          el('p', { className: 'm3-body-md', style: 'margin:0' }, [
            `Todas las escalas suenan desde la misma tónica (${fmtSym(this._vm.selectedRoot.value, notation)}) sobre un pedal armónico.`
          ])
        ]),
        el('span', { className: 'm3-badge' }, [`Aciertos: ${score.correct} / ${score.total}`])
      ]),
      el('div', { style: 'margin-top:12px' }, [levelChips]),
      q
        ? el('div', { style: 'margin-top:16px' }, [
            el('div', { className: 'scales-action-bar' }, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-btn m3-btn--filled',
                  ripple: true,
                  onClick: () => this._vm.playEarQuestion()
                },
                [icon('ear', 18), 'Escuchar escala con drone']
              ),
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-btn m3-btn--outlined',
                  ripple: true,
                  onClick: () => this._vm.nextEarQuestion()
                },
                ['Nueva pregunta']
              )
            ]),
            el(
              'div',
              { className: 'scale-ear-options' },
              q.options.map((opt) => {
                const isAnswer = opt.id === q.answerScale.id;
                const isPicked = selectedId === opt.id;
                let cls = 'm3-btn m3-btn--outlined scale-ear-opt';
                if (selectedId) {
                  if (isAnswer) cls = 'm3-btn m3-btn--filled scale-ear-opt scale-ear-opt--correct';
                  else if (isPicked) cls = 'm3-btn m3-btn--outlined scale-ear-opt scale-ear-opt--wrong';
                }
                return el(
                  'button',
                  {
                    type: 'button',
                    className: cls,
                    disabled: Boolean(selectedId),
                    onClick: () => this._vm.answerEarQuestion(opt.id)
                  },
                  [opt.name]
                );
              })
            ),
            selectedId
              ? el('div', { className: 'scale-ear-feedback' }, [
                  el('strong', {}, [
                    selectedId === q.answerScale.id
                      ? `¡Correcto! Era ${fmtSym(q.root, notation)} ${q.answerScale.name}.`
                      : `Era ${fmtSym(q.root, notation)} ${q.answerScale.name}.`
                  ]),
                  el('p', { className: 'm3-body-md', style: 'margin:6px 0' }, [
                    `Fórmula: ${q.answerScale.degreeLabels.map(fmtDeg).join(' – ')}. ${q.answerScale.techniqueTip}`
                  ]),
                  el('div', { className: 'scales-action-bar' }, [
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'm3-btn m3-btn--tonal m3-btn--compact',
                        onClick: () => {
                          this._vm.selectRoot(q.root);
                          this._vm.selectScale(q.answerScale.id);
                          this._vm.setActiveTab('explorador');
                        }
                      },
                      ['Explorar esta escala en el diapasón']
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'm3-btn m3-btn--filled m3-btn--compact',
                        onClick: () => this._vm.nextEarQuestion()
                      },
                      ['Siguiente →']
                    )
                  ])
                ])
              : null
          ])
        : null
    ]);

    this._panelHost.appendChild(card);
  }
}
