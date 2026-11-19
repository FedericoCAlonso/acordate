import {
  CATEGORY_LABELS,
  INSTRUMENT_LABELS,
  NOTATION_VIEW_LABELS,
  SYNTH_INSTRUMENT_LABELS,
  formatChordSymbol,
  formatKeyName
} from '../core/i18n.js';
import { createSliderGroup, createSwitchRow, el, icon } from './uiHelpers.js';

/**
 * Vista del Reproductor de Práctica (#/practica/:id y panel derecho en escritorio).
 * Renderiza la partitura adaptable con abcjs, la vista de cifrado, el resaltado en tiempo real,
 * los controles de transporte, bucle, transposición, mezclador multi-voz y guía de estudio.
 */
export class PracticePlayerView {
  /**
   * Construye la vista inyectando su ViewModel, el AppViewModel y AbcService (solo para renderizado SVG).
   * @param {import('../viewmodels/PracticePlayerViewModel.js').PracticePlayerViewModel} vm ViewModel del reproductor.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   * @param {import('../services/AbcService.js').AbcService} abcService Servicio de renderizado abcjs.
   */
  constructor(vm, appVm, abcService) {
    /** ViewModel del reproductor. */
    this._vm = vm;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Servicio abcjs para dibujar el pentagrama en el DOM. */
    this._abc = abcService;

    /** Contenedor DOM principal. */
    this._container = null;
    /** Lista de desuscripciones activas. */
    this._unsubs = [];
    /** ResizeObserver para reflujo dinámico de compases al cambiar el ancho. */
    this._resizeObserver = null;
    /** Último ancho renderizado para evitar redibujos redundantes. */
    this._lastScoreWidth = 0;
    /** Nodos SVG resaltados actualmente para limpiarlos en el próximo pulso. */
    this._highlightedSvgNodes = [];
    /** Contenedor donde abcjs renderiza el SVG de la partitura. */
    this._scoreEl = null;
    /** Contenedor de la vista de grilla de cifrado. */
    this._chartEl = null;
    /** Banner de conteo previo. */
    this._countInEl = null;
    /** Listener de teclado para barra espaciadora (reproducir/pausar). */
    this._onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      this._vm.togglePlay();
    };
  }

  /**
   * Monta la vista del reproductor en el contenedor DOM.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    this._buildSkeleton();
    this._bindObservables();
    document.addEventListener('keydown', this._onKeyDown);

    if (this._vm.practice.value) {
      this._renderPracticeMeta();
      this._renderNotationSurface();
    }
  }

  /**
   * Carga una práctica específica en el ViewModel y actualiza la pantalla.
   * @param {import('../models/Practice.js').Practice} practice Práctica a practicar.
   */
  showPractice(practice) {
    if (!practice) return;
    if (this._vm.practice.value?.id !== practice.id) {
      this._vm.loadPractice(practice);
    }
    if (this._container) {
      this._renderPracticeMeta();
      this._renderNotationSurface();
    }
  }

  /**
   * Limpia observadores, teclado, audio y suscripciones al desmontar.
   */
  unmount() {
    this._vm.stop();
    document.removeEventListener('keydown', this._onKeyDown);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._highlightedSvgNodes = [];
    this._container = null;
  }

  /**
   * Construye la estructura fija de tarjetas Material 3 del reproductor.
   */
  _buildSkeleton() {
    this._container.innerHTML = '';

    this._headerCard = el('div', { className: 'm3-card m3-card--elevated player-header' });
    this._viewBar = el('div', { className: 'player-toolbar' });
    this._countInEl = el('div', { className: 'count-in-banner', style: 'display:none', 'aria-live': 'assertive' });
    this._scoreEl = el('div', { className: 'score-surface', 'aria-label': 'Partitura en pentagrama' });
    this._chartEl = el('div', { className: 'score-surface', style: 'display:none', 'aria-label': 'Grilla de cifrado de acordes' });

    this._transportCard = el('div', { className: 'm3-card m3-card--elevated' });
    this._practiceToolsGrid = el('div', { className: 'controls-grid' });
    this._guidesCard = el('div', { className: 'm3-card' });

    const layout = el('div', { className: 'player-layout' }, [
      this._headerCard,
      this._viewBar,
      this._countInEl,
      this._scoreEl,
      this._chartEl,
      this._transportCard,
      this._practiceToolsGrid,
      this._guidesCard
    ]);

    this._container.appendChild(layout);

    // Observa cambios de tamaño para reflujo automático de la partitura
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w = Math.round(entries[0]?.contentRect?.width || 0);
        if (w > 120 && Math.abs(w - this._lastScoreWidth) > 28) {
          this._renderNotationSurface();
        }
      });
      this._resizeObserver.observe(this._scoreEl);
    }

    this._buildTransportCard();
    this._buildToolsCards();
  }

  /**
   * Suscribe la vista a los observables del PracticePlayerViewModel.
   */
  _bindObservables() {
    this._unsubs = [
      this._vm.practice.subscribe(() => {
        this._renderPracticeMeta();
        this._syncControlValues();
      }),
      this._vm.renderableAbc.subscribe(() => this._renderNotationSurface()),
      this._vm.viewMode.subscribe(() => {
        this._renderViewBar();
        this._renderNotationSurface();
      }),
      this._vm.zoom.subscribe(() => {
        this._renderViewBar();
        this._renderNotationSurface();
      }),
      this._vm.showFingerings.subscribe(() => this._renderViewBar()),
      this._vm.showBassFunctions.subscribe(() => this._renderViewBar()),
      this._vm.transposedKey.subscribe(() => {
        this._renderPracticeMeta();
        this._syncControlValues();
      }),
      this._vm.isPlaying.subscribe(() => this._syncPlayButton()),
      this._vm.isPaused.subscribe(() => this._syncPlayButton()),
      this._vm.bpm.subscribe(() => this._syncControlValues()),
      this._vm.countInStatus.subscribe((st) => this._renderCountIn(st)),
      this._vm.activeNoteEvent.subscribe((ev) => this._highlightActiveNote(ev)),
      this._vm.activeMeasure.subscribe((m) => this._highlightActiveChartBar(m)),
      this._vm.practiceStats.subscribe(() => this._renderPracticeMeta()),
      this._vm.measureCount.subscribe(() => this._syncControlValues()),
      this._vm.loopEnabled.subscribe(() => this._syncControlValues()),
      this._vm.loopStartMeasure.subscribe(() => this._syncControlValues()),
      this._vm.loopEndMeasure.subscribe(() => this._syncControlValues()),
      this._vm.synthInstrument.subscribe(() => this._syncControlValues()),
      this._vm.sessionRepetitions.subscribe(() => this._renderPracticeMeta()),
      this._appVm.settings.subscribe(() => {
        this._renderPracticeMeta();
        this._renderNotationSurface();
      })
    ];
  }

  /**
   * Renderiza la cabecera de la práctica activa y la tarjeta de objetivos y notas.
   */
  _renderPracticeMeta() {
    const pr = this._vm.practice.value;
    if (!pr || !this._headerCard) return;

    const notation = this._appVm.settings.value.chordNotation;
    const stats = this._vm.practiceStats.value;
    const keyLabel = formatKeyName(this._vm.transposedKey.value, notation);
    const semi = this._vm.transposeSemitones.value;

    this._headerCard.innerHTML = '';
    const info = el('div', {}, [
      el('h2', { className: 'm3-headline' }, [pr.title]),
      el('div', { className: 'practice-card__meta', style: 'margin-top:8px' }, [
        el('span', { className: 'm3-badge m3-badge--primary' }, [
          pr.instruments.map((i) => INSTRUMENT_LABELS[i] || i).join(' · ')
        ]),
        el('span', { className: 'm3-badge' }, [`Nivel ${pr.level}`]),
        el('span', { className: 'm3-badge' }, [CATEGORY_LABELS[pr.category] || pr.category]),
        el('span', { className: 'm3-badge' }, [
          `Tonalidad: ${keyLabel}${semi ? ` (${semi > 0 ? '+' : ''}${semi} st)` : ''}`
        ]),
        el('span', { className: 'm3-badge' }, [`Compás ${pr.timeSignature}`]),
        el('span', { className: 'm3-badge' }, [`Obj. ${pr.tempo.target} BPM`]),
        stats?.bestBpm > 0
          ? el('span', { className: 'm3-badge m3-badge--success' }, [
              `Mejor: ${stats.bestBpm} BPM · ${stats.repetitions} rep.`
            ])
          : null,
        this._vm.sessionRepetitions.value > 0
          ? el('span', { className: 'm3-badge m3-badge--tertiary' }, [
              `Sesión: ${this._vm.sessionRepetitions.value} vuelta${this._vm.sessionRepetitions.value === 1 ? '' : 's'}`
            ])
          : null
      ])
    ]);

    const actions = el('div', { className: 'm3-chip-row' }, [
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--tonal',
          ripple: true,
          onClick: () => this._vm.editCurrent()
        },
        [icon(pr.isReadOnly ? 'copy' : 'edit', 18), pr.isReadOnly ? 'Duplicar y editar' : 'Editar']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--outlined',
          ripple: true,
          onClick: () => this._vm.logManualRepetition()
        },
        [icon('check', 18), 'Registrar vuelta']
      )
    ]);

    this._headerCard.appendChild(info);
    this._headerCard.appendChild(actions);

    this._renderViewBar();

    // Objetivos y notas de estudio
    this._guidesCard.innerHTML = '';
    this._guidesCard.appendChild(el('h3', { className: 'm3-title-md' }, ['Guía de estudio']));
    if (pr.notes) {
      this._guidesCard.appendChild(el('p', { className: 'm3-body-md', style: 'margin-top:6px' }, [pr.notes]));
    }
    if (pr.goals.length > 0) {
      this._guidesCard.appendChild(
        el(
          'ul',
          { className: 'goals-list' },
          pr.goals.map((g) => el('li', {}, [g]))
        )
      );
    }
  }

  /**
   * Renderiza la barra superior de la partitura: botones segmentados de vista, zoom y anotaciones.
   */
  _renderViewBar() {
    if (!this._viewBar) return;
    const pr = this._vm.practice.value;
    const mode = this._vm.viewMode.value;
    const isBass = pr?.instruments?.includes('bajo');

    this._viewBar.innerHTML = '';

    const seg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Modo de vista de notación' },
      ['pentagrama', 'cifrado', 'mixto'].map((m) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(mode === m),
            onClick: () => this._vm.setViewMode(m)
          },
          [NOTATION_VIEW_LABELS[m]]
        )
      )
    );

    const extras = el('div', { className: 'm3-chip-row' }, [
      el(
        'button',
        {
          type: 'button',
          className: 'm3-chip',
          ripple: true,
          'aria-pressed': String(this._vm.showFingerings.value),
          onClick: () => this._vm.toggleFingerings()
        },
        ['Digitaciones']
      ),
      isBass
        ? el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              ripple: true,
              'aria-pressed': String(this._vm.showBassFunctions.value),
              onClick: () => this._vm.toggleBassFunctions()
            },
            ['Funciones (R-3-5-7)']
          )
        : null,
      el('div', { className: 'stepper-inline', role: 'group', 'aria-label': 'Zoom de partitura' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-icon-btn m3-icon-btn--tonal',
            ripple: true,
            'aria-label': 'Alejar partitura',
            onClick: () => this._vm.setZoom(this._vm.zoom.value - 0.1)
          },
          ['−']
        ),
        el('span', { className: 'm3-label' }, [`${Math.round(this._vm.zoom.value * 100)}%`]),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-icon-btn m3-icon-btn--tonal',
            ripple: true,
            'aria-label': 'Acercar partitura',
            onClick: () => this._vm.setZoom(this._vm.zoom.value + 0.1)
          },
          ['+']
        )
      ])
    ]);

    this._viewBar.appendChild(seg);
    this._viewBar.appendChild(extras);
  }

  /**
   * Dibuja la partitura con abcjs (en modos Pentagrama y Mixto) o la grilla de acordes (en modo Cifrado).
   */
  _renderNotationSurface() {
    if (!this._scoreEl || !this._chartEl) return;
    const pr = this._vm.practice.value;
    if (!pr) return;

    const mode = this._vm.viewMode.value;
    const showStaff = mode !== 'cifrado';
    this._scoreEl.style.display = showStaff ? 'block' : 'none';
    this._chartEl.style.display = mode === 'cifrado' ? 'block' : 'none';

    // Siempre renderizamos el pentagrama si está visible para extraer la timeline con nodos SVG
    if (showStaff) {
      const width = this._scoreEl.clientWidth || 680;
      this._lastScoreWidth = width;
      const { visualObj } = this._abc.renderScore(this._scoreEl, this._vm.renderableAbc.value, {
        width,
        zoom: this._vm.zoom.value
      });
      const timeline = this._abc.extractTimeline(visualObj, this._vm.transposedAbc.value, {
        isBass: pr.instruments.includes('bajo'),
        timeSignature: pr.timeSignature
      });
      this._vm.registerVisualTimeline(timeline);
    }

    if (mode === 'cifrado') {
      this._renderChordChart();
    }
  }

  /**
   * Renderiza la vista de Cifrado (grilla de compases estilo lead sheet / chart).
   */
  _renderChordChart() {
    const ex = this._vm.exercise.value;
    const notation = this._appVm.settings.value.chordNotation;
    const activeM = this._vm.activeMeasure.value;
    this._chartEl.innerHTML = '';

    if (!ex || ex.measures.length === 0) {
      this._chartEl.appendChild(el('p', { className: 'm3-body-md' }, ['Esta práctica no tiene compases detectables.']));
      return;
    }

    if (!ex.hasChords) {
      this._chartEl.appendChild(
        el('p', { className: 'm3-body-md', style: 'margin-bottom:12px' }, [
          'Esta práctica es de lectura pura sin cifrado explícito; se muestran los compases y la tonalidad.'
        ])
      );
    }

    const grid = el(
      'div',
      { className: 'chord-chart-grid' },
      ex.measures.map((m) => {
        const chords = m.chords.length > 0 ? m.chords.map((c) => formatChordSymbol(c, notation)) : ['%'];
        return el(
          'div',
          {
            className: `chord-bar-cell ${m.index === activeM ? 'chord-bar-cell--active' : ''}`,
            dataset: { measure: m.index }
          },
          [
            el('span', { className: 'chord-bar-cell__num' }, [String(m.index)]),
            el(
              'div',
              { className: 'chord-bar-cell__chords' },
              chords.map((c) => el('span', {}, [c]))
            )
          ]
        );
      })
    );
    this._chartEl.appendChild(grid);
  }

  /**
   * Construye la barra de transporte principal (FAB Reproducir/Pausar, Detener, Tempo BPM).
   */
  _buildTransportCard() {
    this._playFab = el(
      'button',
      {
        type: 'button',
        className: 'm3-fab m3-fab--primary',
        ripple: true,
        'aria-label': 'Reproducir práctica',
        onClick: () => this._vm.togglePlay()
      },
      [icon('play', 24), el('span', {}, ['Reproducir'])]
    );

    const stopBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--tonal',
        ripple: true,
        'aria-label': 'Detener reproducción',
        onClick: () => this._vm.stop()
      },
      [icon('stop', 20), 'Detener']
    );

    this._bpmReadout = el('span', { className: 'bpm-readout' }, [`${this._vm.bpm.value} BPM`]);
    this._bpmSlider = el('input', {
      type: 'range',
      className: 'm3-slider',
      min: 40,
      max: 240,
      step: 1,
      value: this._vm.bpm.value,
      'aria-label': 'Tempo en BPM',
      onInput: (e) => this._vm.setTempo(Number(e.target.value))
    });

    const tempoSteppers = el('div', { className: 'stepper-inline' }, [
      el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Bajar 5 BPM', onClick: () => this._vm.stepTempo(-5) }, ['−5']),
      el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Bajar 1 BPM', onClick: () => this._vm.stepTempo(-1) }, ['−1']),
      this._bpmReadout,
      el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Subir 1 BPM', onClick: () => this._vm.stepTempo(1) }, ['+1']),
      el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Subir 5 BPM', onClick: () => this._vm.stepTempo(5) }, ['+5']),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--text',
          ripple: true,
          onClick: () => {
            const target = this._vm.practice.value?.tempo?.target;
            if (target) this._vm.setTempo(target);
          }
        },
        ['Ir al objetivo']
      )
    ]);

    const bar = el('div', { className: 'transport-bar' }, [
      el('div', { className: 'stepper-inline' }, [this._playFab, stopBtn]),
      tempoSteppers
    ]);

    this._transportCard.innerHTML = '';
    this._transportCard.appendChild(bar);
    this._transportCard.appendChild(el('div', { style: 'margin-top:8px' }, [this._bpmSlider]));
  }

  /**
   * Construye las tarjetas de Bucle/Conteo, Transposición y Mezclador Multi-Voz.
   */
  _buildToolsCards() {
    // 1) Bucle, conteo previo y entrenador de velocidad
    this._loopSwitch = createSwitchRow({
      id: 'player-loop-switch',
      label: 'Bucle de compases',
      checked: this._vm.loopEnabled.value,
      onChange: (checked) => this._vm.setLoop({ enabled: checked })
    });

    this._loopStartInput = el('input', {
      type: 'number',
      min: 1,
      max: 64,
      value: this._vm.loopStartMeasure.value,
      className: 'm3-field__input',
      style: 'padding:8px 10px; min-height:44px; width:74px',
      'aria-label': 'Compás inicial del bucle',
      onChange: (e) => this._vm.setLoop({ start: Number(e.target.value) })
    });
    this._loopEndInput = el('input', {
      type: 'number',
      min: 1,
      max: 64,
      value: this._vm.loopEndMeasure.value,
      className: 'm3-field__input',
      style: 'padding:8px 10px; min-height:44px; width:74px',
      'aria-label': 'Compás final del bucle',
      onChange: (e) => this._vm.setLoop({ end: Number(e.target.value) })
    });

    this._countInSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:44px',
        'aria-label': 'Conteo previo',
        onChange: (e) => this._vm.setCountIn(Number(e.target.value))
      },
      [
        el('option', { value: '0' }, ['Sin conteo previo']),
        el('option', { value: '1' }, ['Conteo: 1 compás']),
        el('option', { value: '2' }, ['Conteo: 2 compases'])
      ]
    );
    this._countInSelect.value = String(this._vm.countInMeasures.value);

    const speedTrainerSwitch = createSwitchRow({
      id: 'player-speed-trainer',
      label: 'Subir BPM en bucle',
      description: 'Aumenta gradualmente cada 2 vueltas hasta el objetivo',
      checked: this._vm.speedTrainerEnabled.value,
      onChange: (v) => this._vm.setSpeedTrainer({ enabled: v })
    });

    const loopCard = el('div', { className: 'm3-card' }, [
      el('h3', { className: 'm3-title-md', style: 'margin-bottom:8px' }, ['Bucle y conteo']),
      this._loopSwitch.row,
      el('div', { className: 'stepper-inline', style: 'margin:8px 0; flex-wrap:wrap' }, [
        el('span', { className: 'm3-body-md' }, ['Del compás']),
        this._loopStartInput,
        el('span', { className: 'm3-body-md' }, ['al']),
        this._loopEndInput
      ]),
      el('div', { style: 'margin:10px 0' }, [this._countInSelect]),
      speedTrainerSwitch.row
    ]);

    // 2) Transposición e Instrumento de síntesis
    this._transposeReadout = el('strong', { className: 'm3-title-md' }, ['Original (0 st)']);
    this._synthSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:10px 12px; min-height:48px',
        'aria-label': 'Instrumento de síntesis',
        onChange: (e) => this._vm.setSynthInstrument(e.target.value)
      },
      Object.entries(SYNTH_INSTRUMENT_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
    );
    this._synthSelect.value = this._vm.synthInstrument.value;

    const transposeCard = el('div', { className: 'm3-card' }, [
      el('h3', { className: 'm3-title-md', style: 'margin-bottom:10px' }, ['Transposición y timbre']),
      el('div', { className: 'stepper-inline', style: 'margin-bottom:12px; flex-wrap:wrap' }, [
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Bajar medio tono', onClick: () => this._vm.transpose(this._vm.transposeSemitones.value - 1) }, ['−½']),
        this._transposeReadout,
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Subir medio tono', onClick: () => this._vm.transpose(this._vm.transposeSemitones.value + 1) }, ['+½']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--text', ripple: true, onClick: () => this._vm.resetTranspose() }, ['Original'])
      ]),
      el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Instrumento de síntesis (offline)']),
      this._synthSelect
    ]);

    // 3) Mezclador de voces independientes (Melodía, Acordes, Bajo, Metrónomo)
    const chordsToggle = createSwitchRow({
      id: 'player-chords-toggle',
      label: 'Acompañamiento de acordes',
      checked: this._vm.chordsEnabled.value,
      onChange: (v) => this._vm.setChordsEnabled(v)
    });
    const metroToggle = createSwitchRow({
      id: 'player-metro-toggle',
      label: 'Metrónomo durante la práctica',
      checked: this._vm.metronomeEnabled.value,
      onChange: (v) => this._vm.setMetronomeEnabled(v)
    });

    const melodySlider = createSliderGroup({
      id: 'vol-melody',
      label: 'Melodía / Voz principal',
      min: 0,
      max: 100,
      value: Math.round(this._vm.melodyVolume.value * 100),
      formatValue: (v) => `${v}%`,
      onInput: (v) => this._vm.setVolumes({ melody: v / 100 })
    });
    const chordsSlider = createSliderGroup({
      id: 'vol-chords',
      label: 'Acordes',
      min: 0,
      max: 100,
      value: Math.round(this._vm.chordsVolume.value * 100),
      formatValue: (v) => `${v}%`,
      onInput: (v) => this._vm.setVolumes({ chords: v / 100 })
    });
    const bassSlider = createSliderGroup({
      id: 'vol-bass',
      label: 'Bajo',
      min: 0,
      max: 100,
      value: Math.round(this._vm.bassVolume.value * 100),
      formatValue: (v) => `${v}%`,
      onInput: (v) => this._vm.setVolumes({ bass: v / 100 })
    });
    const metroSlider = createSliderGroup({
      id: 'vol-metro',
      label: 'Clic del metrónomo',
      min: 0,
      max: 100,
      value: Math.round(this._vm.metronomeVolume.value * 100),
      formatValue: (v) => `${v}%`,
      onInput: (v) => this._vm.setVolumes({ metronome: v / 100 })
    });

    const mixerCard = el('div', { className: 'm3-card' }, [
      el('h3', { className: 'm3-title-md', style: 'margin-bottom:8px' }, ['Mezclador de voces']),
      chordsToggle.row,
      metroToggle.row,
      melodySlider.wrap,
      chordsSlider.wrap,
      bassSlider.wrap,
      metroSlider.wrap
    ]);

    this._practiceToolsGrid.innerHTML = '';
    this._practiceToolsGrid.appendChild(loopCard);
    this._practiceToolsGrid.appendChild(transposeCard);
    this._practiceToolsGrid.appendChild(mixerCard);
  }

  /**
   * Sincroniza valores de inputs numéricos, sliders y selects con el estado del ViewModel.
   */
  _syncControlValues() {
    if (!this._bpmSlider) return;
    this._bpmReadout.textContent = `${this._vm.bpm.value} BPM`;
    this._bpmSlider.value = String(this._vm.bpm.value);

    const maxM = Math.max(1, this._vm.measureCount.value);
    this._loopStartInput.max = String(maxM);
    this._loopEndInput.max = String(maxM);
    this._loopStartInput.value = String(this._vm.loopStartMeasure.value);
    this._loopEndInput.value = String(this._vm.loopEndMeasure.value);
    this._loopSwitch.input.checked = this._vm.loopEnabled.value;

    this._synthSelect.value = this._vm.synthInstrument.value;
    const semi = this._vm.transposeSemitones.value;
    const keyLabel = formatKeyName(this._vm.transposedKey.value, this._appVm.settings.value.chordNotation);
    this._transposeReadout.textContent = semi === 0 ? `${keyLabel} (Original)` : `${keyLabel} (${semi > 0 ? '+' : ''}${semi} st)`;
  }

  /**
   * Actualiza ícono y etiqueta del botón FAB Reproducir / Pausar.
   */
  _syncPlayButton() {
    if (!this._playFab) return;
    const playing = this._vm.isPlaying.value;
    this._playFab.innerHTML = '';
    this._playFab.appendChild(icon(playing ? 'pause' : 'play', 24));
    this._playFab.appendChild(el('span', {}, [playing ? 'Pausar' : this._vm.isPaused.value ? 'Reanudar' : 'Reproducir']));
    this._playFab.setAttribute('aria-label', playing ? 'Pausar práctica' : 'Reproducir práctica');
  }

  /**
   * Muestra u oculta el indicador visual del conteo previo.
   * @param {{ beat: number, totalBeats: number }|null} status Estado del conteo.
   */
  _renderCountIn(status) {
    if (!this._countInEl) return;
    if (!status) {
      this._countInEl.style.display = 'none';
      return;
    }
    this._countInEl.style.display = 'flex';
    this._countInEl.textContent = `Conteo previo: ${status.beat} / ${status.totalBeats}`;
  }

  /**
   * Resalta en tiempo real los elementos SVG de la nota que suena y realiza scroll suave automático.
   * @param {object|null} noteEvent Evento de nota emitido por AudioSynthService.
   */
  _highlightActiveNote(noteEvent) {
    for (const node of this._highlightedSvgNodes) {
      node.classList?.remove('acordate-note-active');
    }
    this._highlightedSvgNodes = [];

    if (!noteEvent || !Array.isArray(noteEvent.svgElements) || noteEvent.svgElements.length === 0) {
      return;
    }

    for (const node of noteEvent.svgElements) {
      if (node && node.classList) {
        node.classList.add('acordate-note-active');
        this._highlightedSvgNodes.push(node);
      }
    }

    const anchor = noteEvent.svgElements[0];
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      anchor.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reduced ? 'auto' : 'smooth'
      });
    }
  }

  /**
   * Resalta el compás activo dentro de la grilla de Cifrado cuando está visible.
   * @param {number} measureIndex Número de compás (1-based).
   */
  _highlightActiveChartBar(measureIndex) {
    if (!this._chartEl || this._vm.viewMode.value !== 'cifrado') return;
    const cells = this._chartEl.querySelectorAll('.chord-bar-cell');
    cells.forEach((cell) => {
      const isMatch = Number(cell.dataset.measure) === measureIndex;
      cell.classList.toggle('chord-bar-cell--active', isMatch);
      if (isMatch) {
        cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
}
