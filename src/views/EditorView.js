import { CATEGORY_LABELS, INSTRUMENT_LABELS, PRACTICE_TYPE_LABELS } from '../core/i18n.js';
import { ALL_KEYS } from '../core/MusicTheory.js';
import { findVoicingById, getCuratedVoicingsForChord } from '../data/voicings.js';
import { COMPING_PATTERNS } from '../models/ProgressionStep.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';
import { SCALE_RHYTHMS } from '../services/ScaleGenerator.js';
import { EDITOR_TEMPLATES, QUICK_CHORDS } from '../viewmodels/EditorViewModel.js';
import { createChordDiagramElement, createInteractiveVoicingPicker } from './ChordDiagramView.js';
import { createFloatingField, el, icon, openConfirmDialog, openModalDialog } from './uiHelpers.js';

/**
 * Vista del Editor y Creador de Prácticas (#/editor/ID).
 * Permite editar metadatos, escribir ABC con vista previa y reproducción inmediata,
 * armar una grilla de cifrado por compás, aplicar plantillas, usar los 3 generadores
 * de dominio e importar/exportar archivos JSON y .abc.
 */
export class EditorView {
  /**
   * Inicializa la vista con EditorViewModel, AppViewModel y AbcService (solo para vista previa SVG).
   * @param {import('../viewmodels/EditorViewModel.js').EditorViewModel} vm ViewModel del editor.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   * @param {import('../services/AbcService.js').AbcService} abcService Servicio de renderizado abcjs.
   */
  constructor(vm, appVm, abcService) {
    /** ViewModel del editor. */
    this._vm = vm;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Servicio abcjs para vista previa en vivo. */
    this._abc = abcService;
    /** Contenedor DOM principal. */
    this._container = null;
    /** Lista de desuscripciones activas. */
    this._unsubs = [];
    /** Último visualObj renderizado en la vista previa para reproducción directa. */
    this._lastVisualObj = null;
    /** Bandera interna para evitar sobrescribir el cursor del textarea durante la escritura. */
    this._isSyncingFromInput = false;
  }

  /**
   * Monta la estructura completa del editor en el contenedor DOM.
   * @param {HTMLElement} container Nodo contenedor.
   */
  mount(container) {
    this._container = container;
    this._buildLayout();
    this._bindObservables();
  }

  /**
   * Carga una práctica (o 'nueva') en el editor.
   * @param {string} idOrNew ID de práctica o 'nueva'.
   */
  open(idOrNew) {
    this._vm.loadForEdit(idOrNew);
  }

  /**
   * Detiene la reproducción de vista previa y limpia suscripciones al salir.
   */
  unmount() {
    this._vm.stopPreview();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Construye el layout en dos columnas (formulario + vista previa en vivo).
   */
  _buildLayout() {
    this._container.innerHTML = '';

    // Banners de estado (borrador recuperado, aviso copia de builtin, errores de validación)
    this._draftBanner = el('div', { className: 'alert-box alert-box--info', style: 'display:none; margin-bottom:12px' });
    this._builtinBanner = el('div', { className: 'alert-box alert-box--info', style: 'display:none; margin-bottom:12px' }, [
      'Esta práctica viene incluida en el catálogo (solo lectura). Al guardar se creará tu propia copia editable.'
    ]);
    this._errorsBox = el('div', { className: 'alert-box alert-box--error', style: 'display:none; margin-bottom:12px', role: 'alert' });

    // Barra superior de acciones + importar/exportar
    this._autosaveEl = el('span', { className: 'm3-body-md' });
    this._deleteBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--danger',
        ripple: true,
        style: 'display:none',
        onClick: async () => {
          const ok = await openConfirmDialog({
            title: 'Eliminar práctica',
            message: `¿Seguro que querés eliminar "${this._vm.form.value.title}"? Esta acción no se puede deshacer.`,
            confirmLabel: 'Eliminar',
            danger: true
          });
          if (ok) await this._vm.deleteCurrent();
        }
      },
      [icon('trash', 18), 'Eliminar']
    );

    const fileInput = el('input', {
      type: 'file',
      accept: '.json,.abc,application/json,text/plain',
      className: 'sr-only',
      id: 'editor-import-file',
      onChange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        await this._vm.importFileContent(text, file.name);
        e.target.value = '';
      }
    });

    const actionsCard = el('div', { className: 'm3-card', style: 'margin-bottom:16px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', { className: 'm3-chip-row' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--filled', ripple: true, onClick: () => this._vm.savePractice() }, [icon('check', 18), 'Guardar']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._vm.duplicateCurrent() }, [icon('copy', 18), 'Duplicar']),
          this._deleteBtn
        ]),
        el('div', { className: 'm3-chip-row' }, [
          fileInput,
          el('button', { type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true, onClick: () => fileInput.click() }, [icon('upload', 18), 'Importar JSON / .abc']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--text', ripple: true, onClick: () => this._vm.exportCurrentJson() }, [icon('download', 18), 'JSON']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--text', ripple: true, onClick: () => this._vm.exportCurrentAbc() }, [icon('download', 18), '.abc']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--text', ripple: true, onClick: () => this._vm.exportUserCollection() }, ['Exportar colección'])
        ])
      ]),
      el('div', { style: 'margin-top:8px' }, [this._autosaveEl])
    ]);

    // Plantillas y Generadores
    const templatesRow = el(
      'div',
      { className: 'm3-chip-row', style: 'margin-top:8px' },
      Object.entries(EDITOR_TEMPLATES).map(([id, tpl]) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            onClick: () => this._vm.applyTemplate(id)
          },
          [tpl.label]
        )
      )
    );

    const generatorsRow = el('div', { className: 'm3-chip-row', style: 'margin-top:10px' }, [
      el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._openScaleGeneratorDialog() }, [icon('wand', 18), 'Generar escala / arpegio']),
      el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._openProgressionGeneratorDialog() }, [icon('wand', 18), 'Generar progresión']),
      el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._openWalkingGeneratorDialog() }, [icon('wand', 18), 'Generar walking bass'])
    ]);

    const toolsCard = el('div', { className: 'm3-card', style: 'margin-bottom:16px' }, [
      el('h2', { className: 'm3-title-md' }, ['Plantillas y generadores musicales']),
      el('p', { className: 'm3-body-md' }, ['Elegí una plantilla rápida o generá notación ABC automática que después podés editar a mano.']),
      templatesRow,
      generatorsRow
    ]);

    // Campos de metadatos con etiqueta flotante
    this._fields = {
      title: createFloatingField({ id: 'ed-title', label: 'Título de la práctica', onInput: (e) => this._setField('title', e.target.value) }),
      category: createFloatingField({
        id: 'ed-cat', label: 'Categoría', kind: 'select',
        options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
        onChange: (e) => this._setField('category', e.target.value)
      }),
      level: createFloatingField({
        id: 'ed-lvl', label: 'Nivel (1–5)', kind: 'select',
        options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Nivel ${n}` })),
        onChange: (e) => this._setField('level', Number(e.target.value))
      }),
      key: createFloatingField({ id: 'ed-key', label: 'Tonalidad (ej. C, F, Am)', onInput: (e) => this._setField('key', e.target.value) }),
      timeSignature: createFloatingField({ id: 'ed-ts', label: 'Compás (ej. 4/4, 6/8)', onInput: (e) => this._setField('timeSignature', e.target.value) }),
      tempoStart: createFloatingField({ id: 'ed-tstart', label: 'BPM inicial', type: 'number', min: 40, max: 240, onInput: (e) => this._setField('tempoStart', Number(e.target.value)) }),
      tempoTarget: createFloatingField({ id: 'ed-ttarget', label: 'BPM objetivo', type: 'number', min: 40, max: 240, onInput: (e) => this._setField('tempoTarget', Number(e.target.value)) }),
      tempoStep: createFloatingField({ id: 'ed-tstep', label: 'Incremento BPM', type: 'number', min: 1, max: 40, onInput: (e) => this._setField('tempoStep', Number(e.target.value)) }),
      tagsText: createFloatingField({ id: 'ed-tags', label: 'Etiquetas (separadas por coma)', onInput: (e) => this._setField('tagsText', e.target.value) }),
      goalsText: createFloatingField({ id: 'ed-goals', label: 'Objetivos (uno por línea)', kind: 'textarea', onInput: (e) => this._setField('goalsText', e.target.value) }),
      notes: createFloatingField({ id: 'ed-notes', label: 'Notas y consejos de estudio', kind: 'textarea', onInput: (e) => this._setField('notes', e.target.value) }),
      abc: createFloatingField({ id: 'ed-abc', label: 'Notación ABC (pentagrama y cifrado)', kind: 'textarea', extraClass: 'abc-textarea', onInput: (e) => this._setField('abc', e.target.value) })
    };

    this._instChips = el('div', { className: 'm3-chip-row', role: 'group', 'aria-label': 'Instrumentos' });
    this._typeSeg = el('div', { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Tipo de práctica' });

    this._fields.comping = createFloatingField({
      id: 'ed-comping',
      label: 'Patrón de ritmo (armonía)',
      kind: 'select',
      options: Object.values(COMPING_PATTERNS).map((p) => ({ value: p.id, label: p.label })),
      onChange: (e) => this._setField('comping', e.target.value)
    });

    const metaCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('h2', { className: 'm3-title-md' }, ['Datos de la práctica']),
      this._typeSeg,
      this._fields.title.wrap,
      el('div', {}, [
        el('div', { className: 'm3-body-md', style: 'margin-bottom:6px' }, ['Instrumentos']),
        this._instChips
      ]),
      el('div', { className: 'editor-form-grid' }, [
        this._fields.category.wrap,
        this._fields.level.wrap,
        this._fields.key.wrap,
        this._fields.timeSignature.wrap,
        this._fields.comping.wrap,
        this._fields.tempoStart.wrap,
        this._fields.tempoTarget.wrap,
        this._fields.tempoStep.wrap
      ]),
      this._fields.tagsText.wrap,
      this._fields.goalsText.wrap,
      this._fields.notes.wrap
    ]);

    // Constructor de progresión de armonía con selector de voicing y grilla interactiva 6x5
    this._harmonyStepsHost = el('div', { style: 'display:flex; flex-direction:column; gap:10px; margin-top:10px' });
    this._harmonyCard = el('div', { className: 'm3-card', style: 'margin-top:14px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h3', { className: 'm3-title-md' }, ['Progresión de acordes y voicings']),
        el('div', { className: 'stepper-inline' }, [
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Quitar último paso', onClick: () => this._vm.resizeProgressionSteps(-1) }, ['−']),
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Agregar paso', onClick: () => this._vm.resizeProgressionSteps(1) }, ['+'])
        ])
      ]),
      this._harmonyStepsHost
    ]);

    // Grilla visual de cifrado por compás + botones de acordes comunes
    this._chordGridHost = el('div', { className: 'chord-editor-grid', style: 'margin:10px 0' });
    const quickChordButtons = el(
      'div',
      { className: 'm3-chip-row', style: 'margin-top:8px' },
      QUICK_CHORDS.map((ch) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            onClick: () => this._insertChordAtCursor(ch)
          },
          [ch]
        )
      )
    );

    const chordGridCard = el('div', { className: 'm3-card', style: 'margin-top:14px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h3', { className: 'm3-title-md' }, ['Grilla de cifrado por compás']),
        el('div', { className: 'stepper-inline' }, [
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Quitar último compás', onClick: () => this._vm.resizeChordGrid(-1) }, ['−']),
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Agregar compás', onClick: () => this._vm.resizeChordGrid(1) }, ['+']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => this._vm.applyChordGridToAbc() }, ['Insertar en ABC'])
        ])
      ]),
      this._chordGridHost,
      el('div', { className: 'm3-body-md', style: 'margin-top:8px' }, ['Insertar acorde rápido en el editor ABC:']),
      quickChordButtons
    ]);

    // Panel derecho: Editor ABC + errores de sintaxis + vista previa en vivo + reproducción
    this._abcWarningsBox = el('div', { className: 'alert-box alert-box--error', style: 'display:none; margin-top:10px' });
    this._previewScoreEl = el('div', { className: 'score-surface', style: 'margin-top:12px', 'aria-label': 'Vista previa de la partitura' });
    this._previewPlayBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--filled',
        ripple: true,
        onClick: () => this._vm.togglePreviewPlay(this._lastVisualObj)
      },
      [icon('play', 18), 'Escuchar vista previa']
    );

    const abcCard = el('div', { className: 'm3-card' }, [
      el('div', { className: 'player-toolbar', style: 'margin-bottom:10px' }, [
        el('h2', { className: 'm3-title-md' }, ['Editor ABC y vista previa en vivo']),
        this._previewPlayBtn
      ]),
      this._fields.abc.wrap,
      this._abcWarningsBox,
      this._previewScoreEl
    ]);

    const leftCol = el('div', {}, [metaCard, this._harmonyCard, chordGridCard]);
    const layout = el('div', { className: 'editor-layout' }, [leftCol, abcCard]);

    this._container.appendChild(this._draftBanner);
    this._container.appendChild(this._builtinBanner);
    this._container.appendChild(this._errorsBox);
    this._container.appendChild(actionsCard);
    this._container.appendChild(toolsCard);
    this._container.appendChild(layout);
  }

  /**
   * Vincula las suscripciones a los observables de EditorViewModel.
   */
  _bindObservables() {
    this._unsubs = [
      this._vm.form.subscribe((f) => {
        this._syncFormToDom(f);
        this._renderLivePreview(f);
      }),
      this._vm.mode.subscribe((m) => {
        this._deleteBtn.style.display = m === 'edit' ? 'inline-flex' : 'none';
      }),
      this._vm.isBuiltinSource.subscribe((isBuiltin) => {
        this._builtinBanner.style.display = isBuiltin ? 'block' : 'none';
      }),
      this._vm.draftRecovered.subscribe((recovered) => {
        this._draftBanner.innerHTML = '';
        this._draftBanner.style.display = recovered ? 'flex' : 'none';
        if (recovered) {
          this._draftBanner.style.justifyContent = 'space-between';
          this._draftBanner.style.alignItems = 'center';
          this._draftBanner.appendChild(el('span', {}, ['Se recuperó tu borrador guardado automáticamente.']));
          this._draftBanner.appendChild(
            el('button', { type: 'button', className: 'm3-btn m3-btn--text', onClick: () => this._vm.discardDraft() }, ['Descartar borrador'])
          );
        }
      }),
      this._vm.autosaveLabel.subscribe((txt) => {
        this._autosaveEl.textContent = txt;
      }),
      this._vm.validationErrors.subscribe((errs) => {
        this._errorsBox.innerHTML = '';
        this._errorsBox.style.display = errs.length > 0 ? 'block' : 'none';
        if (errs.length > 0) {
          this._errorsBox.appendChild(el('strong', {}, ['Revisá estos campos:']));
          this._errorsBox.appendChild(el('ul', { className: 'goals-list' }, errs.map((er) => el('li', {}, [er]))));
        }
      }),
      this._vm.abcWarnings.subscribe((warns) => {
        this._abcWarningsBox.innerHTML = '';
        this._abcWarningsBox.style.display = warns.length > 0 ? 'block' : 'none';
        if (warns.length > 0) {
          this._abcWarningsBox.appendChild(el('strong', {}, ['Advertencias de sintaxis ABC:']));
          this._abcWarningsBox.appendChild(el('ul', { className: 'goals-list' }, warns.map((w) => el('li', {}, [w]))));
        }
      }),
      this._vm.chordGridBars.subscribe((bars) => this._renderChordGrid(bars)),
      this._vm.isPreviewPlaying.subscribe((playing) => {
        this._previewPlayBtn.innerHTML = '';
        this._previewPlayBtn.appendChild(icon(playing ? 'stop' : 'play', 18));
        this._previewPlayBtn.appendChild(el('span', {}, [playing ? 'Detener' : 'Escuchar vista previa']));
      })
    ];
  }

  /**
   * Actualiza un campo en el ViewModel evitando reiniciar el foco mientras el usuario tipea.
   * @param {string} field Clave del campo.
   * @param {*} value Nuevo valor.
   */
  _setField(field, value) {
    this._isSyncingFromInput = true;
    this._vm.updateField(field, value);
    this._isSyncingFromInput = false;
  }

  /**
   * Sincroniza el estado observable del formulario hacia los controles DOM.
   * @param {object} f Estado del formulario.
   */
  _syncFormToDom(f) {
    if (!this._isSyncingFromInput) {
      for (const [key, fieldObj] of Object.entries(this._fields)) {
        const nextVal = String(f[key] ?? '');
        if (fieldObj.control.value !== nextVal) {
          fieldObj.control.value = nextVal;
        }
      }
    }

    // Actualiza selector de tipo (Melodía / Armonía / Mixta)
    const curType = f.type || 'melody';
    this._typeSeg.innerHTML = '';
    for (const t of ['melody', 'harmony', 'mixed']) {
      this._typeSeg.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(curType === t),
            onClick: () => this._vm.updateField('type', t)
          },
          [PRACTICE_TYPE_LABELS[t]]
        )
      );
    }

    const showHarmony = curType === 'harmony' || curType === 'mixed';
    this._harmonyCard.style.display = showHarmony ? 'block' : 'none';
    this._fields.comping.wrap.style.display = showHarmony ? 'flex' : 'none';
    if (showHarmony) {
      this._renderHarmonyStepsEditor(f);
    }

    // Actualiza chips de instrumentos
    this._instChips.innerHTML = '';
    for (const [instKey, instLabel] of Object.entries(INSTRUMENT_LABELS)) {
      const selected = f.instruments.includes(instKey);
      this._instChips.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(selected),
            onClick: () => this._vm.toggleInstrument(instKey)
          },
          [instLabel]
        )
      );
    }
  }

  /**
   * Renderiza la partitura de vista previa en vivo usando AbcService.
   * @param {object} f Estado actual del formulario.
   */
  _renderLivePreview(f) {
    if (!this._previewScoreEl) return;
    if (f.type === 'harmony') {
      const fam = f.instruments.includes('bajo') && f.instruments.length === 1 ? 'bass' : 'guitar';
      const tuning = Tuning.defaultForInstrument(fam);
      const notation = this._appVm.settings.value.chordNotation;
      this._previewScoreEl.innerHTML = '';
      const strip = el(
        'div',
        { className: 'harmony-strip' },
        (f.progression || []).map((st) => {
          const v = findVoicingById(st.voicingId, f.customVoicings || [], st.chord, fam) ||
            getCuratedVoicingsForChord(st.chord, fam, tuning)[0];
          return el('div', { className: 'harmony-step-card' }, [
            el('strong', {}, [`${st.chord} (${st.bars}c)`]),
            v ? createChordDiagramElement(v, { tuning, notation, size: 'sm', showTitle: false }) : null
          ]);
        })
      );
      this._previewScoreEl.appendChild(strip);
      this._lastVisualObj = null;
      return;
    }

    const prepared = this._abc.prepareAbcForRender(f.abc, {
      viewMode: 'mixto',
      chordNotation: this._appVm.settings.value.chordNotation,
      showFingerings: true,
      fingerings: f.fingerings || {},
      showBassFunctions: f.instruments.includes('bajo'),
      isBass: f.instruments.includes('bajo'),
      stripTitle: true
    });
    const { visualObj, warnings } = this._abc.renderScore(this._previewScoreEl, prepared, {
      width: this._previewScoreEl.clientWidth || 340,
      zoom: 0.95
    });
    this._lastVisualObj = visualObj;
    if (warnings.length > 0 && this._vm.abcWarnings.value.length === 0) {
      this._vm.abcWarnings.set(warnings, true);
    }
  }

  /**
   * Renderiza los pasos de progresión armónica con selector de voicing de biblioteca
   * y botón para armar una digitación propia en una grilla táctil de 6×5 trastes.
   * @param {object} f Estado actual del formulario.
   */
  _renderHarmonyStepsEditor(f) {
    if (!this._harmonyStepsHost) return;
    const fam = f.instruments.includes('bajo') && f.instruments.length === 1 ? 'bass' : 'guitar';
    const tuning = Tuning.defaultForInstrument(fam);
    this._harmonyStepsHost.innerHTML = '';

    (f.progression || []).forEach((step, idx) => {
      const curated = getCuratedVoicingsForChord(step.chord || 'C', fam, tuning);
      const customMatch = (f.customVoicings || []).filter((v) => v.chord === step.chord);
      const allOpts = [...customMatch, ...curated];

      const chordIn = el('input', {
        type: 'text',
        value: step.chord,
        className: 'm3-field__input',
        style: 'padding:8px 10px; min-height:44px; width:92px',
        'aria-label': `Acorde paso ${idx + 1}`,
        onChange: (e) => this._vm.updateProgressionStep(idx, { chord: e.target.value.trim() || 'C', voicingId: null })
      });

      const barsIn = el('input', {
        type: 'number',
        min: 0.5, max: 8, step: 0.5,
        value: step.bars,
        className: 'm3-field__input',
        style: 'padding:8px; min-height:44px; width:68px',
        'aria-label': `Compases paso ${idx + 1}`,
        onChange: (e) => this._vm.updateProgressionStep(idx, { bars: Math.max(0.5, Number(e.target.value) || 1) })
      });

      const voicingSelect = el(
        'select',
        {
          className: 'm3-field__select',
          style: 'padding:8px 10px; min-height:44px; flex:1 1 140px',
          'aria-label': `Voicing paso ${idx + 1}`,
          onChange: (e) => this._vm.updateProgressionStep(idx, { voicingId: e.target.value || null })
        },
        [
          el('option', { value: '' }, ['Automático (biblioteca)']),
          ...allOpts.map((v) =>
            el('option', { value: v.id, selected: v.id === step.voicingId }, [
              `${v.id} (T${v.baseFret})`
            ])
          )
        ]
      );
      voicingSelect.value = step.voicingId || '';

      const customBtn = el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--outlined',
          ripple: true,
          onClick: () => this._openCustomVoicingDialog(idx, step, tuning)
        },
        ['Digitar 6×5']
      );

      this._harmonyStepsHost.appendChild(
        el('div', { className: 'stepper-inline', style: 'width:100%' }, [
          el('span', { className: 'm3-label' }, [`#${idx + 1}`]),
          chordIn,
          barsIn,
          el('span', { className: 'm3-body-md' }, ['c.']),
          voicingSelect,
          customBtn
        ])
      );
    });
  }

  /**
   * Abre el diálogo interactivo de grilla 6×5 (o 4×5 en bajo) para crear una digitación propia.
   * @param {number} stepIdx Índice del paso de progresión.
   * @param {object} step Datos actuales del paso.
   * @param {Tuning} tuning Afinación activa.
   */
  _openCustomVoicingDialog(stepIdx, step, tuning) {
    const existing = findVoicingById(step.voicingId, this._vm.form.value.customVoicings || [], step.chord, tuning.instrument) ||
      new Voicing({
        id: `custom-${step.chord.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`,
        chord: step.chord,
        instrument: tuning.instrument,
        frets: Array(tuning.stringCount).fill(null),
        fingers: Array(tuning.stringCount).fill(null)
      });

    let working = new Voicing({
      ...existing.toJSON(),
      id: existing.id.startsWith('custom-') ? existing.id : `custom-${step.chord.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`,
      chord: step.chord
    });

    const previewHost = el('div', { style: 'display:flex; justify-content:center' });
    const renderPreview = () => {
      previewHost.innerHTML = '';
      previewHost.appendChild(
        createChordDiagramElement(working, {
          tuning,
          notation: this._appVm.settings.value.chordNotation,
          size: 'md',
          labelMode: 'functions'
        })
      );
    };

    const picker = createInteractiveVoicingPicker(working, tuning, (nextVoicing) => {
      working = nextVoicing;
      renderPreview();
    });
    renderPreview();

    openModalDialog({
      title: `Crear digitación propia — ${step.chord}`,
      body: el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [previewHost, picker]),
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Usar esta digitación',
          variant: 'm3-btn--filled',
          onClick: (close) => {
            this._vm.attachCustomVoicingToStep(stepIdx, working);
            close();
          }
        }
      ]
    });
  }

  /**
   * Renderiza la grilla editable de acordes por compás.
   * @param {string[]} bars Arreglo de acordes.
   */
  _renderChordGrid(bars) {
    if (!this._chordGridHost) return;
    this._chordGridHost.innerHTML = '';
    bars.forEach((chord, idx) => {
      const input = el('input', {
        type: 'text',
        value: chord,
        placeholder: 'Ej. Dm7',
        'aria-label': `Acorde del compás ${idx + 1}`,
        onInput: (e) => this._vm.updateChordGridBar(idx, e.target.value)
      });
      this._chordGridHost.appendChild(
        el('div', { className: 'chord-editor-bar' }, [
          el('span', { className: 'm3-label' }, [`Compás ${idx + 1}`]),
          input
        ])
      );
    });
  }

  /**
   * Inserta un símbolo de acorde entre comillas en la posición actual del cursor del textarea ABC.
   * @param {string} chordSymbol Acorde americano (ej. "Dm7").
   */
  _insertChordAtCursor(chordSymbol) {
    const ta = this._fields.abc.control;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const insertion = `"${chordSymbol}"`;
    const nextValue = ta.value.slice(0, start) + insertion + ta.value.slice(end);
    ta.value = nextValue;
    this._vm.updateField('abc', nextValue);
    ta.focus();
    ta.setSelectionRange(start + insertion.length, start + insertion.length);
  }

  /**
   * Abre el diálogo modal del generador de escalas y arpegios.
   */
  _openScaleGeneratorDialog() {
    const keyField = createFloatingField({
      id: 'gen-scale-key', label: 'Tonalidad', kind: 'select', value: this._vm.form.value.key || 'C',
      options: ALL_KEYS.map((k) => ({ value: k, label: k }))
    });
    const typeField = createFloatingField({
      id: 'gen-scale-type', label: 'Escala o arpegio', kind: 'select', value: 'mayor',
      options: this._vm.scaleGenerator.getAvailableTypes().map((t) => ({ value: t.id, label: t.name }))
    });
    const octField = createFloatingField({
      id: 'gen-scale-oct', label: 'Rango', kind: 'select', value: '1',
      options: [{ value: '1', label: '1 octava' }, { value: '2', label: '2 octavas' }]
    });
    const rhythmField = createFloatingField({
      id: 'gen-scale-rhythm', label: 'Ritmo', kind: 'select', value: 'corcheas',
      options: Object.entries(SCALE_RHYTHMS).map(([value, cfg]) => ({ value, label: cfg.label }))
    });
    const dirField = createFloatingField({
      id: 'gen-scale-dir', label: 'Dirección', kind: 'select', value: 'asc-desc',
      options: [
        { value: 'asc-desc', label: 'Ida y vuelta' },
        { value: 'asc', label: 'Solo ascendente' },
        { value: 'desc', label: 'Solo descendente' }
      ]
    });
    const instField = createFloatingField({
      id: 'gen-scale-inst', label: 'Instrumento / Clave', kind: 'select',
      value: this._vm.form.value.instruments[0] || 'guitarra',
      options: Object.entries(INSTRUMENT_LABELS).map(([value, label]) => ({ value, label }))
    });

    const body = el('div', { className: 'editor-form-grid' }, [
      keyField.wrap, typeField.wrap, octField.wrap, rhythmField.wrap, dirField.wrap, instField.wrap
    ]);

    openModalDialog({
      title: 'Generador de escalas y arpegios',
      body,
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Generar ABC',
          variant: 'm3-btn--filled',
          onClick: (close) => {
            this._vm.runScaleGenerator({
              key: keyField.control.value,
              type: typeField.control.value,
              octaves: Number(octField.control.value),
              rhythm: rhythmField.control.value,
              direction: dirField.control.value,
              instrument: instField.control.value
            });
            close();
          }
        }
      ]
    });
  }

  /**
   * Abre el diálogo modal del generador de progresiones armónicas con notas guía.
   */
  _openProgressionGeneratorDialog() {
    const templates = this._vm.progressionGenerator.getAvailableTemplates();
    const tplField = createFloatingField({
      id: 'gen-prog-tpl', label: 'Esquema de grados', kind: 'select', value: 'ii-V-I',
      options: templates.map((t) => ({ value: t.id, label: t.name }))
    });
    const keyField = createFloatingField({
      id: 'gen-prog-key', label: 'Tonalidad', kind: 'select', value: this._vm.form.value.key || 'C',
      options: ALL_KEYS.map((k) => ({ value: k, label: k }))
    });
    const patField = createFloatingField({
      id: 'gen-prog-pat', label: 'Melodía base', kind: 'select', value: 'blancas',
      options: [
        { value: 'blancas', label: 'Notas guía en blancas (3ª y 7ª)' },
        { value: 'negras', label: 'Notas guía en negras' },
        { value: 'arpegio', label: 'Arpegio del acorde en negras' }
      ]
    });
    const instField = createFloatingField({
      id: 'gen-prog-inst', label: 'Instrumento', kind: 'select',
      value: this._vm.form.value.instruments[0] || 'guitarra',
      options: Object.entries(INSTRUMENT_LABELS).map(([value, label]) => ({ value, label }))
    });

    const body = el('div', { className: 'editor-form-grid' }, [
      tplField.wrap, keyField.wrap, patField.wrap, instField.wrap
    ]);

    openModalDialog({
      title: 'Generador de progresiones',
      body,
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Generar progresión',
          variant: 'm3-btn--filled',
          onClick: (close) => {
            this._vm.runProgressionGenerator({
              templateId: tplField.control.value,
              key: keyField.control.value,
              pattern: patField.control.value,
              instrument: instField.control.value
            });
            close();
          }
        }
      ]
    });
  }

  /**
   * Abre el diálogo modal del generador de líneas de walking bass.
   */
  _openWalkingGeneratorDialog() {
    const chordsField = createFloatingField({
      id: 'gen-walk-chords',
      label: 'Cifrado por compás (separado por | o espacio)',
      kind: 'textarea',
      value: 'F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 | C7'
    });
    const keyField = createFloatingField({
      id: 'gen-walk-key', label: 'Tonalidad', kind: 'select', value: 'F',
      options: ALL_KEYS.map((k) => ({ value: k, label: k }))
    });
    const variantField = createFloatingField({
      id: 'gen-walk-var', label: 'Variante', kind: 'select', value: 'clasico',
      options: [
        { value: 'clasico', label: 'Clásico en negras (raíz, acorde, aprox.)' },
        { value: 'movimiento', label: 'Más movimiento (notas de paso)' },
        { value: 'tresillos', label: 'Con tresillos swing de enlace' }
      ]
    });
    const approachField = createFloatingField({
      id: 'gen-walk-app', label: 'Aproximación tiempo 4', kind: 'select', value: 'cromatica',
      options: [
        { value: 'cromatica', label: 'Cromática (medio tono)' },
        { value: 'diatonica', label: 'Diatónica (tono entero)' }
      ]
    });

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [
      chordsField.wrap,
      el('div', { className: 'editor-form-grid' }, [keyField.wrap, variantField.wrap, approachField.wrap])
    ]);

    openModalDialog({
      title: 'Generador de Walking Bass',
      body,
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Generar walking bass',
          variant: 'm3-btn--filled',
          onClick: (close) => {
            try {
              this._vm.runWalkingBassGenerator({
                chords: chordsField.control.value,
                key: keyField.control.value,
                variant: variantField.control.value,
                approach: approachField.control.value
              });
              close();
            } catch (err) {
              this._appVm.showSnackbar(err.message);
            }
          }
        }
      ]
    });
  }
}
