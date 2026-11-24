import { METRONOME_SOUND_LABELS, SUBDIVISION_LABELS } from '../core/i18n.js';
import { METRONOME_TIME_SIGNATURES } from '../viewmodels/MetronomeViewModel.js';
import { createSliderGroup, createSwitchRow, el, icon } from './uiHelpers.js';

/**
 * Vista del Metrónomo independiente (#/metronomo).
 * Muestra pulsos visuales sincronizados con Web Audio API, Tap Tempo, compases irregulares,
 * subdivisiones, sonidos seleccionables, entrenador de velocidad y modo compás silencioso.
 */
export class MetronomeView {
  /**
   * Inicializa la vista con su MetronomeViewModel.
   * @param {import('../viewmodels/MetronomeViewModel.js').MetronomeViewModel} vm ViewModel del metrónomo.
   */
  constructor(vm) {
    /** ViewModel del metrónomo. */
    this._vm = vm;
    /** Suscripciones activas. */
    this._unsubs = [];
    /** Contenedor DOM. */
    this._container = null;
  }

  /**
   * Monta la interfaz Material 3 del metrónomo.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    container.innerHTML = '';

    this._beatVisualizer = el('div', { className: 'beat-visualizer', 'aria-live': 'off' });
    this._barInfo = el('div', { className: 'm3-body-md' }, ['Listo para marcar el pulso']);
    this._bpmHero = el('div', { className: 'm3-display' }, [`${this._vm.bpm.value} BPM`]);
    this._bpmSlider = el('input', {
      type: 'range',
      className: 'm3-slider',
      min: 40,
      max: 240,
      value: this._vm.bpm.value,
      'aria-label': 'Tempo en BPM',
      onInput: (e) => this._vm.setBpm(Number(e.target.value))
    });

    this._toggleFab = el(
      'button',
      {
        type: 'button',
        className: 'm3-fab m3-fab--primary',
        ripple: true,
        onClick: () => this._vm.toggle()
      },
      [icon('play', 24), el('span', {}, ['Iniciar'])]
    );

    this._tapHintEl = el('span', { className: 'm3-body-md' }, [this._vm.tapHint.value]);
    const tapBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--tonal',
        ripple: true,
        onClick: () => this._vm.tapTempo()
      },
      ['Tap Tempo']
    );

    const heroCard = el('div', { className: 'm3-card m3-card--elevated metronome-bpm-hero' }, [
      this._beatVisualizer,
      this._barInfo,
      this._bpmHero,
      el('div', { className: 'metronome-primary-row' }, [this._toggleFab, tapBtn]),
      el('div', { className: 'metronome-step-row' }, [
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, 'aria-label': 'Bajar 5 BPM', title: 'Bajar 5 BPM', onClick: () => this._vm.stepBpm(-5) }, ['−5']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, 'aria-label': 'Bajar 1 BPM', title: 'Bajar 1 BPM', onClick: () => this._vm.stepBpm(-1) }, ['−1']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, 'aria-label': 'Subir 1 BPM', title: 'Subir 1 BPM', onClick: () => this._vm.stepBpm(1) }, ['+1']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, 'aria-label': 'Subir 5 BPM', title: 'Subir 5 BPM', onClick: () => this._vm.stepBpm(5) }, ['+5'])
      ]),
      el('div', { style: 'width:100%; max-width:480px; margin-top:4px' }, [this._bpmSlider]),
      this._tapHintEl
    ]);

    // Compás, subdivisión y sonido
    this._tsChips = el('div', { className: 'm3-chip-row', role: 'group', 'aria-label': 'Compás' });
    this._subSeg = el('div', { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Subdivisión' });

    const accentSwitch = createSwitchRow({
      id: 'metro-accent',
      label: 'Acentuar primer tiempo',
      checked: this._vm.accentFirstBeat.value,
      onChange: (v) => this._vm.setAccentFirstBeat(v)
    });

    const soundSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:10px 12px; min-height:48px',
        'aria-label': 'Sonido del metrónomo',
        onChange: (e) => this._vm.setSoundType(e.target.value)
      },
      Object.entries(METRONOME_SOUND_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
    );
    soundSelect.value = this._vm.soundType.value;

    const volSlider = createSliderGroup({
      id: 'metro-volume',
      label: 'Volumen',
      min: 0,
      max: 100,
      value: Math.round(this._vm.volume.value * 100),
      formatValue: (v) => `${v}%`,
      onInput: (v) => this._vm.setVolume(v / 100)
    });

    const rhythmCard = el('div', { className: 'm3-card' }, [
      el('h2', { className: 'm3-title-md', style: 'margin-bottom:10px' }, ['Compás y subdivisión']),
      this._tsChips,
      el('div', { style: 'margin:14px 0' }, [this._subSeg]),
      accentSwitch.row,
      el('div', { className: 'controls-grid', style: 'margin-top:12px' }, [
        el('div', {}, [
          el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Timbre del clic']),
          soundSelect
        ]),
        volSlider.wrap
      ])
    ]);

    // Entrenador de velocidad y modo compás silencioso
    const trainerSwitch = createSwitchRow({
      id: 'metro-trainer-switch',
      label: 'Entrenador de velocidad',
      description: 'Sube automáticamente el BPM cada cierta cantidad de compases',
      checked: this._vm.speedTrainerEnabled.value,
      onChange: (v) => this._vm.setSpeedTrainer({ enabled: v })
    });

    const stepInput = el('input', {
      type: 'number', min: 1, max: 30, value: this._vm.speedTrainerStepBpm.value,
      className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:82px',
      'aria-label': 'Subir X BPM',
      onChange: (e) => this._vm.setSpeedTrainer({ stepBpm: Number(e.target.value) })
    });
    const everyInput = el('input', {
      type: 'number', min: 1, max: 32, value: this._vm.speedTrainerEveryBars.value,
      className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:82px',
      'aria-label': 'Cada N compases',
      onChange: (e) => this._vm.setSpeedTrainer({ everyBars: Number(e.target.value) })
    });
    const targetInput = el('input', {
      type: 'number', min: 40, max: 240, value: this._vm.speedTrainerTargetBpm.value,
      className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:88px',
      'aria-label': 'BPM objetivo',
      onChange: (e) => this._vm.setSpeedTrainer({ targetBpm: Number(e.target.value) })
    });

    const trainerCard = el('details', { className: 'm3-collapsible' }, [
      el('summary', {}, [el('span', {}, ['Entrenador de velocidad']), icon('chevronDown', 20)]),
      el('div', { className: 'm3-collapsible__content' }, [
        trainerSwitch.row,
        el('div', { className: 'stepper-inline', style: 'margin-top:6px' }, [
          el('span', { className: 'm3-body-md' }, ['Subir']),
          stepInput,
          el('span', { className: 'm3-body-md' }, ['BPM cada']),
          everyInput,
          el('span', { className: 'm3-body-md' }, ['compases hasta']),
          targetInput,
          el('span', { className: 'm3-body-md' }, ['BPM'])
        ])
      ])
    ]);

    const silentSwitch = createSwitchRow({
      id: 'metro-silent-switch',
      label: 'Activar compás silencioso',
      description: 'Silencia el clic periódicamente para entrenar tu pulso interno',
      checked: this._vm.silentBarEnabled.value,
      onChange: (v) => this._vm.setSilentBars({ enabled: v })
    });
    const playBarsInput = el('input', {
      type: 'number', min: 1, max: 16, value: this._vm.silentPlayBars.value,
      className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:76px',
      'aria-label': 'Compases audibles',
      onChange: (e) => this._vm.setSilentBars({ playBars: Number(e.target.value) })
    });
    const muteBarsInput = el('input', {
      type: 'number', min: 1, max: 8, value: this._vm.silentMuteBars.value,
      className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:76px',
      'aria-label': 'Compases silenciosos',
      onChange: (e) => this._vm.setSilentBars({ muteBars: Number(e.target.value) })
    });

    const silentCard = el('details', { className: 'm3-collapsible' }, [
      el('summary', {}, [el('span', {}, ['Modo compás silencioso']), icon('chevronDown', 20)]),
      el('div', { className: 'm3-collapsible__content' }, [
        silentSwitch.row,
        el('div', { className: 'stepper-inline', style: 'margin-top:6px' }, [
          el('span', { className: 'm3-body-md' }, ['Sonar']),
          playBarsInput,
          el('span', { className: 'm3-body-md' }, ['compases y silenciar']),
          muteBarsInput
        ])
      ])
    ]);

    const layout = el('div', { className: 'metronome-layout' }, [
      heroCard,
      rhythmCard,
      el('div', { className: 'controls-grid' }, [trainerCard, silentCard])
    ]);
    container.appendChild(layout);

    this._unsubs = [
      this._vm.bpm.subscribe((b) => {
        this._bpmHero.textContent = `${b} BPM`;
        this._bpmSlider.value = String(b);
      }),
      this._vm.isRunning.subscribe((running) => {
        this._toggleFab.innerHTML = '';
        this._toggleFab.appendChild(icon(running ? 'stop' : 'play', 24));
        this._toggleFab.appendChild(el('span', {}, [running ? 'Detener' : 'Iniciar']));
        if (!running) this._barInfo.textContent = 'Listo para marcar el pulso';
      }),
      this._vm.currentBeat.subscribe(() => this._renderBeats()),
      this._vm.totalBeats.subscribe(() => this._renderBeats()),
      this._vm.isMutedBar.subscribe(() => this._renderBeats()),
      this._vm.timeSignature.subscribe(() => this._renderSelectors()),
      this._vm.subdivision.subscribe(() => this._renderSelectors()),
      this._vm.tapHint.subscribe((h) => {
        this._tapHintEl.textContent = h;
      })
    ];

    this._renderSelectors();
    this._renderBeats();
  }

  /**
   * Detiene el metrónomo si sigue corriendo al abandonar la pantalla y libera suscripciones.
   */
  unmount() {
    this._vm.stop();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Renderiza los chips de compás y los botones segmentados de subdivisión.
   */
  _renderSelectors() {
    this._tsChips.innerHTML = '';
    for (const ts of METRONOME_TIME_SIGNATURES) {
      this._tsChips.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(this._vm.timeSignature.value === ts),
            onClick: () => this._vm.setTimeSignature(ts)
          },
          [ts]
        )
      );
    }

    this._subSeg.innerHTML = '';
    for (const [val, label] of Object.entries(SUBDIVISION_LABELS)) {
      this._subSeg.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.subdivision.value === Number(val)),
            onClick: () => this._vm.setSubdivision(Number(val))
          },
          [label]
        )
      );
    }
  }

  /**
   * Dibuja los círculos visuales de cada pulso del compás destacando el pulso activo o silenciado.
   */
  _renderBeats() {
    const total = this._vm.totalBeats.value;
    const active = this._vm.currentBeat.value;
    const muted = this._vm.isMutedBar.value;

    this._beatVisualizer.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const isActive = i === active;
      let cls = 'beat-dot';
      if (isActive && muted) cls += ' beat-dot--muted';
      else if (isActive && i === 1 && this._vm.accentFirstBeat.value) cls += ' beat-dot--active beat-dot--accent';
      else if (isActive) cls += ' beat-dot--active';

      this._beatVisualizer.appendChild(el('div', { className: cls }, [String(i)]));
    }

    if (this._vm.isRunning.value) {
      this._barInfo.textContent = muted
        ? `Compás ${this._vm.barCounter.value} — Compás silencioso (mantené tu tiempo interno)`
        : `Compás ${this._vm.barCounter.value} · Pulso ${active}/${total}`;
    }
  }
}
