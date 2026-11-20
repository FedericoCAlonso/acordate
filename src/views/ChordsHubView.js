import { INSTRUMENT_LABELS, formatChordSymbol, formatVoicingTag } from '../core/i18n.js';
import { ALL_KEYS } from '../core/MusicTheory.js';
import { PRESET_TUNINGS } from '../models/Tuning.js';
import { INVERSION_LABELS } from '../models/Voicing.js';
import { HARMONIC_FIELD_SHORTCUTS } from '../services/HarmonyService.js';
import {
  createBassFretboardMapElement,
  createChordColorLegendElement,
  createChordDiagramElement,
  createChordSymbolElement,
  createVoiceLeadingConnector
} from './ChordDiagramView.js';
import { el, icon, openModalDialog } from './uiHelpers.js';

/**
 * Formatea una calidad de acorde para listas desplegables sin repetir el nombre (ej. "Mayor", "Menor (m)").
 * @param {import('../models/ChordQuality.js').ChordQuality} q Calidad.
 * @returns {string} Etiqueta limpia.
 */
function formatQualityOptionLabel(q) {
  if (!q.id) return q.name;
  if (q.shortName.toLowerCase() === q.name.toLowerCase()) return q.name;
  return `${q.name} (${q.shortName.replace(/b/g, '♭').replace(/#/g, '♯')})`;
}

/**
 * Formatea una nota con símbolos tipográficos reales ♯ y ♭ para botoneras de raíces.
 * @param {string} root Raíz americana.
 * @param {'americano'|'latino'} notation Sistema de cifrado.
 * @returns {string} Raíz visual.
 */
function formatRootDisplay(root, notation) {
  return formatChordSymbol(root, notation).replace(/#/g, '♯').replace(/b/g, '♭');
}

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
 * Sugerencias iniciales rápidas (opcionales) para el Entrenador de Cambios.
 */
const TRAINER_QUICK_PRESETS = [
  { label: 'G – C', chords: ['G', 'C'] },
  { label: 'C – Am – F – G', chords: ['C', 'Am', 'F', 'G'] },
  { label: 'Dm7 – G7 – Cmaj7', chords: ['Dm7', 'G7', 'Cmaj7'] },
  { label: 'Am – Dm – E7', chords: ['Am', 'Dm', 'E7'] }
];

/**
 * Vista del módulo de Armonía (#/acordes):
 * - Biblioteca de Acordes (guitarra clásica, guitarra y acordes idiomáticos de bajo 4/5 cuerdas)
 * - Explorador de Campo Armónico (mayor, menor natural, armónica y melódica)
 * - Entrenador de Cambios (CPM) + Conducción de Voces + Inversiones por el mango (100 % editables)
 * - Entrenamiento de Oído
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
    /** Estado local efímero de selectores inline para sumar acordes (no persiste en dominio). */
    this._draftTrainer = { root: 'G', quality: '', bass: '' };
    /** Estado local efímero para sumar acordes a Conducción de voces. */
    this._draftVl = { root: 'C', quality: 'maj7', bass: '' };
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
      this._vm.preferSharps.subscribe(() => this._renderPanel()),
      this._vm.voicingsList.subscribe(() => this._renderPanel()),
      this._vm.activeVoicingIndex.subscribe(() => this._renderPanel()),
      this._vm.diagramViewMode.subscribe(() => this._renderPanel()),
      this._vm.labelMode.subscribe(() => this._renderPanel()),
      this._vm.leftHanded.subscribe(() => this._renderPanel()),
      this._vm.playMode.subscribe(() => this._renderPanel()),
      this._vm.diatonicField.subscribe(() => this._renderPanel()),
      this._vm.builderChords.subscribe(() => this._renderPanel()),
      this._vm.trainerChords.subscribe(() => this._renderPanel()),
      this._vm.trainerVoicingIndices.subscribe(() => this._renderPanel()),
      this._vm.trainerBpm.subscribe(() => this._renderPanel()),
      this._vm.trainerBeatsPerChange.subscribe(() => this._renderPanel()),
      this._vm.trainerAudioCue.subscribe(() => this._renderPanel()),
      this._vm.trainerRunning.subscribe(() => this._renderPanel()),
      this._vm.trainerStepIndex.subscribe(() => this._renderPanel()),
      this._vm.trainerCurrentBeat.subscribe(() => this._renderPanel()),
      this._vm.voiceLeadingChords.subscribe(() => this._renderPanel()),
      this._vm.voiceLeadingZone.subscribe(() => this._renderPanel()),
      this._vm.voiceLeadingStyle.subscribe(() => this._renderPanel()),
      this._vm.voiceLedSequence.subscribe(() => this._renderPanel()),
      this._vm.inversionChord.subscribe(() => this._renderPanel()),
      this._vm.inversionStringSet.subscribe(() => this._renderPanel()),
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
   * Crea una barra compacta y reutilizable para cambiar Instrumento (Clásica / Guitarra / Bajo) y Afinación
   * desde cualquier pestaña armónica.
   * @returns {HTMLElement} Barra de instrumento y afinación.
   */
  _buildInstrumentTuningBar() {
    const isBass = this._vm.instrument.value === 'bajo';
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

    return el('div', { style: 'display:flex; flex-direction:column; gap:8px' }, [instSeg, tuningSelect]);
  }

  /**
   * Crea una fila compacta e interactiva para elegir cualquier acorde (Raíz + Calidad + opcional /Bajo)
   * y agregarlo a una secuencia editable.
   * @param {{ root: string, quality: string, bass: string }} draft Estado borrador.
   * @param {string} notation Sistema de cifrado.
   * @param {Function} onAdd Callback que recibe el símbolo americano construido.
   * @param {boolean} [allowSlash=true] Muestra selector de bajo alternativo (slash chord).
   * @returns {HTMLElement} Controles inline para sumar acordes.
   */
  _buildInlineChordAdder(draft, notation, onAdd, allowSlash = true) {
    const rootSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:6px 10px; min-height:42px; width:auto; flex:1 1 82px',
        'aria-label': 'Raíz del acorde a agregar',
        onChange: (e) => { draft.root = e.target.value; }
      },
      ALL_KEYS.map((k) => el('option', { value: k, selected: k === draft.root }, [formatChordSymbol(k, notation)]))
    );
    rootSel.value = draft.root;

    const qualSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:6px 10px; min-height:42px; width:auto; flex:1.5 1 130px',
        'aria-label': 'Calidad del acorde a agregar',
        onChange: (e) => { draft.quality = e.target.value; }
      },
      this._vm.getAvailableQualities().map((q) =>
        el('option', { value: q.id, selected: q.id === draft.quality }, [q.shortName])
      )
    );
    qualSel.value = draft.quality;

    const bassSel = allowSlash
      ? el(
          'select',
          {
            className: 'm3-field__select',
            style: 'padding:6px 10px; min-height:42px; width:auto; flex:1 1 92px',
            'aria-label': 'Bajo alternativo (opcional)',
            onChange: (e) => { draft.bass = e.target.value; }
          },
          [
            el('option', { value: '', selected: draft.bass === '' }, ['Bajo: fund.']),
            ...ALL_KEYS.map((k) => el('option', { value: k, selected: k === draft.bass }, [`/${formatChordSymbol(k, notation)}`]))
          ]
        )
      : null;
    if (bassSel) bassSel.value = draft.bass;

    const addBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--tonal',
        ripple: true,
        onClick: () => {
          const sym = `${draft.root}${draft.quality}${draft.bass && draft.bass !== draft.root ? `/${draft.bass}` : ''}`;
          onAdd(sym);
        }
      },
      [icon('plus', 16), 'Sumar']
    );

    return el('div', { className: 'm3-chip-row', style: 'align-items:center' }, [rootSel, qualSel, bassSel, addBtn]);
  }

  /**
   * Pestaña 1: Biblioteca de acordes con grilla de raíces, calidades, bajo alternativo,
   * acordes al estilo del bajo + mapa de diapasón, vista Diagrama/Pentagrama/Ambos y generador.
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

    // Selector de enarmonía (♯ Sostenidos / ♭ Bemoles) + grilla de 12 raíces
    const rootChoices = this._vm.getRootChoices();
    const enharmonicRow = el('div', { className: 'player-toolbar' }, [
      el('span', { className: 'm3-label' }, ['Raíz del acorde']),
      el(
        'div',
        { className: 'm3-segmented', role: 'group', 'aria-label': 'Enarmonía preferida' },
        [
          { sharps: true, label: '♯ Sostenidos' },
          { sharps: false, label: '♭ Bemoles' }
        ].map((opt) =>
          el(
            'button',
            {
              type: 'button',
              className: 'm3-segmented__btn',
              ripple: true,
              'aria-pressed': String(this._vm.preferSharps.value === opt.sharps),
              onClick: () => this._vm.setPreferSharps(opt.sharps)
            },
            [opt.label]
          )
        )
      )
    ]);

    const rootsGrid = el(
      'div',
      { className: 'root-grid', role: 'group', 'aria-label': 'Raíz del acorde' },
      rootChoices.map((root) =>
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
          [formatRootDisplay(root, notation)]
        )
      )
    );

    // Selector de calidad (sin repetir "Mayor — Mayor") y bajo slash ("Inversión: fundamental")
    const qualitySelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:44px',
        'aria-label': 'Calidad del acorde',
        onChange: (e) => this._vm.selectChord({ quality: e.target.value })
      },
      this._vm.getAvailableQualities().map((q) =>
        el('option', { value: q.id, selected: q.id === this._vm.selectedQuality.value }, [formatQualityOptionLabel(q)])
      )
    );
    qualitySelect.value = this._vm.selectedQuality.value;

    const slashSelect = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 12px; min-height:44px',
        'aria-label': 'Inversión o bajo alternativo',
        onChange: (e) => this._vm.selectChord({ bass: e.target.value })
      },
      [
        el('option', { value: '', selected: this._vm.selectedBass.value === '' }, ['Inversión: fundamental']),
        ...rootChoices.map((k) =>
          el('option', { value: k, selected: this._vm.selectedBass.value === k }, [`Bajo en ${formatRootDisplay(k, notation)} (/${formatRootDisplay(k, notation)})`])
        )
      ]
    );
    slashSelect.value = this._vm.selectedBass.value;

    const voicingTypeOptions = isBass
      ? [
          { value: 'todos', label: 'Todos los acordes de bajo' },
          { value: 'decima', label: 'Décimas (R–10)' },
          { value: 'shell', label: 'Shells (R–7–10 / R–3–7)' },
          { value: 'triada', label: 'Tríadas (abiertas / agudas)' },
          { value: 'guias', label: 'Notas guía (3–7)' },
          { value: 'inversion', label: 'Inversiones / slash' },
          { value: 'extension', label: 'Extensiones (6, 9, 13)' },
          { value: 'sugerido', label: 'Sugeridos' }
        ]
      : [
          { value: 'todos', label: 'Todos los tipos' },
          { value: 'abierto', label: 'Abierto' },
          { value: 'cejilla', label: 'Cejilla' },
          { value: 'triada', label: 'Tríada' },
          { value: 'drop2', label: 'Drop 2' },
          { value: 'drop3', label: 'Drop 3' },
          { value: 'shell', label: 'Shell' },
          { value: 'sugerido', label: 'Sugeridos' }
        ];

    // Filtros secundarios plegables (tipo, inversión, rango de trastes, zurdo, etiquetas)
    const filtersCollapsible = el('details', { className: 'm3-collapsible' }, [
      el('summary', {}, [el('span', {}, ['Filtros y opciones del diagrama']), icon('chevronDown', 18)]),
      el('div', { className: 'm3-collapsible__content' }, [
        el('div', { className: 'controls-grid' }, [
          this._buildMiniSelect('Tipo de voicing', this._vm.voicingTypeFilter.value, voicingTypeOptions, (v) => this._vm.voicingTypeFilter.set(v)),
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
            { value: 'block', label: 'En bloque (acorde pulsado)' },
            { value: 'strum-down', label: 'Rasgueo abajo' },
            { value: 'strum-up', label: 'Rasgueo arriba' },
            { value: 'arpeggio-asc', label: 'Arpegio ascendente' },
            { value: 'arpeggio-pima', label: 'Arpegio p-i-m-a' }
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
    } else {
      visualHost.appendChild(
        el('p', { className: 'm3-body-md' }, ['No hay digitaciones para ese filtro. Tocá "Generar voicings" o limpiá los filtros.'])
      );
    }

    // En bajo, además del diagrama de acorde al estilo del bajo, ofrece el mapa del diapasón plegable/debajo
    const bassMapSection = isBass
      ? el('details', { className: 'm3-collapsible' }, [
          el('summary', {}, [el('span', {}, ['Ver mapa completo de notas (R, 3, 5, 7) en el diapasón del bajo']), icon('chevronDown', 18)]),
          el('div', { className: 'm3-collapsible__content' }, [
            createBassFretboardMapElement(chord.americanSymbol, {
              tuning,
              notation,
              labelMode: this._vm.labelMode.value === 'notes' ? 'notes' : 'functions'
            })
          ])
        ])
      : null;

    // Grilla agrupada por tipo (Abiertas, Cejillas / CAGED, Tríadas, Drop 2, Shell…) ordenada por traste
    const groupedVoicings = this._vm.getGroupedVoicings();
    const groupsHost = groupedVoicings.length > 0
      ? el(
          'div',
          { className: 'voicing-groups', 'aria-label': 'Digitaciones agrupadas por tipo' },
          groupedVoicings.map((grp) =>
            el('section', { className: 'voicing-group' }, [
              el('h3', { className: 'm3-title-md voicing-group__title' }, [`${grp.label} (${grp.items.length})`]),
              el(
                'div',
                { className: 'voicing-group-grid' },
                grp.items.map(({ voicing: v, flatIndex }) => {
                  const isActive = flatIndex === safeIdx;
                  const invLbl = INVERSION_LABELS[v.computeInversion(tuning)] || 'Fundamental';
                  const tagText = (v.tags || []).slice(0, 2).map(formatVoicingTag).join(' · ');
                  return el(
                    'div',
                    { className: `voicing-grid-card ${isActive ? 'voicing-grid-card--active' : ''}` },
                    [
                      createChordDiagramElement(v, {
                        tuning,
                        notation,
                        labelMode: this._vm.labelMode.value,
                        leftHanded: this._vm.leftHanded.value,
                        size: 'sm',
                        showTitle: false,
                        onPlay: (vo) => {
                          this._vm.activeVoicingIndex.set(flatIndex);
                          this._vm.playVoicing(vo);
                        }
                      }),
                      el('div', { className: 'voicing-grid-card__meta' }, [
                        el('strong', { className: 'm3-label' }, [v.getPositionLabel()]),
                        el('span', { className: 'm3-body-md' }, [`${v.getUsedStringsLabel(tuning)} · ${invLbl}`]),
                        tagText ? el('span', { className: 'm3-body-md', style: 'font-size:0.74rem' }, [tagText]) : null
                      ]),
                      el('div', { className: 'm3-chip-row', style: 'justify-content:center' }, [
                        el(
                          'button',
                          {
                            type: 'button',
                            className: 'm3-btn m3-btn--compact m3-btn--text',
                            ripple: true,
                            'aria-label': `Ampliar digitación en ${v.getPositionLabel()}`,
                            onClick: () => this._openZoomVoicingModal(v, tuning, notation)
                          },
                          [icon('fullscreen', 15), 'Ampliar']
                        )
                      ])
                    ]
                  );
                })
              )
            ])
          )
        )
      : null;

    const actionsRow = el('div', { className: 'm3-chip-row' }, [
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--filled', ripple: true,
        onClick: () => (currentVoicing ? this._vm.playVoicing(currentVoicing) : this._vm.playChordArpeggio())
      }, [icon('play', 18), isBass ? 'Escuchar acorde' : 'Escuchar']),
      isBass
        ? el('button', {
            type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true,
            onClick: () => (currentVoicing ? this._vm.playVoicing(currentVoicing, 'arpeggio-asc') : this._vm.playChordArpeggio())
          }, ['Arpegiar'])
        : null,
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true,
        onClick: () => this._vm.practiceActiveChord(currentVoicing)
      }, [icon('music', 18), 'Practicar acorde']),
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true,
        onClick: () => this._vm.generateSuggestedVoicings()
      }, [icon('wand', 18), 'Generar voicings']),
      el('button', {
        type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true,
        onClick: () => this._vm.openCompatibleScale()
      }, [icon('scales', 18), 'Escalas compatibles']),
      currentVoicing
        ? el('button', {
            type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true,
            onClick: () => this._openZoomVoicingModal(currentVoicing, tuning, notation)
          }, [icon('fullscreen', 16), 'Ampliar'])
        : null,
      el('button', {
        type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true,
        'aria-label': isFav ? 'Quitar de favoritos' : 'Marcar como favorito',
        title: isFav ? 'Quitar de favoritos' : 'Guardar en favoritos',
        onClick: () => this._vm.toggleFavoriteActiveChord()
      }, [icon(isFav ? 'star' : 'starOutline', 22)])
    ]);

    const selectorCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      this._buildInstrumentTuningBar(),
      el('div', { className: 'controls-grid' }, [qualitySelect, slashSelect]),
      enharmonicRow,
      rootsGrid,
      filtersCollapsible
    ]);

    const detailCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-headline' }, [createChordSymbolElement(chord.americanSymbol, notation)]),
          el('span', { className: 'm3-body-md' }, [
            `${chord.quality.name}${currentVoicing ? ` · ${currentVoicing.getPositionLabel()} (${currentVoicing.getUsedStringsLabel(tuning)}) · ${INVERSION_LABELS[currentVoicing.computeInversion(tuning)]} · Bajo en ${currentVoicing.computeBassNote(tuning, notation)}` : ''}`
          ])
        ]),
        viewModeSeg
      ]),
      isBass
        ? el('p', { className: 'm3-body-md', style: 'font-size:0.84rem' }, [
            'Acordes al estilo del bajo: décimas (R–10), shells (R–7–10 / R–3–7), tríadas en registro agudo y notas guía respetando el Low Interval Limit.'
          ])
        : null,
      el('div', { className: 'm3-chip-row' }, notesBadges),
      createChordColorLegendElement(),
      visualHost,
      actionsRow,
      groupsHost,
      bassMapSection
    ]);

    this._panelHost.append(selectorCard, detailCard);
  }

  /**
   * Pestaña 2: Explorador de Campo Armónico en las 12 tonalidades y 4 modos (mayor, menor natural,
   * menor armónica y menor melódica) + constructor de progresión conectable a Cambios y Conducción.
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

    const modeSelect = this._buildMiniSelect(
      'Modo',
      this._vm.fieldMode.value,
      [
        { value: 'major', label: 'Mayor' },
        { value: 'minor', label: 'Menor natural (eólico)' },
        { value: 'harmonic-minor', label: 'Menor armónica' },
        { value: 'melodic-minor', label: 'Menor melódica' }
      ],
      (m) => this._vm.fieldMode.set(m)
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
      this._buildInstrumentTuningBar(),
      el('div', { className: 'controls-grid' }, [keySelect, modeSelect]),
      el('div', { className: 'player-toolbar' }, [
        extSeg,
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
      ])
    ]);

    // 7 grados diatónicos con diagrama interactivo y función tonal
    const degreesGrid = el(
      'div',
      { className: 'harmonic-field-grid' },
      field.map((deg) => {
        const fnBadgeClass =
          deg.harmonicFunction === 'tónica'
            ? 'm3-badge--primary'
            : deg.harmonicFunction.startsWith('subdominante')
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

    const builderCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Tu progresión']),
        el('div', { className: 'm3-chip-row' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--filled', ripple: true, onClick: () => this._vm.playBuilderProgression(false) }, [icon('play', 16), 'Escuchar']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.loadBuilderIntoVoiceLeading() }, [icon('swap', 16), 'Conducción']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.loadBuilderIntoTrainer() }, ['Al entrenador']),
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
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:30px; height:30px; min-width:30px; min-height:30px', 'aria-label': 'Mover izquierda', onClick: () => this._vm.editBuilderChord(idx, 'left') }, ['‹'])
              : null,
            idx < builder.length - 1
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:30px; height:30px; min-width:30px; min-height:30px', 'aria-label': 'Mover derecha', onClick: () => this._vm.editBuilderChord(idx, 'right') }, ['›'])
              : null,
            builder.length > 1
              ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:30px; height:30px; min-width:30px; min-height:30px', 'aria-label': 'Quitar', onClick: () => this._vm.editBuilderChord(idx, 'remove') }, ['×'])
              : null
          ])
        )
      )
    ]);

    this._panelHost.append(headerCard, builderCard, degreesGrid);
  }

  /**
   * Pestaña 3: Entrenador de Cambios (CPM) + Conducción de Voces + Inversiones por el mango.
   * Todas las herramientas son 100 % editables, permiten secuencias aleatorias y soportan acordes de bajo.
   */
  _renderTrainerAndVoiceLeadingTab() {
    const notation = this._appVm.settings.value.chordNotation;
    const tuning = this._vm.activeTuning.value;
    const isBass = tuning.instrument === 'bass';

    // Barra superior de instrumento y afinación compartida
    const instCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:8px' }, [
      this._buildInstrumentTuningBar()
    ]);

    // =========================================================================
    // 1) ENTRENADOR DE CAMBIOS (CPM) — 100 % CONFIGURABLE
    // =========================================================================
    const chords = this._vm.trainerChords.value;
    const curIdx = this._vm.trainerStepIndex.value % chords.length;
    const nextIdx = (curIdx + 1) % chords.length;
    const curChord = chords[curIdx];
    const nextChord = chords[nextIdx];
    const curVoicing = this._vm.getActiveTrainerVoicing(curIdx);
    const nextVoicing = this._vm.getActiveTrainerVoicing(nextIdx);
    const curVariantsCount = this._vm.getTrainerSlotVoicings(curChord).length;
    const nextVariantsCount = this._vm.getTrainerSlotVoicings(nextChord).length;
    const seqKey = chords.join(' – ');
    const bestCpm = this._appVm.progress.value.changeTrainerCpm[seqKey] || 0;
    const running = this._vm.trainerRunning.value;
    const beat = this._vm.trainerCurrentBeat.value;

    const trainerPills = el(
      'div',
      { className: 'm3-chip-row', 'aria-label': 'Secuencia editable del entrenador' },
      chords.map((ch, idx) =>
        el('div', { className: 'builder-pill', style: idx === curIdx && running ? 'outline:2px solid var(--md-sys-color-primary)' : '' }, [
          el('strong', {}, [formatChordSymbol(ch, notation)]),
          idx > 0
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Mover izquierda', onClick: () => this._vm.editTrainerChord(idx, 'left') }, ['‹'])
            : null,
          idx < chords.length - 1
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Mover derecha', onClick: () => this._vm.editTrainerChord(idx, 'right') }, ['›'])
            : null,
          chords.length > 2
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Quitar', onClick: () => this._vm.editTrainerChord(idx, 'remove') }, ['×'])
            : null
        ])
      )
    );

    const trainerCard = el('div', { className: 'm3-card m3-card--elevated', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, ['Entrenador de cambios (CPM)']),
          el('span', { className: 'm3-body-md' }, [
            bestCpm > 0 ? `Mejor marca en ${seqKey}: ${bestCpm} CPM` : 'Armá cualquier secuencia o generá una aleatoria para practicar cambios limpios'
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
      trainerPills,
      this._buildInlineChordAdder(this._draftTrainer, notation, (sym) => this._vm.addTrainerChord(sym), true),
      el('div', { className: 'm3-chip-row' }, [
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.randomizeTrainerChords() }, [icon('wand', 16), 'Secuencia aleatoria']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true, onClick: () => this._vm.loadBuilderIntoTrainer() }, ['Desde Campo']),
        el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true, onClick: () => this._vm.loadFavoritesIntoTrainer() }, ['Mis favoritos']),
        el('button', {
          type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true,
          onClick: () => this._vm.saveBuilderAsPractice({
            title: `Cambios ${chords.join(' – ')}`,
            chords,
            category: 'cambios',
            notes: 'Práctica creada desde el Entrenador de Cambios.'
          })
        }, ['Guardar práctica']),
        ...TRAINER_QUICK_PRESETS.map((pr) =>
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
                this._vm.trainerVoicingIndices.set({});
                this._vm.trainerStepIndex.set(0);
              }
            },
            [pr.label]
          )
        )
      ]),
      el('div', { className: 'stepper-inline', style: 'flex-wrap:wrap; gap:10px' }, [
        el('span', { className: 'm3-body-md' }, ['Tempo:']),
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', onClick: () => this._vm.trainerBpm.set(Math.max(40, this._vm.trainerBpm.value - 5)) }, ['−']),
        el('strong', {}, [`${this._vm.trainerBpm.value} BPM`]),
        el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', onClick: () => this._vm.trainerBpm.set(Math.min(200, this._vm.trainerBpm.value + 5)) }, ['+']),
        el('span', { className: 'm3-body-md' }, ['Pulsos/cambio:']),
        ...[1, 2, 3, 4, 8].map((b) =>
          el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              style: 'min-width:36px; justify-content:center; padding:4px 8px',
              'aria-pressed': String(this._vm.trainerBeatsPerChange.value === b),
              onClick: () => {
                this._vm.stopChangeTrainer();
                this._vm.trainerBeatsPerChange.set(b);
              }
            },
            [String(b)]
          )
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            'aria-pressed': String(this._vm.trainerAudioCue.value),
            onClick: () => this._vm.trainerAudioCue.set(!this._vm.trainerAudioCue.value)
          },
          ['Guía sonora']
        ),
        el('span', { className: 'm3-badge m3-badge--tertiary' }, [running ? `Pulso ${beat}/${this._vm.trainerBeatsPerChange.value} · ${this._vm.trainerChangesCount.value} cambios` : `${this._vm.trainerBeatsPerChange.value} pulsos por cambio`])
      ]),
      el('div', { className: 'trainer-pair' }, [
        el('div', { className: 'trainer-slot trainer-slot--current' }, [
          el('div', { className: 'player-toolbar', style: 'width:100%' }, [
            el('span', { className: 'm3-badge m3-badge--primary' }, ['AHORA']),
            curVariantsCount > 1
              ? el('button', { type: 'button', className: 'm3-chip', style: 'padding:2px 8px; font-size:0.75rem', onClick: () => this._vm.cycleTrainerSlotVoicing(curIdx) }, [`⇄ Variante (${curVariantsCount})`])
              : null
          ]),
          curVoicing
            ? createChordDiagramElement(curVoicing, { tuning, notation, size: 'md', leftHanded: this._vm.leftHanded.value, onPlay: (v) => this._vm.playVoicing(v) })
            : el('strong', { className: 'm3-headline' }, [formatChordSymbol(curChord, notation)])
        ]),
        el('div', { className: 'trainer-slot' }, [
          el('div', { className: 'player-toolbar', style: 'width:100%' }, [
            el('span', { className: 'm3-badge' }, ['SIGUIENTE']),
            nextVariantsCount > 1
              ? el('button', { type: 'button', className: 'm3-chip', style: 'padding:2px 8px; font-size:0.75rem', onClick: () => this._vm.cycleTrainerSlotVoicing(nextIdx) }, [`⇄ Variante (${nextVariantsCount})`])
              : null
          ]),
          nextVoicing
            ? createChordDiagramElement(nextVoicing, { tuning, notation, size: 'md', leftHanded: this._vm.leftHanded.value, onPlay: (v) => this._vm.playVoicing(v) })
            : el('strong', { className: 'm3-headline' }, [formatChordSymbol(nextChord, notation)])
        ])
      ])
    ]);

    // =========================================================================
    // 2) CONDUCCIÓN DE VOCES — 100 % CONFIGURABLE (GUITARRA Y BAJO)
    // =========================================================================
    const vlChords = this._vm.voiceLeadingChords.value;
    const vlSteps = this._vm.voiceLedSequence.value;
    const vlStyleOptions = isBass
      ? [
          { value: 'auto', label: 'Estilo: Auto (bajo)' },
          { value: 'decima', label: 'Décimas (R–10)' },
          { value: 'shell', label: 'Shells (R–7–10 / R–3–7)' },
          { value: 'triadas-agudas', label: 'Tríadas agudas (A-D-G)' },
          { value: 'guias', label: 'Notas guía (3–7)' }
        ]
      : [
          { value: 'auto', label: 'Estilo: Auto' },
          { value: '321', label: 'Tríadas 3-2-1' },
          { value: '432', label: 'Tríadas 4-3-2' },
          { value: '5432', label: 'Drop 2 (5-4-3-2)' },
          { value: 'shell', label: 'Shell voicings' }
        ];

    const vlPills = el(
      'div',
      { className: 'm3-chip-row', 'aria-label': 'Progresión editable de conducción de voces' },
      vlChords.map((ch, idx) =>
        el('div', { className: 'builder-pill' }, [
          el('strong', {}, [formatChordSymbol(ch, notation)]),
          idx > 0
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Mover izquierda', onClick: () => this._vm.editVoiceLeadingChord(idx, 'left') }, ['‹'])
            : null,
          idx < vlChords.length - 1
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Mover derecha', onClick: () => this._vm.editVoiceLeadingChord(idx, 'right') }, ['›'])
            : null,
          vlChords.length > 2
            ? el('button', { type: 'button', className: 'm3-icon-btn', style: 'width:28px; height:28px; min-width:28px; min-height:28px', 'aria-label': 'Quitar', onClick: () => this._vm.editVoiceLeadingChord(idx, 'remove') }, ['×'])
            : null
        ])
      )
    );

    const vlStrip = el('div', { className: 'voice-leading-strip' });
    vlSteps.forEach((step, idx) => {
      vlStrip.appendChild(
        el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:4px' }, [
          createChordDiagramElement(step.voicing, {
            tuning,
            notation,
            labelMode: 'functions',
            leftHanded: this._vm.leftHanded.value,
            size: 'sm',
            onPlay: (v) => this._vm.playVoicing(v)
          }),
          el('span', { className: 'm3-label' }, [`${INVERSION_LABELS[step.voicing.computeInversion(tuning)]} · ${step.voicing.getPositionLabel()}`])
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
          el('span', { className: 'm3-body-md' }, ['Editá cualquier progresión, zona y estilo (verde = nota común, azul = grado conjunto)'])
        ]),
        el('div', { className: 'm3-chip-row' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--filled', ripple: true, onClick: () => this._vm.playBuilderProgression(true) }, [icon('play', 16), 'Escuchar']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.randomizeVoiceLeadingChords() }, [icon('wand', 16), 'Aleatoria']),
          el('button', {
            type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true,
            onClick: () => this._vm.saveBuilderAsPractice({
              title: `Conducción ${vlChords.slice(0, 4).join(' – ')}`,
              chords: vlChords,
              voiceLed: vlSteps,
              category: 'conduccion-de-voces',
              notes: `Zona: ${this._vm.voiceLeadingZone.value}, estilo: ${this._vm.voiceLeadingStyle.value}.`
            })
          }, ['Guardar'])
        ])
      ]),
      vlPills,
      this._buildInlineChordAdder(this._draftVl, notation, (sym) => this._vm.addVoiceLeadingChord(sym), true),
      el('div', { className: 'controls-grid' }, [
        this._buildMiniSelect('Zona del diapasón', this._vm.voiceLeadingZone.value, [
          { value: 'libre', label: 'Libre (todo el mango)' },
          { value: 'abierto', label: isBass ? 'Grave / medio (T0–8)' : 'Abierta (T0–5)' },
          { value: 'medio', label: isBass ? 'Media (T3–12)' : 'Media (T3–9)' },
          { value: 'agudo', label: isBass ? 'Aguda (T7–17)' : 'Aguda (T7–14)' }
        ], (z) => this._vm.setVoiceLeadingZone(z)),
        this._buildMiniSelect('Estilo / juego de cuerdas', this._vm.voiceLeadingStyle.value, vlStyleOptions, (st) => this._vm.setVoiceLeadingStyle(st))
      ]),
      vlStrip
    ]);

    // =========================================================================
    // 3) INVERSIONES POR EL MANGO — 100 % CONFIGURABLE (GUITARRA Y BAJO)
    // =========================================================================
    const invChord = this._vm.inversionChord.value;
    const invVoicings = this._vm.getInversionWalkVoicings();

    const invRootSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:6px 10px; min-height:42px; width:auto; flex:1 1 82px',
        'aria-label': 'Raíz para inversiones',
        onChange: (e) => this._vm.selectInversionChord({ root: e.target.value })
      },
      ALL_KEYS.map((k) => el('option', { value: k, selected: k === this._vm.inversionRoot.value }, [formatChordSymbol(k, notation)]))
    );
    invRootSel.value = this._vm.inversionRoot.value;

    const invQualSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:6px 10px; min-height:42px; width:auto; flex:1.4 1 130px',
        'aria-label': 'Calidad para inversiones',
        onChange: (e) => this._vm.selectInversionChord({ quality: e.target.value })
      },
      this._vm.getAvailableQualities().map((q) =>
        el('option', { value: q.id, selected: q.id === this._vm.inversionQuality.value }, [formatQualityOptionLabel(q)])
      )
    );
    invQualSel.value = this._vm.inversionQuality.value;

    const invSets = isBass
      ? [
          { id: 'bass-triadas', label: 'Tríadas agudas' },
          { id: 'bass-shells', label: 'Shells' },
          { id: 'bass-decimas', label: 'Décimas / díadas' },
          { id: 'bass-4c', label: '4 cuerdas' }
        ]
      : [
          { id: '321', label: '3-2-1' },
          { id: '432', label: '4-3-2' },
          { id: '543', label: '5-4-3' },
          { id: '4321', label: 'Drop 2 (4-3-2-1)' },
          { id: '5432', label: 'Drop 2 (5-4-3-2)' }
        ];

    const invCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, [`Inversiones de ${invChord.getSymbol(notation)} por el mango`]),
          el('span', { className: 'm3-body-md' }, [
            isBass
              ? 'Elegí cualquier acorde y explorá sus posiciones de bajo ascendiendo por el diapasón'
              : 'Elegí cualquier acorde y juego de cuerdas para recorrer sus inversiones ascendiendo por el mango'
          ])
        ]),
        el('div', { className: 'm3-chip-row' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--filled', ripple: true, onClick: () => this._vm.playInversionWalk() }, [icon('play', 16), 'Escuchar recorrido']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--tonal', ripple: true, onClick: () => this._vm.randomizeInversionChord() }, [icon('wand', 16), 'Aleatorio'])
        ])
      ]),
      el('div', { className: 'm3-chip-row', style: 'align-items:center' }, [invRootSel, invQualSel]),
      el(
        'div',
        { className: 'm3-chip-row', role: 'group', 'aria-label': 'Juego de cuerdas para inversiones' },
        invSets.map((s) =>
          el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              ripple: true,
              'aria-pressed': String(this._vm.inversionStringSet.value === s.id),
              onClick: () => this._vm.inversionStringSet.set(s.id)
            },
            [s.label]
          )
        )
      ),
      invVoicings.length > 0
        ? el(
            'div',
            { className: 'voice-leading-strip' },
            invVoicings.map((v) =>
              el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:4px' }, [
                el('span', { className: 'm3-badge m3-badge--primary' }, [`${INVERSION_LABELS[v.computeInversion(tuning)]} · ${v.getPositionLabel()}`]),
                el('span', { className: 'm3-body-md', style: 'font-size:0.75rem' }, [v.getUsedStringsLabel(tuning)]),
                createChordDiagramElement(v, {
                  tuning,
                  notation,
                  labelMode: 'functions',
                  leftHanded: this._vm.leftHanded.value,
                  size: 'sm',
                  onPlay: (vo) => this._vm.playVoicing(vo)
                })
              ])
            )
          )
        : el('p', { className: 'm3-body-md' }, ['No se encontraron inversiones en ese juego de cuerdas para esa calidad; probá otro juego o estilo.'])
    ]);

    this._panelHost.append(instCard, trainerCard, vlCard, invCard);
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
   * Abre un diálogo modal ampliado para estudiar una digitación en tamaño grande con leyenda y escucha.
   * @param {import('../models/Voicing.js').Voicing} voicing Voicing seleccionado.
   * @param {import('../models/Tuning.js').Tuning} tuning Afinación activa.
   * @param {'americano'|'latino'} notation Sistema de cifrado.
   */
  _openZoomVoicingModal(voicing, tuning, notation) {
    const content = el('div', { style: 'display:flex; flex-direction:column; align-items:center; gap:12px' }, [
      el('p', { className: 'm3-body-md', style: 'text-align:center' }, [
        `${voicing.getPositionLabel()} · ${voicing.getUsedStringsLabel(tuning)} · ${INVERSION_LABELS[voicing.computeInversion(tuning)]}`
      ]),
      createChordColorLegendElement(),
      createChordDiagramElement(voicing, {
        tuning,
        notation,
        labelMode: this._vm.labelMode.value,
        leftHanded: this._vm.leftHanded.value,
        size: 'lg',
        showTitle: false,
        onPlay: (v) => this._vm.playVoicing(v)
      }),
      el('p', { className: 'm3-body-md', style: 'text-align:center; font-size:0.82rem' }, [
        voicing.toAccessibleDescription(tuning, notation)
      ]),
      el('button', {
        type: 'button',
        className: 'm3-btn m3-btn--filled',
        ripple: true,
        onClick: () => this._vm.playVoicing(voicing)
      }, [icon('play', 18), 'Escuchar digitación'])
    ]);

    openModalDialog({
      title: `${formatChordSymbol(voicing.chord, notation)} — ${voicing.getPositionLabel()}`,
      content,
      actions: [{ label: 'Cerrar', variant: 'tonal' }]
    });
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
