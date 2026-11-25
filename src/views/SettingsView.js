import { INSTRUMENT_LABELS, METRONOME_SOUND_LABELS } from '../core/i18n.js';
import { SEED_COLOR_PRESETS } from '../models/Settings.js';
import { openNotationGuideModal } from './NotationGuideModal.js';
import { createSliderGroup, createSwitchRow, el, icon, openModalDialog } from './uiHelpers.js';

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

    const pianoTuningRow = el(
      'div',
      { className: 'tuning-row', role: 'group', 'aria-label': 'Notas de referencia de piano' },
      (tuning.piano || []).map((tone) =>
        el(
          'button',
          {
            type: 'button',
            className: 'tuning-btn',
            ripple: true,
            title: `Escuchar ${tone.desc} en piano (${tone.note} · MIDI ${tone.midi})`,
            'aria-label': `Escuchar ${tone.desc} ${isLatin ? tone.latinLabel : tone.label} (${tone.note})`,
            onClick: () => this._vm.playTuningString('piano', tone.midi)
          },
          [
            el('span', {}, [isLatin ? tone.latinLabel : tone.label]),
            el('small', {}, [`${tone.desc} · ${tone.note}`])
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
      ]),
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px; font-weight:600' }, ['Referencia sonora — Piano (altura real)']),
        pianoTuningRow
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

    const leftHandSwitch = createSwitchRow({
      id: 'set-left-hand',
      label: 'Referencias de mano izquierda',
      description: 'Dedos 0–4, cuerdas (①–⑥), posiciones romanas y dedos 1–5 en clave de Fa (piano)',
      checked: s.showLeftHand,
      onChange: (v) => this._vm.setShowLeftHand(v)
    });

    const rightHandSwitch = createSwitchRow({
      id: 'set-right-hand',
      label: 'Referencias de mano derecha',
      description: 'Dedos p, i, m, a, rasgueos (↓ ↑) y dedos 1–5 en clave de Sol (piano)',
      checked: s.showRightHand,
      onChange: (v) => this._vm.setShowRightHand(v)
    });

    const chordsOnScoreSwitch = createSwitchRow({
      id: 'set-chords-score',
      label: 'Cifrado de acordes sobre la partitura',
      description: 'Muestra los símbolos de acorde encima del pentagrama (en modo Mixto)',
      checked: s.showChordsOnScore,
      onChange: (v) => this._vm.setShowChordsOnScore(v)
    });

    const otherAnnSwitch = createSwitchRow({
      id: 'set-other-ann',
      label: 'Otras anotaciones y análisis',
      description: 'Grados romanos (I, ii, V7) y marcas textuales de estudio',
      checked: s.showOtherAnnotations,
      onChange: (v) => this._vm.setShowOtherAnnotations(v)
    });

    const bassFnSwitch = createSwitchRow({
      id: 'set-bass-fn',
      label: 'Funciones armónicas en bajo',
      description: 'Muestra R, 3, 5, 7 y aproximaciones cromáticas sobre el walking bass',
      checked: s.showBassFunctions,
      onChange: (v) => this._vm.setShowBassFunctions(v)
    });

    const notationCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Notación y referencias en partitura']),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--compact m3-btn--outlined',
            ripple: true,
            onClick: () => openNotationGuideModal()
          },
          [icon('help', 16), 'Guía de símbolos']
        )
      ]),
      notationSeg,
      el('div', {}, [
        el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Instrumento principal']),
        instSelect
      ]),
      leftHandSwitch.row,
      rightHandSwitch.row,
      chordsOnScoreSwitch.row,
      otherAnnSwitch.row,
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

    const syncSlider = createSliderGroup({
      id: 'set-av-offset',
      label: 'Sincronización visual vs. audio',
      min: -200,
      max: 250,
      step: 10,
      value: s.audioVisualOffsetMs ?? 0,
      formatValue: (v) => (v === 0 ? '0 ms (Auto)' : `${v > 0 ? '+' : ''}${v} ms`),
      onInput: (v) => this._vm.setAudioVisualOffsetMs(v)
    });

    const deviceCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Metrónomo y dispositivo']),
      wakeLockSwitch.row,
      el('div', {}, [
        syncSlider.wrap,
        el('div', { className: 'm3-body-sm', style: 'color:var(--md-sys-color-on-surface-variant); margin-top:4px' }, [
          'La latencia del navegador se compensa automáticamente. Subí el valor (+) si usás auriculares Bluetooth y el resaltado se adelanta al sonido.'
        ])
      ]),
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

    // 5) Acerca de, privacidad y licencias
    const openLicenseModal = () => {
      openModalDialog({
        title: 'Licencia y derechos de autor',
        content: el('div', { style: 'display:flex; flex-direction:column; gap:10px; line-height:1.5' }, [
          el('p', { className: 'm3-body-md' }, [
            el('strong', {}, ['Licencia Propietaria — Todos los derechos reservados (All Rights Reserved)']),
            el('br'),
            '© 2026 Federico C. Alonso.'
          ]),
          el('p', { className: 'm3-body-sm' }, [
            'El código fuente, diseño, arquitectura, textos pedagógicos y ejercicios originales de Acordate son propiedad exclusiva de su titular. Queda prohibido copiar, modificar, redistribuir o utilizar con fines comerciales sin autorización previa y por escrito.'
          ]),
          el('p', { className: 'm3-body-sm' }, [
            el('strong', {}, ['Contenido musical: ']),
            'las obras históricas del repertorio pertenecen al dominio público y los standards modernos incluyen únicamente secuencias armónicas de estudio (sin melodías ni letras protegidas). Las transcripciones, digitaciones y guías pedagógicas propias de Acordate permanecen protegidas por los derechos reservados.'
          ]),
          el('p', { className: 'm3-body-sm', style: 'color:var(--md-sys-color-on-surface-variant)' }, [
            el('strong', {}, ['Componentes de terceros: ']),
            'renderizado de partituras con abcjs 6.4.4 bajo Licencia MIT (Copyright Paul Rosen & Gregory Dyke).'
          ])
        ]),
        actions: [
          { label: 'Cerrar', variant: 'filled', onClick: (close) => close() }
        ]
      });
    };

    const aboutCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Acerca de Acordate']),
        el('span', { className: 'm3-badge m3-badge--primary' }, ['v1.0.0 · Offline PWA'])
      ]),
      el('p', { className: 'm3-body-md' }, [
        'Privacidad: Acordate funciona 100 % en tu dispositivo (IndexedDB + caché offline), sin cuentas, sin servidores externos y sin telemetría ni rastreo.'
      ]),
      el('div', { style: 'display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:12px; background:var(--md-sys-color-surface-container-low)' }, [
        el('strong', { className: 'm3-label' }, ['Licencia y derechos de autor']),
        el('p', { className: 'm3-body-sm', style: 'margin:0' }, [
          'Licencia Propietaria — Todos los derechos reservados · © 2026 Federico C. Alonso.'
        ]),
        el('p', { className: 'm3-body-sm', style: 'margin:0; color:var(--md-sys-color-on-surface-variant)' }, [
          'Prohibida su copia, redistribución o uso comercial sin permiso escrito. Repertorio: obras de dominio público y cifrados armónicos de estudio. Motor de partituras: abcjs 6.4.4 (Licencia MIT).'
        ])
      ]),
      el('div', {}, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--compact m3-btn--outlined',
            ripple: true,
            onClick: openLicenseModal
          },
          ['Ver licencia completa']
        )
      ])
    ]);

    this._container.appendChild(
      el('div', { className: 'settings-layout' }, [tuningCard, appearanceCard, notationCard, deviceCard, aboutCard])
    );
  }
}
