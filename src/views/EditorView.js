import { CATEGORY_LABELS, INSTRUMENT_LABELS, PRACTICE_TYPE_LABELS, formatChordSymbol } from '../core/i18n.js';
import { ALL_KEYS, SHARP_NOTES } from '../core/MusicTheory.js';
import { findVoicingById, getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { ChordQuality } from '../models/ChordQuality.js';
import { COMPING_PATTERNS } from '../models/ProgressionStep.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';
import { ABC_IMPORT_RIGHTS_NOTICE } from '../services/ImportExportService.js';
import { generatePianoVoicings } from '../services/PianoVoicingService.js';
import { SCALE_RHYTHMS } from '../services/ScaleGenerator.js';
import { EDITOR_TEMPLATES, QUICK_CHORDS } from '../viewmodels/EditorViewModel.js';
import {
  createChordColorLegendElement,
  createChordDiagramElement,
  createChordSymbolElement,
  createInteractiveVoicingPicker
} from './ChordDiagramView.js';
import { createPianoChordElement } from './PianoKeyboardView.js';
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
      'aria-label': 'Importar práctica JSON o partitura ABC',
      onChange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.abc')) {
          const ok = await openConfirmDialog({
            title: 'Importar partitura .abc',
            message: ABC_IMPORT_RIGHTS_NOTICE,
            confirmLabel: 'Entendido, importar'
          });
          if (!ok) {
            e.target.value = '';
            return;
          }
        }
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
      options: Object.values(COMPING_PATTERNS).map((p) => ({ value: p.id, label: `${p.label} (${p.patternDisplay})` })),
      onChange: (e) => this._setField('comping', e.target.value)
    });
    this._compingPreviewEl = el('div', { className: 'm3-body-md', style: 'font-family:monospace; font-weight:700' });

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
      this._compingPreviewEl,
      this._fields.tagsText.wrap,
      this._fields.goalsText.wrap,
      this._fields.notes.wrap
    ]);

    // Constructor de progresión de armonía completo: selector de acorde + voicing + 6x5 + compases divididos + repeticiones
    this._harmonyStepsHost = el('div', { style: 'display:flex; flex-direction:column; gap:10px; margin-top:10px' });
    this._harmonyCard = el('div', { className: 'm3-card', style: 'margin-top:14px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h3', { className: 'm3-title-md' }, ['Progresión de acordes, voicings y secciones']),
        el('div', { className: 'stepper-inline' }, [
          el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--outlined', ripple: true, title: 'Repetir la progresión completa ×2', onClick: () => this._vm.repeatProgressionBlock() }, ['Repetir ×2']),
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Quitar último paso', title: 'Quitar último paso', onClick: () => this._vm.resizeProgressionSteps(-1) }, ['−']),
          el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, 'aria-label': 'Agregar paso', title: 'Agregar paso', onClick: () => this._vm.resizeProgressionSteps(1) }, ['+'])
        ])
      ]),
      el('p', { className: 'm3-body-md', style: 'margin-top:4px' }, [
        'Tocá un paso para elegir cualquier acorde y digitación desde la biblioteca, dividir un compás (ii–V) o armar una digitación propia en 6×5.'
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

    // Panel derecho sticky en pantallas anchas: Editor ABC con números de línea + errores resaltados + vista previa en vivo
    this._abcLineNumbers = el('pre', { className: 'abc-line-numbers', 'aria-hidden': 'true' }, ['1']);
    this._fields.abc.control.addEventListener('scroll', () => {
      this._abcLineNumbers.scrollTop = this._fields.abc.control.scrollTop;
    });
    const abcEditorShell = el('div', { className: 'abc-editor-shell' }, [
      this._abcLineNumbers,
      this._fields.abc.wrap
    ]);

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

    const abcCard = el('div', { className: 'm3-card editor-preview-sticky' }, [
      el('div', { className: 'player-toolbar', style: 'margin-bottom:10px' }, [
        el('h2', { className: 'm3-title-md' }, ['Editor ABC y vista previa en vivo']),
        this._previewPlayBtn
      ]),
      abcEditorShell,
      this._abcWarningsBox,
      this._previewScoreEl
    ]);

    const leftCol = el('div', { className: 'editor-col-form' }, [metaCard, this._harmonyCard, chordGridCard]);
    const rightCol = el('div', { className: 'editor-col-preview' }, [abcCard]);
    const layout = el('div', { className: 'editor-layout editor-layout--mobile-form' }, [leftCol, rightCol]);

    // Switcher rápido móvil (<960px): alterna entre Editar y Vista previa sin scrollear toda la página
    const mobileTabForm = el(
      'button',
      {
        type: 'button',
        className: 'm3-segmented__btn',
        ripple: true,
        'aria-pressed': 'true',
        onClick: () => {
          layout.classList.add('editor-layout--mobile-form');
          layout.classList.remove('editor-layout--mobile-preview');
          mobileTabForm.setAttribute('aria-pressed', 'true');
          mobileTabPreview.setAttribute('aria-pressed', 'false');
        }
      },
      ['Editar datos']
    );
    const mobileTabPreview = el(
      'button',
      {
        type: 'button',
        className: 'm3-segmented__btn',
        ripple: true,
        'aria-pressed': 'false',
        onClick: () => {
          layout.classList.remove('editor-layout--mobile-form');
          layout.classList.add('editor-layout--mobile-preview');
          mobileTabForm.setAttribute('aria-pressed', 'false');
          mobileTabPreview.setAttribute('aria-pressed', 'true');
          this._renderLivePreview(this._vm.form.value);
        }
      },
      ['ABC y vista previa']
    );
    const mobileSwitcher = el(
      'div',
      { className: 'm3-segmented m3-segmented--full editor-mobile-switcher', role: 'group', 'aria-label': 'Panel del editor en móvil' },
      [mobileTabForm, mobileTabPreview]
    );

    this._container.appendChild(this._draftBanner);
    this._container.appendChild(this._builtinBanner);
    this._container.appendChild(this._errorsBox);
    this._container.appendChild(actionsCard);
    this._container.appendChild(toolsCard);
    this._container.appendChild(mobileSwitcher);
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
    if (this._compingPreviewEl) {
      this._compingPreviewEl.style.display = showHarmony ? 'block' : 'none';
      const pat = COMPING_PATTERNS[f.comping || 'negras-abajo'] || COMPING_PATTERNS['negras-abajo'];
      this._compingPreviewEl.textContent = `Ritmo activo: ${pat.label} — ${pat.patternDisplay}`;
    }
    if (showHarmony) {
      this._renderHarmonyStepsEditor(f);
    }

    // Actualiza números de línea del editor ABC y resalta borde si hay errores de sintaxis
    if (this._abcLineNumbers) {
      const lineCount = Math.max(8, String(f.abc || '').split('\n').length);
      this._abcLineNumbers.textContent = Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n');
      const hasErr = this._vm.abcWarnings.value.length > 0 && curType !== 'harmony';
      this._fields.abc.control.classList.toggle('abc-textarea--error', hasErr);
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
    const isPiano = f.instruments.includes('piano') && (f.instruments.length === 1 || f.instruments[0] === 'piano');
    if (f.type === 'harmony') {
      const fam = !isPiano && f.instruments.includes('bajo') && f.instruments.length === 1 ? 'bass' : 'guitar';
      const tuning = isPiano ? null : Tuning.defaultForInstrument(fam);
      const notation = this._appVm.settings.value.chordNotation;
      this._previewScoreEl.innerHTML = '';
      const strip = el(
        'div',
        { className: 'harmony-strip' },
        (f.progression || []).map((st) => {
          if (isPiano) {
            const cands = generatePianoVoicings(st.chord || 'C');
            const pv = (st.voicingId ? cands.find((c) => c.id === st.voicingId) : null) || cands[0];
            return el('div', { className: 'harmony-step-card' }, [
              el('strong', {}, [createChordSymbolElement(st.chord || 'C', notation), ` (${st.bars}c)`]),
              pv ? createPianoChordElement(pv, { notation, size: 'sm', labelMode: 'fingers' }) : null
            ]);
          }
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
      showBassFunctions: !isPiano && f.instruments.includes('bajo'),
      isBass: !isPiano && f.instruments.includes('bajo'),
      isPiano,
      stripTitle: true
    });
    const { visualObj, warnings } = this._abc.renderScore(this._previewScoreEl, prepared, {
      width: this._previewScoreEl.clientWidth || 340,
      zoom: 0.95,
      isPiano
    });
    this._lastVisualObj = visualObj;
    if (warnings.length > 0 && this._vm.abcWarnings.value.length === 0) {
      this._vm.abcWarnings.set(warnings, true);
    }
  }

  /**
   * Renderiza los pasos de progresión armónica con tarjeta táctil por compás, selector visual de
   * acorde + voicing desde la biblioteca y "Mis acordes", división de compás (ii–V) y grilla 6×5.
   * @param {object} f Estado actual del formulario.
   */
  _renderHarmonyStepsEditor(f) {
    if (!this._harmonyStepsHost) return;
    const isPiano = f.instruments.includes('piano') && (f.instruments.length === 1 || f.instruments[0] === 'piano');
    const fam = !isPiano && f.instruments.includes('bajo') && f.instruments.length === 1 ? 'bass' : 'guitar';
    const tuning = isPiano ? null : Tuning.defaultForInstrument(fam);
    const notation = this._appVm.settings.value.chordNotation;
    const mySavedChords = isPiano ? [] : (this._appVm.progress.value.customChords || []).filter((v) => v.instrument === fam);
    const allCustom = [...(f.customVoicings || []), ...mySavedChords];
    this._harmonyStepsHost.innerHTML = '';

    (f.progression || []).forEach((step, idx) => {
      const pianoCandidates = isPiano ? generatePianoVoicings(step.chord || 'C') : [];
      const resolvedVoicing = isPiano
        ? ((step.voicingId ? pianoCandidates.find((c) => c.id === step.voicingId) : null) || pianoCandidates[0] || null)
        : (findVoicingById(step.voicingId, allCustom, step.chord || 'C', fam, tuning) ||
          getCuratedVoicingsForChord(step.chord || 'C', fam, tuning)[0]);

      const barsSelect = el(
        'select',
        {
          className: 'm3-field__select',
          style: 'padding:6px 8px; min-height:40px; width:82px',
          'aria-label': `Duración paso ${idx + 1}`,
          onChange: (e) => this._vm.updateProgressionStep(idx, { bars: Number(e.target.value) || 1 })
        },
        [0.5, 1, 2, 4].map((b) => el('option', { value: String(b), selected: Number(step.bars) === b }, [`${b} c.`]))
      );
      barsSelect.value = String(step.bars || 1);

      const secSelect = el(
        'select',
        {
          className: 'm3-field__select',
          style: 'padding:6px 8px; min-height:40px; width:74px',
          'aria-label': `Sección paso ${idx + 1}`,
          onChange: (e) => this._vm.updateProgressionStep(idx, { section: e.target.value || null })
        },
        ['', 'A', 'B', 'C', 'Intro'].map((s) => el('option', { value: s, selected: (step.section || '') === s }, [s ? `Sec. ${s}` : '—']))
      );
      secSelect.value = step.section || '';

      const stepRow = el('div', { className: 'editor-harmony-step' }, [
        el('div', { className: 'editor-harmony-step__head' }, [
          el('span', { className: 'm3-badge' }, [`#${idx + 1}`]),
          el('strong', { style: 'font-size:1.05rem' }, [createChordSymbolElement(step.chord || 'C', notation)]),
          resolvedVoicing
            ? el('span', { className: 'm3-body-md', style: 'font-size:0.78rem' }, [
                isPiano
                  ? resolvedVoicing.getPositionLabel()
                  : `${resolvedVoicing.getPositionLabel()} (${resolvedVoicing.getUsedStringsLabel(tuning)})`
              ])
            : null
        ]),
        el('div', { className: 'm3-chip-row', style: 'align-items:center' }, [
          barsSelect,
          secSelect,
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--tonal',
              ripple: true,
              onClick: () => this._openStepChordVoicingDialog(idx, step, tuning, allCustom, isPiano)
            },
            ['Elegir acorde / voicing']
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--outlined',
              ripple: true,
              title: 'Dividir en 2 acordes dentro del mismo compás (ej. ii–V)',
              onClick: () => this._vm.splitProgressionStep(idx)
            },
            ['÷ 2']
          ),
          !isPiano
            ? el(
                'button',
                {
                  type: 'button',
                  className: 'm3-btn m3-btn--compact m3-btn--outlined',
                  ripple: true,
                  onClick: () => this._openCustomVoicingDialog(idx, step, tuning)
                },
                ['6×5']
              )
            : null,
          resolvedVoicing
            ? el(
                'button',
                {
                  type: 'button',
                  className: 'm3-icon-btn',
                  ripple: true,
                  'aria-label': `Escuchar ${step.chord}`,
                  title: 'Escuchar digitación',
                  onClick: () => this._vm.playVoicingPreview(resolvedVoicing, tuning)
                },
                [icon('play', 18)]
              )
            : null,
          idx > 0
            ? el('button', { type: 'button', className: 'm3-icon-btn', 'aria-label': 'Subir paso', onClick: () => this._vm.editProgressionStepOrder(idx, 'left') }, ['‹'])
            : null,
          idx < (f.progression || []).length - 1
            ? el('button', { type: 'button', className: 'm3-icon-btn', 'aria-label': 'Bajar paso', onClick: () => this._vm.editProgressionStepOrder(idx, 'right') }, ['›'])
            : null,
          (f.progression || []).length > 1
            ? el('button', { type: 'button', className: 'm3-icon-btn', 'aria-label': 'Quitar paso', onClick: () => this._vm.editProgressionStepOrder(idx, 'remove') }, ['×'])
            : null
        ])
      ]);

      this._harmonyStepsHost.appendChild(stepRow);
    });
  }

  /**
   * Abre el selector completo de acorde (raíz + calidad + bajo) y digitación desde la biblioteca
   * y "Mis acordes", con vista previa SVG del diagrama y botón de escucha inmediata.
   * @param {number} stepIdx Índice del paso en la progresión.
   * @param {object} step Paso actual.
   * @param {Tuning} tuning Afinación activa.
   * @param {Array<object>} customPool Voicings personalizados (de la práctica y "Mis acordes").
   */
  _openStepChordVoicingDialog(stepIdx, step, tuning, customPool, isPiano = false) {
    const notation = this._appVm.settings.value.chordNotation;
    let parsed;
    try {
      parsed = Chord.parse(step.chord || 'C');
    } catch {
      parsed = Chord.parse('C');
    }

    let draftRoot = parsed.root;
    let draftQuality = parsed.quality.id;
    let draftBass = parsed.bass || '';
    let selectedVoicingId = step.voicingId || '';

    const gridHost = el('div', { className: 'voicing-group-grid' });
    const buildSymbol = () => `${draftRoot}${draftQuality}${draftBass && draftBass !== draftRoot ? `/${draftBass}` : ''}`;

    const refreshVoicings = () => {
      const sym = buildSymbol();
      const all = isPiano
        ? generatePianoVoicings(sym)
        : [
            ...customPool
              .filter((raw) => raw.chord === sym && raw.instrument === tuning.instrument)
              .map((raw) => (raw instanceof Voicing ? raw : new Voicing(raw))),
            ...getCuratedVoicingsForChord(sym, tuning.instrument, tuning)
          ];
      gridHost.innerHTML = '';

      if (all.length === 0) {
        gridHost.appendChild(
          el('p', { className: 'm3-body-md' }, [
            isPiano
              ? 'No se pudieron generar voicings para este acorde.'
              : 'Sin digitaciones curadas para este acorde; podés crearla con la grilla 6×5.'
          ])
        );
        return;
      }

      for (const v of all.slice(0, 12)) {
        const isSel = selectedVoicingId === v.id;
        gridHost.appendChild(
          el('div', { className: `voicing-grid-card ${isSel ? 'voicing-grid-card--active' : ''}` }, [
            isPiano
              ? createPianoChordElement(v, {
                  notation,
                  size: 'sm',
                  labelMode: 'fingers',
                  onPlay: (vo) => {
                    selectedVoicingId = vo.id;
                    this._vm.playVoicingPreview(vo, tuning);
                    refreshVoicings();
                  }
                })
              : createChordDiagramElement(v, {
                  tuning,
                  notation,
                  size: 'sm',
                  showTitle: false,
                  onPlay: (vo) => {
                    selectedVoicingId = vo.id;
                    this._vm.playVoicingPreview(vo, tuning);
                    refreshVoicings();
                  }
                }),
            el('div', { className: 'voicing-grid-card__meta' }, [
              el('strong', { className: 'm3-label' }, [v.getPositionLabel()]),
              !isPiano ? el('span', { className: 'm3-body-md' }, [v.getUsedStringsLabel(tuning)]) : null
            ]),
            el('div', { className: 'm3-chip-row', style: 'justify-content:center' }, [
              el('button', {
                type: 'button',
                className: `m3-btn m3-btn--compact ${isSel ? 'm3-btn--filled' : 'm3-btn--tonal'}`,
                onClick: () => {
                  selectedVoicingId = v.id;
                  refreshVoicings();
                }
              }, [isSel ? 'Elegida' : 'Elegir']),
              el('button', {
                type: 'button',
                className: 'm3-icon-btn',
                'aria-label': 'Escuchar digitación',
                onClick: () => this._vm.playVoicingPreview(v, tuning)
              }, [icon('play', 16)])
            ])
          ])
        );
      }
    };

    const rootSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 10px; min-height:44px',
        'aria-label': 'Raíz del acorde',
        onChange: (e) => { draftRoot = e.target.value; selectedVoicingId = ''; refreshVoicings(); }
      },
      SHARP_NOTES.map((r) => el('option', { value: r, selected: r === draftRoot }, [formatChordSymbol(r, notation).replace('#', '♯')]))
    );
    rootSel.value = draftRoot;

    const qualSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 10px; min-height:44px',
        'aria-label': 'Calidad del acorde',
        onChange: (e) => { draftQuality = e.target.value; selectedVoicingId = ''; refreshVoicings(); }
      },
      ChordQuality.listAll().map((q) =>
        el('option', { value: q.id, selected: q.id === draftQuality }, [q.id ? `${q.name} (${q.shortName})` : q.name])
      )
    );
    qualSel.value = draftQuality;

    const bassSel = el(
      'select',
      {
        className: 'm3-field__select',
        style: 'padding:8px 10px; min-height:44px',
        'aria-label': 'Inversión o bajo alternativo',
        onChange: (e) => { draftBass = e.target.value; selectedVoicingId = ''; refreshVoicings(); }
      },
      [
        el('option', { value: '' }, ['Inversión: fundamental']),
        ...ALL_KEYS.map((k) => el('option', { value: k, selected: k === draftBass }, [`Bajo en ${formatChordSymbol(k, notation)}`]))
      ]
    );
    bassSel.value = draftBass;

    refreshVoicings();

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [
      el('div', { className: 'controls-grid' }, [rootSel, qualSel, bassSel]),
      createChordColorLegendElement(),
      gridHost
    ]);

    openModalDialog({
      title: `Paso #${stepIdx + 1}: elegir acorde y digitación`,
      content: body,
      actions: [
        { label: 'Cancelar', variant: 'text' },
        ...(!isPiano
          ? [
              {
                label: 'Crear propia (6×5)',
                variant: 'outlined',
                onClick: (close) => {
                  const sym = buildSymbol();
                  this._vm.updateProgressionStep(stepIdx, { chord: sym, voicingId: null });
                  close();
                  setTimeout(() => this._openCustomVoicingDialog(stepIdx, { ...step, chord: sym }, tuning), 40);
                }
              }
            ]
          : []),
        {
          label: 'Aplicar acorde',
          variant: 'filled',
          onClick: (close) => {
            const sym = buildSymbol();
            this._vm.updateProgressionStep(stepIdx, { chord: sym, voicingId: selectedVoicingId || null });
            close();
          }
        }
      ]
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
