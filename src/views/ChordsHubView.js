import { INSTRUMENT_LABELS, formatChordSymbol } from '../core/i18n.js';
import { ALL_KEYS } from '../core/MusicTheory.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { PRESET_TUNINGS } from '../models/Tuning.js';
import { INVERSION_LABELS } from '../models/Voicing.js';
import { HARMONIC_FIELD_SHORTCUTS } from '../services/HarmonyService.js';
import {
  createBassFretboardMapElement,
  createChordDiagramElement,
  createVoiceLeadingConnector
} from './ChordDiagramView.js';
import { el, icon } from './uiHelpers.js';

/**
 * Pestañas del módulo Acordes (#/acordes).
 */
const CHORDS_TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'campo', label: 'Campo armónico' },
  { id: 'cambios', label: 'Cambios y voces' },
  { id: 'oido', label: 'Oído' }
];

/**
 * Pares de acordes predefinidos para acceso rápido en el Entrenador de Cambios.
 */
const TRAINER_PRESETS = [
  { label: 'G – C', chords: ['G', 'C'] },
  { label: 'C – Am', chords: ['C', 'Am'] },
  { label: 'Am – Em', chords: ['Am', 'Em'] },
  { label: 'D – A', chords: ['D', 'A'] },
  { label: 'F – G7', chords: ['F', 'G7'] },
  { label: 'Dm7 – G7 – Cmaj7', chords: ['Dm7', 'G7', 'Cmaj7'] }
];

/**
 * Vista del módulo de Armonía (#/acordes): Biblioteca de Acordes, Explorador de Campo Armónico,
 * Entrenador de Cambios (CPM) + Conducción de Voces + Inversiones, y Entrenamiento de Oído.
 */
export class ChordsHubView {
  /**
   * Construye la vista inyectando ChordsHubViewModel, AppViewModel y AbcService.
   * @param {import('../viewmodels/ChordsHubViewModel.js').ChordsHubViewModel} vm ViewModel de armonía.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel global.
   * @param {import('../services/AbcService.js').AbcService} abcService Servicio para dibujar acorde en pentagrama.
   */
  constructor(vm, appVm, abcService) {
    /** ViewModel del módulo Acordes. */
    this._vm = vm;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Servicio abcjs para alternar Diagrama / Pentagrama / Ambos. */
    this._abc = abcService;
    /** Contenedor DOM. */
    this._container = null;
    /** Suscripciones activas. */
    this._unsubs = [];
  }

  /**
   * Monta la vista de Acordes en el contenedor.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    container.innerHTML = '';

    this._tabsBar = el('div', { className: 'm3-segmented m3-segmented--full', role: 'tablist', style: 'margin-bottom:14px' });
    this._panelHost = el('div', { className: 'route-stack' });
    container.append(this._tabsBar, this._panelHost);

    this._unsubs = [
      this._vm.activeTab.subscribe(() => this._renderAll()),
      this._vm.instrument.subscribe(() => this._renderPanel()),
      this._vm.tuningId.subscribe(() => this._renderPanel()),
      this._vm.activeChord.subscribe(() => this._renderPanel()),
      this._vm.voicingsList.subscribe(() => this._renderPanel()),
      this._vm.activeVoicingIndex.subscribe(() => this._renderPanel()),
      this._vm.diagramViewMode.subscribe(() => this._renderPanel()),
      this._vm.labelMode.subscribe(() => this._renderPanel()),
      this._vm.leftHanded.subscribe(() => this._renderPanel()),
      this._vm.playMode.subscribe(() => this._renderPanel()),
      this._vm.diatonicField.subscribe(() => this._renderPanel()),
      this._vm.builderChords.subscribe(() => this._renderPanel()),
      this._vm.voiceLedSequence.subscribe(() => this._renderPanel()),
      this._vm.inversionStringSet.subscribe(() => this._renderPanel()),
      this._vm.trainerChords.subscribe(() => this._renderPanel()),
      this._vm.trainerRunning.subscribe(() => this._renderPanel()),
      this._vm.trainerStepIndex.subscribe(() => this._renderPanel()),
      this._vm.trainerCurrentBeat.subscribe(() => this._renderPanel()),
      this._vm.earLevel.subscribe(() => this._renderPanel()),
      this._vm.earQuestion.subscribe(() => this._renderPanel()),
      this._vm.earSelectedId.subscribe(() => this._renderPanel()),
      this._vm.earScore.subscribe(() => this._renderPanel()),
      this._appVm.settings.subscribe(() => this._renderPanel()),
      this._appVm.progress.subscribe(() => this._renderPanel())
    ];

    this._renderAll();
  }

  /**
   * Abre una pestaña específica al navegar por ruta hash (#/acordes/:tab).
   * @param {string} tab Nombre de pestaña.
   */
  openTab(tab) {
    if (tab) this._vm.setActiveTab(tab);
  }

  /**
   * Detiene el entrenador de cambios si estaba corriendo y libera suscripciones.
   */
  unmount() {
    this._vm.stopChangeTrainer();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Renderiza la barra de pestañas y el panel activo.
   */
  _renderAll() {
    if (!this._tabsBar) return;
    const active = this._vm.activeTab.value;
    this._tabsBar.innerHTML = '';
    for (const tab of CHORDS_TABS) {
      this._tabsBar.appendChild(
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: 'm3-segmented__btn',
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
    if (tab === 'biblioteca') this._renderLibraryTab();
    else if (tab === 'campo') this._renderFieldTab();
    else if (tab === 'cambios') this._renderTrainerAndVoiceLeadingTab();
    else this._renderEarTab();
  }

  /**
   * Pestaña 1: Biblioteca de acordes con grilla de raíces, calidades, carrusel de voicings,
   * mapa de diapasón para bajo, vista Diagrama/Pentagrama/Ambos y generador de sugerencias.
   */
  _renderLibraryTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const chord = this._vm.activeChord.value;
    const tuning = this._vm.activeTuning.value;
    const isBass = this._vm.instrument.value === 'bajo';
    const voicings = this._vm.voicingsList.value;
    const safeIdx = Math.min(this._vm.activeVoicingIndex.value, Math.max(0, voicings.length - 1));
    const currentVoicing = voicings[safeIdx] || null;
    const isFav = this._appVm.progress.value.favoriteChords.includes(chord.americanSymbol);

    // Selector de instrumento + afinación
    const instSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Instrumento' },
      ['guitarra-clasica', 'guitarra', 'bajo'].map((inst) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.instrument.value === inst),
            onClick: () => this._vm.setInstrument(inst)
          },
          [inst === 'guitarra-clasica' ? 'Clásica' : INSTRUMENT_LABELS[inst]]
        )
      )
    );

    const tuningOptions = Object.values(PRESET_TUNINGS).filter((t) => t.instrument === (isBass ? 'bass' : 'guitar'));
    const tuningSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:44px',
        'aria-label': 'Afinación',
        onChange: (e) => this._vm.setTuning(e.target.value)
      },
      tuningOptions.map((t) => el('option', { value: t.id, selected: t.id === this._vm.tuningId.value }, [t.name]))
    );
    tuningSelect.value = this._vm.tuningId.value;

    // Grilla de 12 raíces
    const rootsGrid = el(
      'div',
      { className: 'root-grid', role: 'group', 'aria-label': 'Raíz del acorde' },
      ALL_KEYS.map((root) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            style: 'justify-content:center; padding:4px 8px',
            ripple: true,
            'aria-pressed': String(this._vm.selectedRoot.value === root),
            onClick: () => this._vm.selectChord({ root, bass: '' })
          },
          [formatChordSymbol(root, notation)]
        )
      )
    );

    // Selector de calidad agrupado (Tríadas / Séptimas / Extensiones)
    const qualitySelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:48px',
        'aria-label': 'Calidad del acorde',
        onChange: (e) => this._vm.selectChord({ quality: e.target.value })
      },
      this._vm.getAvailableQualities().map((q) =>
        el('option', { value: q.id, selected: q.id === this._vm.selectedQuality.value }, [`${q.shortName} — ${q.name}`])
      )
    );
    qualitySelect.value = this._vm.selectedQuality.value;

    // Filtros secundarios plegables (tipo, inversión, rango de trastes, zurdo, etiquetas)
    const filtersCollapsible = el('details', { className: 'm3-collapsible' }, [
      el('summary', {}, [el('span', {}, ['Filtros y opciones del diagrama']), icon('chevronDown', 18)]),
      el('div', { className: 'm3-collapsible__content' }, [
        el('div', { className: 'controls-grid' }, [
          this._buildMiniSelect('Tipo de voicing', this._vm.voicingTypeFilter.value, [
            { value: 'todos', label: 'Todos los tipos' },
            { value: 'abierto', label: 'Abierto' },
            { value: 'cejilla', label: 'Cejilla' },
            { value: 'triada', label: 'Tríada' },
            { value: 'drop2', label: 'Drop 2' },
            { value: 'shell', label: 'Shell' },
            { value: 'sugerido', label: 'Sugeridos' }
          ], (v) => this._vm.voicingTypeFilter.set(v)),
          this._buildMiniSelect('Inversión', String(this._vm.inversionFilter.value), [
            { value: 'todas', label: 'Todas las inversiones' },
            { value: '0', label: 'Fundamental' },
            { value: '1', label: '1.ª inversión' },
            { value: '2', label: '2.ª inversión' },
            { value: '3', label: '3.ª inversión' }
          ], (v) => this._vm.inversionFilter.set(v === 'todas' ? 'todas' : Number(v))),
          this._buildMiniSelect('Etiquetas en puntos', this._vm.labelMode.value, [
            { value: 'fingers', label: 'Dedos (1–4)' },
            { value: 'functions', label: 'Funciones (R 3 5 7)' },
            { value: 'notes', label: 'Nombres de nota' }
          ], (v) => this._vm.labelMode.set(v)),
          this._buildMiniSelect('Reproducción al tocar', this._vm.playMode.value, [
            { value: 'strum-down', label: 'Rasgueo abajo' },
            { value: 'strum-up', label: 'Rasgueo arriba' },
            { value: 'arpeggio-asc', label: 'Arpegio ascendente' },
            { value: 'arpeggio-pima', label: 'Arpegio p-i-m-a' },
            { value: 'block', label: 'En bloque' }
          ], (v) => this._vm.playMode.set(v))
        ]),
        el('div', { className: 'm3-chip-row' }, [
          el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              ripple: true,
              'aria-pressed': String(this._vm.leftHanded.value),
              onClick: () => this._vm.leftHanded.set(!this._vm.leftHanded.value)
            },
            ['Vista para zurdos']
          ),
          ...['todos', 'abierto', 'medio', 'agudo'].map((rng) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-chip',
                ripple: true,
                'aria-pressed': String(this._vm.fretRangeFilter.value === rng),
                onClick: () => this._vm.fretRangeFilter.set(rng)
              },
              [rng === 'todos' ? 'Todo el mango' : rng === 'abierto' ? 'Trastes 0–4' : rng === 'medio' ? 'Trastes 3–7' : 'Trastes 8+']
            )
          )
        ])
      ])
    ]);

    // Tarjeta principal del acorde seleccionado (notas + intervalos + diagrama/pentagrama + carrusel)
    const notesBadges = chord.getNotesInfo(notation).map((n) =>
      el('span', { className: `m3-badge ${n.label === 'R' ? 'm3-badge--primary' : ''}` }, [`${n.name} (${n.label})`])
    );

    const viewModeSeg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Formato del acorde' },
      [
        { id: 'diagrama', label: 'Diagrama' },
        { id: 'pentagrama', label: 'Pentagrama' },
        { id: 'ambos', label: 'Ambos' }
      ].map((m) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.diagramViewMode.value === m.id),
            onClick: () => this._vm.diagramViewMode.set(m.id)
          },
          [m.label]
        )
      )
    );

    const visualHost = el('div', { className: 'chord-showcase' });
    if (isBass) {
      visualHost.appendChild(
        createBassFretboardMapElement(chord.americanSymbol, {
          tuning,
          notation,
          labelMode: this._vm.labelMode.value === 'notes' ? 'notes' : 'functions'
        })
      );
    }

    if (currentVoicing) {
      const mode = this._vm.diagramViewMode.value;
      if (mode === 'diagrama' || mode === 'ambos') {
        visualHost.appendChild(
          createChordDiagramElement(currentVoicing, {
            tuning,
            notation,
            labelMode: this._vm.labelMode.value,
            leftHanded: this._vm.leftHanded.value,
            size: 'lg',
            showTitle: false,
            onPlay: (v) => this._vm.playVoicing(v)
          })
        );
      }
      if (mode === 'pentagrama' || mode === 'ambos') {
        const staffBox = el('div', { className: 'score-surface', style: 'min-width:200px; flex:1 1 220px' });
        visualHost.appendChild(staffBox);
        setTimeout(() => {
          this._abc.renderScore(staffBox, currentVoicing.toAbcStaff(tuning, notation), { width: 280, zoom: 1.0 });
        }, 0);
      }
    } else if (!isBass) {
      visualHost.appendChild(
        el('p', { className: 'm3-body-md' }, ['No hay digitaciones para ese filtro. Tocá "Generar sugerencias" o limpiá filtros.'])
      );
    }

    // Carrusel de variantes (voicings)
    const carousel = voicings.length > 1
      ? el(
          'div',
          { className: 'voicing-carousel', role: 'list', 'aria-label': 'Variantes del acorde' },
          voicings.map((v, idx) =>
            el(
              'button',
              {
                type: 'button',
                className: `voicing-thumb ${idx === safeIdx ? 'voicing-thumb--active' : ''}`,
                ripple: true,
                onClick: () => {
                  this._vm.activeVoicingIndex.set(idx);
                  this._vm.playVoicing(v);
                }
              },
              [
                el('span', { className: 'm3-label' }, [
                  `${INVERSION_LABELS[v.computeInversion(tuning)] || 'Fund.'} · T${v.baseFret}`
                ]),
                el('span', { className: 'm3-body-md' }, [v.tags.slice(0, 2).join(', ') || (v.suggested ? 'sugerido' : 'forma')])
              ]
            )
          )
        )
      : null;

    const actionsRow = el('div', { className: 'm3-chip-row' }, [
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--filled', ripple: true,
        onClick: () => (currentVoicing ? this._vm.playVoicing(currentVoicing) : this._vm.playChordArpeggio())
      }, [icon('play', 18), 'Escuchar']),
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true,
        onClick: () => this._vm.practiceActiveChord(currentVoicing)
      }, [icon('music', 18), 'Practicar acorde']),
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true,
        onClick: () => this._vm.generateSuggestedVoicings()
      }, [icon('wand', 18), 'Generar voicings']),
      el('button', {
        type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true,
        'aria-label': isFav ? 'Quitar de favoritos' : 'Marcar como favorito',
        onClick: () => this._vm.toggleFavoriteActiveChord()
      }, [icon(isFav ? 'star' : 'starOutline', 22)])
    ]);

    const selectorCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      instSeg,
      el('div', { className: 'controls-grid' }, [qualitySelect, tuningSelect]),
      rootsGrid,
      filtersCollapsible
    ]);

    const detailCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-headline' }, [chord.getSymbol(notation)]),
          el('span', { className: 'm3-body-md' }, [
            `${chord.quality.name}${currentVoicing ? ` · ${INVERSION_LABELS[currentVoicing.computeInversion(tuning)]} · Bajo en ${currentVoicing.computeBassNote(tuning, notation)}` : ''}`
          ])
        ]),
        viewModeSeg
      ]),
      el('div', { className: 'm3-chip-row' }, notesBadges),
      visualHost,
      carousel,
      actionsRow
    ]);

    this._panelHost.append(selectorCard, detailCard);
  }

  /**
   * Pestaña 2: Explorador de Campo Armónico en las 12 tonalidades (mayor/menor, tríadas/séptimas)
   * + constructor de progresión y atajos clásicos.
   */
  _renderFieldTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const tuning = this._vm.activeTuning.value;
    const field = this._vm.diatonicField.value;
    const builder = this._vm.builderChords.value;

    const keySelect = this._buildMiniSelect(
      'Tonalidad',
      this._vm.fieldKey.value,
      ALL_KEYS.map((k) => ({ value: k, label: formatChordSymbol(k, notation) })),
      (k) => this._vm.fieldKey.set(k)
    );

    const modeSeg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Modo' },
      [
        { id: 'major', label: 'Mayor' },
        { id: 'minor', label: 'Menor' }
      ].map((m) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.fieldMode.value === m.id),
            onClick: () => this._vm.fieldMode.set(m.id)
          },
          [m.label]
        )
      )
    );

    const extSeg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Extensión' },
      [
        { v: false, label: 'Tríadas' },
        { v: true, label: 'Séptimas' }
      ].map((opt) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.fieldUseSevenths.value === opt.v),
            onClick: () => this._vm.fieldUseSevenths.set(opt.v)
          },
          [opt.label]
        )
      )
    );

    const headerCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [keySelect, modeSeg, extSeg]),
      el('div', { className: 'm3-chip-row' }, HARMONIC_FIELD_SHORTCUTS.map((sc) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            onClick: () => this._vm.applyFieldShortcut(sc.id)
          },
          [sc.label]
        )
      ))
    ]);

    // 7 grados diatónicos con diagrama interactivo y función tonal
    const degreesGrid = el(
      'div',
      { className: 'harmonic-field-grid' },
      field.map((deg) => {
        const fnBadgeClass =
          deg.harmonicFunction === 'tónica'
            ? 'm3-badge--primary'
            : deg.harmonicFunction === 'subdominante'
              ? 'm3-badge--success'
              : 'm3-badge--tertiary';

        return el('div', { className: 'm3-card harmonic-degree-card' }, [
          el('div', { className: 'player-toolbar' }, [
            el('strong', {}, [deg.roman]),
            el('span', { className: `m3-badge ${fnBadgeClass}` }, [deg.harmonicFunction])
          ]),
          deg.voicing
            ? createChordDiagramElement(deg.voicing, {
                tuning,
                notation,
                size: 'sm',
                labelMode: this._vm.labelMode.value,
                leftHanded: this._vm.leftHanded.value,
                onPlay: (v) => this._vm.playVoicing(v)
              })
            : el('button', {
                type: 'button',
                className: 'm3-btn m3-btn--tonal',
                onClick: () => this._vm.playChordArpeggio(deg.symbol)
              }, [deg.chord.getSymbol(notation)]),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--outlined',
              ripple: true,
              onClick: () => this._vm.addChordToBuilder(deg.symbol)
            },
            [icon('plus', 16), 'Sumar']
          )
        ]);
      })
    );

    // Constructor de progresión (tocar para reordenar/quitar, reproducir o guardar)
    const builderCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Tu progresión']),
        el('div', { className: 'm3-chip-row' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--filled', ripple: true, onClick: () => this._vm.playBuilderProgression(false) }, [icon('play', 16), 'Escuchar']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => { this._vm.recomputeVoiceLeading(); this._vm.setActiveTab('cambios'); } }, [icon('swap', 16), 'Ver conducción']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true, onClick: () => this._vm.saveBuilderAsPractice() }, ['Guardar práctica'])
        ])
      ]),
      el(
        'div',
        { className: 'm3-chip-row' },
        builder.map((ch, idx) =>
          el('div', { className: 'builder-pill' }, [
            el('strong', {}, [formatChordSymbol(ch, notation)]),
            idx > 0
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:32px; height:32px; min-width:32px; min-height:32px', 'aria-label': 'Mover izquierda', onClick: () => this._vm.editBuilderChord(idx, 'left') }, ['‹'])
              : null,
            idx < builder.length - 1
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:32px; height:32px; min-width:32px; min-height:32px', 'aria-label': 'Mover derecha', onClick: () => this._vm.editBuilderChord(idx, 'right') }, ['›'])
              : null,
            builder.length > 1
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:32px; height:32px; min-width:32px; min-height:32px', 'aria-label': 'Quitar', onClick: () => this._vm.editBuilderChord(idx, 'remove') }, ['×'])
              : null
          ])
        )
      )
    ]);

    this._panelHost.append(headerCard, builderCard, degreesGrid);
  }

  /**
   * Pestaña 3: Entrenador de Cambios (CPM) + Conducción de Voces con líneas conectoras + Modo Inversiones.
   */
  _renderTrainerAndVoiceLeadingTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const tuning = this._vm.activeTuning.value;
    const fam = tuning.instrument;

    // 1) Entrenador de Cambios (CPM)
    const chords = this._vm.trainerChords.value;
    const curIdx = this._vm.trainerStepIndex.value % chords.length;
    const nextIdx = (curIdx + 1) % chords.length;
    const curChord = chords[curIdx];
    const nextChord = chords[nextIdx];
    const curVoicing = getCuratedVoicingsForChord(curChord, fam, tuning)[0];
    const nextVoicing = getCuratedVoicingsForChord(nextChord, fam, tuning)[0];
    const seqKey = chords.join(' – ');
    const bestCpm = this._appVm.progress.value.changeTrainerCpm[seqKey] || 0;

    const running = this._vm.trainerRunning.value;
    const beat = this._vm.trainerCurrentBeat.value;

    const trainerCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, ['Entrenador de cambios (CPM)']),
          el('span', { className: 'm3-body-md' }, [
            bestCpm > 0 ? `Mejor marca en ${seqKey}: ${bestCpm} CPM` : 'Practicá el cambio limpio al pulso del metrónomo'
          ])
        ]),
        el(
          'button',
          {
            type: 'button',
            className: `m3-btn ${running ? 'm3-btn--danger' : 'm3-btn--filled'}`,
            ripple: true,
            onClick: () => (running ? this._vm.stopChangeTrainer() : this._vm.startChangeTrainer())
          },
          [icon(running ? 'stop' : 'play', 18), running ? 'Detener y medir CPM' : 'Iniciar']
        )
      ]),
      el('div', { className: 'm3-chip-row' }, TRAINER_PRESETS.map((pr) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(chords.join('-') === pr.chords.join('-')),
            onClick: () => {
              this._vm.stopChangeTrainer();
              this._vm.trainerChords.set([...pr.chords]);
            }
          },
          [pr.label]
        )
      )),
      el('div', { className: 'stepper-inline' }, [
        el('span', { className: 'm3-body-md' }, ['Tempo:']),
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', onClick: () => this._vm.trainerBpm.set(Math.max(40, this._vm.trainerBpm.value - 5)) }, ['−']),
        el('strong', {}, [`${this._vm.trainerBpm.value} BPM`]),
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', onClick: () => this._vm.trainerBpm.set(Math.min(200, this._vm.trainerBpm.value + 5)) }, ['+']),
        el('span', { className: 'm3-badge m3-badge--tertiary' }, [running ? `Pulso ${beat}/${this._vm.trainerBeatsPerChange.value} · ${this._vm.trainerChangesCount.value} cambios` : `${this._vm.trainerBeatsPerChange.value} pulsos por cambio`])
      ]),
      el('div', { className: 'trainer-pair' }, [
        el('div', { className: 'trainer-slot trainer-slot--current' }, [
          el('span', { className: 'm3-badge m3-badge--primary' }, ['AHORA']),
          curVoicing
            ? createChordDiagramElement(curVoicing, { tuning, notation, size: 'md', onPlay: (v) => this._vm.playVoicing(v) })
            : el('strong', { className: 'm3-headline' }, [formatChordSymbol(curChord, notation)])
        ]),
        el('div', { className: 'trainer-slot' }, [
          el('span', { className: 'm3-badge' }, ['SIGUIENTE']),
          nextVoicing
            ? createChordDiagramElement(nextVoicing, { tuning, notation, size: 'md', onPlay: (v) => this._vm.playVoicing(v) })
            : el('strong', { className: 'm3-headline' }, [formatChordSymbol(nextChord, notation)])
        ])
      ])
    ]);

    // 2) Conducción de voces con líneas entre diagramas consecutivos
    const vlSteps = this._vm.voiceLedSequence.value;
    const vlStrip = el('div', { className: 'voice-leading-strip' });
    vlSteps.forEach((step, idx) => {
      vlStrip.appendChild(
        el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:4px' }, [
          createChordDiagramElement(step.voicing, {
            tuning,
            notation,
            labelMode: 'functions',
            size: 'sm',
            onPlay: (v) => this._vm.playVoicing(v)
          }),
          el('span', { className: 'm3-label' }, [INVERSION_LABELS[step.voicing.computeInversion(tuning)]])
        ])
      );
      if (idx < vlSteps.length - 1) {
        vlStrip.appendChild(createVoiceLeadingConnector(step.connectionsToNext));
      }
    });

    const vlCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, ['Conducción de voces']),
          el('span', { className: 'm3-body-md' }, ['Inversiones elegidas para minimizar movimiento (verde = nota común, azul = grado conjunto)'])
        ]),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.playBuilderProgression(true) }, [icon('play', 16), 'Escuchar conducción'])
      ]),
      vlStrip
    ]);

    // 3) Modo Inversiones subiendo por el diapasón
    const invVoicings = this._vm.getInversionWalkVoicings();
    const invCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, [`Inversiones de ${this._vm.activeChord.value.getSymbol(notation)} por el mango`]),
        el(
          'div',
          { className: 'm3-segmented' },
          [
            { id: '321', label: 'Cuerdas 3-2-1' },
            { id: '432', label: 'Cuerdas 4-3-2' },
            { id: '5432', label: 'Drop 2 (5-4-3-2)' }
          ].map((s) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                ripple: true,
                'aria-pressed': String(this._vm.inversionStringSet.value === s.id),
                onClick: () => this._vm.inversionStringSet.set(s.id)
              },
              [s.label]
            )
          )
        )
      ]),
      el(
        'div',
        { className: 'voice-leading-strip' },
        invVoicings.map((v) =>
          el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:4px' }, [
            el('span', { className: 'm3-badge m3-badge--primary' }, [INVERSION_LABELS[v.computeInversion(tuning)]]),
            createChordDiagramElement(v, {
              tuning,
              notation,
              labelMode: 'functions',
              size: 'sm',
              onPlay: (vo) => this._vm.playVoicing(vo)
            })
          ])
        )
      )
    ]);

    this._panelHost.append(trainerCard, vlCard, invCard);
  }

  /**
   * Pestaña 4: Entrenamiento de Oído armónico con dificultad ascendente (1..4) y puntaje.
   */
  _renderEarTab() {
    const q = this._vm.earQuestion.value;
    const selected = this._vm.earSelectedId.value;
    const score = this._vm.earScore.value;

    const levelSeg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Nivel de entrenamiento de oído' },
      [
        { n: 1, label: '1. Tríadas' },
        { n: 2, label: '2. Séptimas' },
        { n: 3, label: '3. Inversiones' },
        { n: 4, label: '4. Progresiones' }
      ].map((lvl) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(this._vm.earLevel.value === lvl.n),
            onClick: () => {
              this._vm.earLevel.set(lvl.n);
              this._vm.nextEarQuestion();
            }
          },
          [lvl.label]
        )
      )
    );

    const optionsGrid = q
      ? el(
          'div',
          { className: 'controls-grid' },
          q.options.map((opt) => {
            let extra = 'm3-btn--outlined';
            if (selected !== null) {
              if (opt.id === q.correctId) extra = 'm3-btn--filled';
              else if (opt.id === selected) extra = 'm3-btn--danger';
            }
            return el(
              'button',
              {
                type: 'button',
                className: `m3-btn ${extra}`,
                ripple: true,
                disabled: selected !== null,
                onClick: () => this._vm.answerEarQuestion(opt.id)
              },
              [opt.label]
            );
          })
        )
      : null;

    const feedback =
      selected !== null && q
        ? el('div', { className: `alert-box ${selected === q.correctId ? 'alert-box--info' : 'alert-box--error'}` }, [
            el('strong', {}, [selected === q.correctId ? '¡Exacto! ' : 'Casi… ']),
            q.explanation
          ])
        : null;

    const card = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:14px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Entrenamiento de oído armónico']),
        el('span', { className: 'm3-badge m3-badge--success' }, [`Puntaje: ${score.correct} / ${score.total}`])
      ]),
      levelSeg,
      q ? el('p', { className: 'm3-body-md' }, [q.prompt]) : null,
      el('div', { className: 'm3-chip-row' }, [
        el('button', { type: 'button', className: 'm3-btn m3-btn--filled', ripple: true, onClick: () => this._vm.playEarQuestion() }, [icon('ear', 18), 'Escuchar']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._vm.nextEarQuestion() }, ['Siguiente pregunta'])
      ]),
      optionsGrid,
      feedback
    ]);

    this._panelHost.appendChild(card);
  }

  /**
   * Construye un select compacto con etiqueta legible para filtros internos.
   * @param {string} label Etiqueta.
   * @param {string} value Valor actual.
   * @param {Array<{ value: string, label: string }>} options Opciones.
   * @param {Function} onChange Handler al cambiar.
   * @returns {HTMLElement} Bloque DOM.
   */
  _buildMiniSelect(label, value, options, onChange) {
    const sel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:44px',
        'aria-label': label,
        onChange: (e) => onChange(e.target.value)
      },
      options.map((o) => el('option', { value: o.value, selected: o.value === value }, [o.label]))
    );
    sel.value = value;
    return el('div', {}, [
      el('div', { className: 'm3-body-md', style: 'margin-bottom:4px; font-size:0.78rem' }, [label]),
      sel
    ]);
  }
}
