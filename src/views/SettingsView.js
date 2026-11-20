import { INSTRUMENT_LABELS, METRONOME_SOUND_LABELS } from '../core/i18n.js';
import { SEED_COLOR_PRESETS } from '../models/Settings.js';
import { createSwitchRow, el } from './uiHelpers.js';

/**
 * Vista de Ajustes (#/ajustes).
 * Incluye apariencia Material 3, cifrado americano/latino, registro de escucha (real / +1 octava),
 * referencia de afinación de cuerdas al aire (guitarra y bajo), Wake Lock y valores por defecto.
 */
export class SettingsView {
  /**
   * Construye la vista con su SettingsViewModel.
   * @param {import('../viewmodels/SettingsViewModel.js').SettingsViewModel} vm ViewModel de ajustes.
   */
  constructor(vm) {
    /** ViewModel de ajustes. */
    this._vm = vm;
    /** Suscripción activa al observable de ajustes. */
    this._unsub = null;
    /** Contenedor DOM. */
    this._container = null;
  }

  /**
   * Monta la vista de ajustes dentro del contenedor.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    this._unsub = this._vm.settings.subscribe(() => this._render());
    this._render();
  }

  /**
   * Libera la suscripción al desmontar.
   */
  unmount() {
    this._unsub?.();
    this._unsub = null;
    this._container = null;
  }

  /**
   * Renderiza las tarjetas de preferencias, registro de escucha y referencia de afinación.
   */
  _render() {
    if (!this._container) return;
    const s = this._vm.settings.value;
    const tuning = this._vm.getTuningReferenceStrings();
    const isLatin = s.chordNotation === 'latino';
    this._container.innerHTML = '';

    // 1) Audio, registro de escucha y Referencia de afinación
    const registerSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Registro de escucha' },
      [
        { value: 'real', label: 'Real (estándar)' },
        { value: '+1oct', label: '+1 octava (celular)' }
      ].map((opt) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(s.listeningRegister === opt.value),
            onClick: () => this._vm.setListeningRegister(opt.value)
          },
          [opt.label]
        )
      )
    );

    const guitarTuningRow = el(
      'div',
      { className: 'tuning-row', role: 'group', 'aria-label': 'Cuerdas al aire de guitarra' },
      tuning.guitar.map((str) =>
        el(
          'button',
          {
            type: 'button',
            className: 'tuning-btn',
            ripple: true,
            title: `Escuchar cuerda ${str.stringNumber}ª de guitarra (${str.note} · MIDI ${str.midi})`,
            'aria-label': `Escuchar cuerda ${str.stringNumber}ª de guitarra ${isLatin ? str.latinLabel : str.label} (${str.note})`,
            onClick: () => this._vm.playTuningString('guitarra', str.midi)
          },
          [
            el('span', {}, [isLatin ? str.latinLabel : str.label]),
            el('small', {}, [`${str.stringNumber}ª · ${str.note}`])
          ]
        )
      )
    );

    const bassTuningRow = el(
      'div',
      { className: 'tuning-row', role: 'group', 'aria-label': 'Cuerdas al aire de bajo' },
      tuning.bass.map((str) =>
        el(
          'button',
          {
            type: 'button',
            className: 'tuning-btn',
            ripple: true,
            title: `Escuchar cuerda ${str.stringNumber}ª de bajo (${str.note} · MIDI ${str.midi})`,
            'aria-label': `Escuchar cuerda ${str.stringNumber}ª de bajo ${isLatin ? str.latinLabel : str.label} (${str.note})`,
            onClick: () => this._vm.playTuningString('bajo', str.midi)
          },
          [
            el('span', {}, [isLatin ? str.latinLabel : str.label]),
            el('small', {}, [`${str.stringNumber}ª · ${str.note}`])
          ]
        )
      )
    );

    const tuningCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Afinación y registro de escucha']),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px' }, [
          'Registro de escucha (usá +1 octava si el bajo casi no se oye en el parlante del celular)'
        ]),
        registerSeg
      ]),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px; font-weight:600' }, ['Referencia de afinación — Guitarra (6ª a 1ª)']),
        guitarTuningRow
      ]),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px; font-weight:600' }, ['Referencia de afinación — Bajo (4ª a 1ª)']),
        bassTuningRow
      ])
    ]);

    // 2) Apariencia Material 3
    const themeSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Tema visual' },
      [
        { value: 'auto', label: 'Automático' },
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' }
      ].map((opt) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(s.theme === opt.value),
            onClick: () => this._vm.setTheme(opt.value)
          },
          [opt.label]
        )
      )
    );

    const colorInput = el('input', {
      type: 'color',
      value: s.seedColor,
      'aria-label': 'Elegir color semilla personalizado',
      style: 'width:48px; height:48px; border:none; border-radius:50%; cursor:pointer; background:transparent',
      onInput: (e) => this._vm.setSeedColor(e.target.value)
    });

    const swatches = el('div', { className: 'color-swatch-row' }, [
      ...SEED_COLOR_PRESETS.map((preset) =>
        el('button', {
          type: 'button',
          className: 'color-swatch',
          style: `background:${preset.hex}`,
          title: preset.name,
          'aria-label': `Color semilla ${preset.name}`,
          'aria-pressed': String(s.seedColor.toLowerCase() === preset.hex.toLowerCase()),
          onClick: () => this._vm.setSeedColor(preset.hex)
        })
      ),
      colorInput
    ]);

    const appearanceCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Apariencia Material 3']),
      themeSeg,
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px' }, ['Color semilla dinámico']),
        swatches
      ])
    ]);

    // 3) Notación musical
    const notationSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Sistema de cifrado de acordes' },
      [
        { value: 'americano', label: 'Americano (C, Dm7)' },
        { value: 'latino', label: 'Latino (Do, Rem7)' }
      ].map((opt) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(s.chordNotation === opt.value),
            onClick: () => this._vm.setChordNotation(opt.value)
          },
          [opt.label]
        )
      )
    );

    const instSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:10px 12px; min-height:48px',
        'aria-label': 'Instrumento activo',
        onChange: (e) => this._vm.setDefaultInstrument(e.target.value)
      },
      Object.entries(INSTRUMENT_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
    );
    instSelect.value = s.defaultInstrument;

    const fingeringsSwitch = createSwitchRow({
      id: 'set-fingerings',
      label: 'Mostrar digitaciones anotadas',
      description: 'Dedos 1-4, cuerdas y posiciones sobre la nota (nunca tablatura)',
      checked: s.showFingerings,
      onChange: (v) => this._vm.setShowFingerings(v)
    });

    const bassFnSwitch = createSwitchRow({
      id: 'set-bass-fn',
      label: 'Funciones armónicas en bajo',
      description: 'Muestra R, 3, 5, 7 y aproximaciones cromáticas sobre el walking bass',
      checked: s.showBassFunctions,
      onChange: (v) => this._vm.setShowBassFunctions(v)
    });

    const notationCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Notación y práctica']),
      notationSeg,
      el('div', {}, [
        el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Instrumento principal']),
        instSelect
      ]),
      fingeringsSwitch.row,
      bassFnSwitch.row
    ]);

    // 4) Dispositivo y metrónomo
    const wakeLockSwitch = createSwitchRow({
      id: 'set-wakelock',
      label: 'Mantener pantalla encendida al practicar',
      description: 'Usa la Screen Wake Lock API mientras reproducís',
      checked: s.wakeLockEnabled,
      onChange: (v) => this._vm.setWakeLockEnabled(v)
    });

    const soundSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:10px 12px; min-height:48px',
        'aria-label': 'Sonido del metrónomo',
        onChange: (e) => this._vm.setMetronomeSound(e.target.value)
      },
      Object.entries(METRONOME_SOUND_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
    );
    soundSelect.value = s.metronomeSound;

    const countInSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:10px 12px; min-height:48px',
        'aria-label': 'Conteo previo predeterminado',
        onChange: (e) => this._vm.setCountInMeasures(Number(e.target.value))
      },
      [
        el('option', { value: '0' }, ['Sin conteo previo']),
        el('option', { value: '1' }, ['1 compás']),
        el('option', { value: '2' }, ['2 compases'])
      ]
    );
    countInSelect.value = String(s.countInMeasures);

    const deviceCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Metrónomo y dispositivo']),
      wakeLockSwitch.row,
      el('div', { className: 'controls-grid' }, [
        el('div', {}, [
          el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Timbre del metrónomo']),
          soundSelect
        ]),
        el('div', {}, [
          el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Conteo previo por defecto']),
          countInSelect
        ])
      ]),
      el('div', { style: 'margin-top:4px' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--outlined',
            ripple: true,
            onClick: () => this._vm.resetDefaults()
          },
          ['Restablecer ajustes predeterminados']
        )
      ])
    ]);

    this._container.appendChild(
      el('div', { className: 'settings-layout' }, [tuningCard, appearanceCard, notationCard, deviceCard])
    );
  }
}
