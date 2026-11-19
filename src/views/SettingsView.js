import { INSTRUMENT_LABELS, METRONOME_SOUND_LABELS } from '../core/i18n.js';
import { SEED_COLOR_PRESETS } from '../models/Settings.js';
import { createSwitchRow, el } from './uiHelpers.js';

/**
 * Vista de Ajustes (#/ajustes).
 * Permite personalizar tema claro/oscuro/automático, color semilla dinámico Material 3,
 * cifrado americano/latino, instrumento inicial, Wake Lock y opciones de partitura/metrónomo.
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
   * Renderiza los controles de preferencias de la aplicación.
   */
  _render() {
    if (!this._container) return;
    const s = this._vm.settings.value;
    this._container.innerHTML = '';

    // 1) Apariencia y Dynamic Color Material 3
    const themeSeg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Tema visual' },
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

    const appearanceCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:14px' }, [
      el('h2', { className: 'm3-title-md' }, ['Apariencia Material 3']),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:8px' }, ['Esquema de color']),
        themeSeg
      ]),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:8px' }, ['Color semilla dinámico']),
        swatches
      ])
    ]);

    // 2) Notación musical e instrumento inicial
    const notationSeg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Sistema de cifrado de acordes' },
      [
        { value: 'americano', label: 'Americano (C, Dm7, G7)' },
        { value: 'latino', label: 'Latino (Do, Rem7, Sol7)' }
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
        style: 'padding:10px 12px; min-height:48px; max-width:300px',
        'aria-label': 'Instrumento inicial',
        onChange: (e) => this._vm.setDefaultInstrument(e.target.value)
      },
      [
        el('option', { value: 'todos' }, ['Todos los instrumentos']),
        ...Object.entries(INSTRUMENT_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
      ]
    );
    instSelect.value = s.defaultInstrument;

    const fingeringsSwitch = createSwitchRow({
      id: 'set-fingerings',
      label: 'Mostrar digitaciones anotadas',
      description: 'Dedos 1-4, cuerdas en círculo y posiciones romanas sobre las notas (nunca tablatura)',
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

    const notationCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:14px' }, [
      el('h2', { className: 'm3-title-md' }, ['Notación y práctica']),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:8px' }, ['Cifrado de acordes']),
        notationSeg
      ]),
      el('div', {}, [
        el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Filtro de instrumento al abrir']),
        instSelect
      ]),
      fingeringsSwitch.row,
      bassFnSwitch.row
    ]);

    // 3) Audio, metrónomo y pantalla activa
    const wakeLockSwitch = createSwitchRow({
      id: 'set-wakelock',
      label: 'Mantener pantalla encendida durante la práctica',
      description: 'Usa la Screen Wake Lock API cuando tu dispositivo la soporta',
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

    const deviceCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:14px' }, [
      el('h2', { className: 'm3-title-md' }, ['Audio y dispositivo']),
      wakeLockSwitch.row,
      el('div', { className: 'controls-grid' }, [
        el('div', {}, [
          el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Sonido predeterminado del metrónomo']),
          soundSelect
        ]),
        el('div', {}, [
          el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Conteo previo por defecto']),
          countInSelect
        ])
      ]),
      el('div', { style: 'margin-top:8px' }, [
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
      el('div', { className: 'metronome-layout' }, [appearanceCard, notationCard, deviceCard])
    );
  }
}
