import { Observable } from '../core/Observable.js';
import { validateAbcInstrumentRange, validateAbcMeasures } from '../services/AbcService.js';
import { Practice, generatePracticeId, validatePracticeSchema } from '../models/Practice.js';
import {
  EDITOR_TEMPLATES,
  QUICK_CHORDS,
  createBlankEditorForm,
  editorFormToCandidate,
  practiceToEditorForm
} from '../services/PracticeFactoryService.js';
import { EditorImportExportViewModel } from './editor/EditorImportExportViewModel.js';
import { EditorProgressionViewModel } from './editor/EditorProgressionViewModel.js';

export { EDITOR_TEMPLATES, QUICK_CHORDS };

/**
 * ViewModel coordinador del Editor y Creador de Prácticas (#/editor/ID).
 * Compone `EditorProgressionViewModel` y `EditorImportExportViewModel`, delegando
 * mapeos puros de formulario en `PracticeFactoryService`.
 */
export class EditorViewModel {
  /**
   * Construye el ViewModel del editor inyectando todos los servicios por constructor.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({
    appVm,
    storageService,
    abcService,
    audioService,
    scaleGenerator,
    progressionGenerator,
    walkingBassGenerator,
    importExportService
  }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Servicio de persistencia para borradores automáticos. */
    this._storage = storageService;
    /** Servicio ABC para diagnóstico en vivo. */
    this._abc = abcService;
    /** Generador puro de escalas y arpegios. */
    this.scaleGenerator = scaleGenerator;
    /** Generador puro de progresiones de acordes. */
    this.progressionGenerator = progressionGenerator;
    /** Generador puro de walking bass. */
    this.walkingBassGenerator = walkingBassGenerator;

    /** Modo actual del editor ('new' | 'edit'). */
    this.mode = new Observable('new');
    /** Clave de borrador actual en almacenamiento. */
    this._draftKey = 'nueva';
    /** Indica si la práctica proviene del catálogo incluido. */
    this.isBuiltinSource = new Observable(false);
    /** Indica si se recuperó un borrador guardado automáticamente. */
    this.draftRecovered = new Observable(false);
    /** Estado del formulario de la práctica en edición. */
    this.form = new Observable(createBlankEditorForm());
    /** Errores de validación del esquema. */
    this.validationErrors = new Observable([]);
    /** Advertencias sintácticas ABC en vivo. */
    this.abcWarnings = new Observable([]);
    /** Etiqueta de estado del autoguardado. */
    this.autosaveLabel = new Observable('');
    /** Temporizador de debounce para autoguardado de borrador. */
    this._draftTimer = null;

    /** Sub-ViewModel de edición de progresiones, grilla de compases y voicings 6×5. */
    this.progressionEditor = new EditorProgressionViewModel({
      appVm,
      form: this.form,
      progressionGenerator,
      audioService,
      onUpdateField: (field, val) => this.updateField(field, val),
      onCommitForm: (nextForm) => {
        this.form.set(nextForm, true);
        this._scheduleDraftSave(nextForm);
      }
    });

    /** Sub-ViewModel de vista previa de audio e importación/exportación. */
    this.ioPreview = new EditorImportExportViewModel({
      appVm,
      form: this.form,
      validationErrors: this.validationErrors,
      abcService,
      audioService,
      importExportService,
      validateFormFn: () => this.validateForm(),
      buildCandidateFn: () => this.buildCandidateObject(),
      onReloadPractice: (id) => this.loadForEdit(id)
    });

    // Alias observables hacia sub-ViewModels para compatibilidad con EditorView y tests
    this.chordGridBars = this.progressionEditor.chordGridBars;
    this.isPreviewPlaying = this.ioPreview.isPreviewPlaying;
  }

  /** Carga una práctica existente por ID o inicializa el editor para crear una nueva. */
  async loadForEdit(idOrNew = 'nueva') {
    this._cancelDraftSave();
    this.ioPreview.stopPreview();
    this.validationErrors.set([]);
    this.draftRecovered.set(false);
    this.autosaveLabel.set('');

    if (!idOrNew || idOrNew === 'nueva') {
      this.mode.set('new');
      this.isBuiltinSource.set(false);
      this._draftKey = 'nueva';
      const savedDraft = await this._storage.loadDraft('nueva');
      this.form.set(savedDraft?.data ? { ...createBlankEditorForm(), ...savedDraft.data } : createBlankEditorForm(), true);
      this.draftRecovered.set(Boolean(savedDraft?.data));
      this.progressionEditor.syncChordGridFromAbc();
      this._validateAbcLive();
      return;
    }

    const existing = this._appVm.findPracticeById(idOrNew);
    if (!existing) {
      this._appVm.showSnackbar('No se encontró la práctica. Podés crear una nueva.');
      await this.loadForEdit('nueva');
      return;
    }

    this._draftKey = existing.id;
    const isBuiltin = existing.isReadOnly;
    this.isBuiltinSource.set(isBuiltin);
    this.mode.set(isBuiltin ? 'new' : 'edit');

    const baseForm = practiceToEditorForm(existing, isBuiltin);
    const savedDraft = await this._storage.loadDraft(this._draftKey);
    this.form.set(savedDraft?.data ? { ...baseForm, ...savedDraft.data } : baseForm, true);
    this.draftRecovered.set(Boolean(savedDraft?.data));
    this.progressionEditor.syncChordGridFromAbc();
    this._validateAbcLive();
  }

  /** Actualiza un campo del formulario, revalida ABC si corresponde y agenda autoguardado. */
  updateField(field, value) {
    const next = { ...this.form.value, [field]: value };
    this.form.set(next, true);
    if (field === 'abc') this._validateAbcLive();
    this._scheduleDraftSave(next);
  }

  /** Alterna un instrumento asegurando siempre al menos uno activo. */
  toggleInstrument(instrument) {
    const current = [...this.form.value.instruments];
    const idx = current.indexOf(instrument);
    if (idx >= 0) {
      if (current.length === 1) return;
      current.splice(idx, 1);
    } else {
      current.push(instrument);
    }
    this.updateField('instruments', current);
  }

  /** Aplica una de las plantillas predefinidas al formulario actual. */
  applyTemplate(templateId) {
    const tpl = EDITOR_TEMPLATES[templateId];
    if (!tpl) return;
    const next = {
      ...this.form.value,
      type: tpl.type || 'melody',
      category: tpl.category,
      level: tpl.level,
      key: tpl.key,
      timeSignature: tpl.timeSignature,
      comping: tpl.comping || this.form.value.comping,
      tempoStart: tpl.tempo.start,
      tempoTarget: tpl.tempo.target,
      tempoStep: tpl.tempo.step,
      goalsText: tpl.goals.join('\n'),
      notes: tpl.notes,
      abc: tpl.abc ?? '',
      progression: tpl.progression ? tpl.progression.map((s) => ({ ...s })) : this.form.value.progression,
      instruments: tpl.instruments ? [...tpl.instruments] : this.form.value.instruments
    };
    this.form.set(next, true);
    this.progressionEditor.syncChordGridFromAbc();
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar(`Plantilla "${tpl.label}" aplicada.`);
  }

  /** Ejecuta el generador de escalas y arpegios volcando el ABC al formulario. */
  runScaleGenerator(options) {
    const res = this.scaleGenerator.generate(options);
    const next = {
      ...this.form.value,
      title: options.title || res.title,
      key: res.key,
      timeSignature: res.timeSignature,
      category: options.type?.includes('triada') || ['maj7', 'm7', 'dom7', 'm7b5', 'dim7'].includes(options.type) ? 'arpegio' : 'escala',
      instruments: [options.instrument || this.form.value.instruments[0] || 'guitarra'],
      abc: res.abc
    };
    this.form.set(next, true);
    this.progressionEditor.syncChordGridFromAbc();
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Escala/arpegio generado. Ya podés ajustarlo a mano.');
  }

  /** Ejecuta el generador de progresiones armónicas volcando el ABC al formulario. */
  runProgressionGenerator(options) {
    const res = this.progressionGenerator.generate(options);
    const next = {
      ...this.form.value,
      title: options.title || res.title,
      key: options.key || this.form.value.key,
      timeSignature: res.progression.timeSignature,
      category: 'acordes',
      instruments: [options.instrument || this.form.value.instruments[0] || 'guitarra'],
      abc: res.abc
    };
    this.form.set(next, true);
    this.progressionEditor.chordGridBars.set([...res.chords], true);
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Progresión generada con notas guía.');
  }

  /** Ejecuta el generador de walking bass volcando el ABC al formulario. */
  runWalkingBassGenerator(options) {
    const res = this.walkingBassGenerator.generate(options);
    const next = {
      ...this.form.value,
      title: options.title || res.title,
      key: options.key || this.form.value.key,
      timeSignature: '4/4',
      category: 'walking',
      level: Math.max(4, Number(this.form.value.level) || 4),
      instruments: ['bajo'],
      abc: res.abc
    };
    this.form.set(next, true);
    this.progressionEditor.chordGridBars.set(res.measures.map((m) => m.chord), true);
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Línea de walking bass generada.');
  }

  /** Construye el objeto candidato JSON a partir del formulario actual. */
  buildCandidateObject() {
    return editorFormToCandidate(this.form.value, this.mode.value);
  }

  /** Valida el formulario contra el esquema oficial de `Practice`. */
  validateForm() {
    const candidate = this.buildCandidateObject();
    const res = validatePracticeSchema(candidate);
    this.validationErrors.set(res.errors, true);
    return { ...res, candidate };
  }

  /** Valida, persiste la práctica, cancela el debounce de borrador y abre el Reproductor. */
  async savePractice() {
    const { valid, candidate } = this.validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Revisá los errores antes de guardar.');
      return null;
    }
    this._cancelDraftSave();
    const practice = new Practice(candidate);
    await this._appVm.upsertUserPractice(practice);
    await this._storage.clearDraft(this._draftKey);
    this.draftRecovered.set(false);
    this.mode.set('edit');
    this.isBuiltinSource.set(false);
    this._draftKey = practice.id;
    this.form.set({ ...this.form.value, id: practice.id }, true);
    this._appVm.showSnackbar(`Práctica "${practice.title}" guardada.`);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practice.id)}`);
    return practice;
  }

  /** Duplica la práctica en edición como nueva copia independiente. */
  async duplicateCurrent() {
    const { valid, candidate } = this.validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Corregí los errores antes de duplicar.');
      return null;
    }
    const copyTitle = `${candidate.title} (copia)`;
    const copy = new Practice({ ...candidate, id: generatePracticeId(copyTitle), title: copyTitle, origin: 'user', createdAt: new Date().toISOString() });
    await this._appVm.upsertUserPractice(copy);
    this._appVm.showSnackbar(`Copia "${copy.title}" guardada.`);
    this._appVm.navigate(`#/editor/${encodeURIComponent(copy.id)}`);
    return copy;
  }

  /** Elimina la práctica actual si es del usuario y vuelve a la lista. */
  async deleteCurrent() {
    const id = this.form.value.id;
    if (!id || this.mode.value !== 'edit') return false;
    this._cancelDraftSave();
    const deleted = await this._appVm.deleteUserPractice(id);
    if (deleted) {
      await this._storage.clearDraft(id);
      this.ioPreview.stopPreview();
      this._appVm.showSnackbar('Práctica eliminada.');
      this._appVm.navigate('#/practicas');
    }
    return deleted;
  }

  /** Descarta el borrador automático cancelando cualquier debounce pendiente. */
  async discardDraft() {
    this._cancelDraftSave();
    await this._storage.clearDraft(this._draftKey);
    this.draftRecovered.set(false);
    await this.loadForEdit(this._draftKey === 'nueva' ? 'nueva' : this._draftKey);
    this._appVm.showSnackbar('Borrador descartado.');
  }

  // --- Delegación limpia hacia sub-ViewModels ---
  updateChordGridBar(i, c) { this.progressionEditor.updateChordGridBar(i, c); }
  resizeChordGrid(d) { this.progressionEditor.resizeChordGrid(d); }
  applyChordGridToAbc() { this.progressionEditor.applyChordGridToAbc(); }
  updateProgressionStep(i, p) { this.progressionEditor.updateProgressionStep(i, p); }
  resizeProgressionSteps(d) { this.progressionEditor.resizeProgressionSteps(d); }
  splitProgressionStep(i) { this.progressionEditor.splitProgressionStep(i); }
  editProgressionStepOrder(i, a) { this.progressionEditor.editProgressionStepOrder(i, a); }
  repeatProgressionBlock() { this.progressionEditor.repeatProgressionBlock(); }
  playVoicingPreview(v, t) { this.progressionEditor.playVoicingPreview(v, t); }
  attachCustomVoicingToStep(i, v, s = true) { return this.progressionEditor.attachCustomVoicingToStep(i, v, s); }

  exportCurrentJson() { this.ioPreview.exportCurrentJson(); }
  exportCurrentAbc() { this.ioPreview.exportCurrentAbc(); }
  exportUserCollection() { this.ioPreview.exportUserCollection(); }
  importFileContent(t, f) { return this.ioPreview.importFileContent(t, f); }
  togglePreviewPlay(v) { this.ioPreview.togglePreviewPlay(v); }
  stopPreview() { this.ioPreview.stopPreview(); }

  _validateAbcLive() {
    const f = this.form.value;
    const abc = String(f.abc || '').trim();
    if (!abc || f.type === 'harmony') {
      this.abcWarnings.set([], true);
      return;
    }
    const syntaxWarnings = this._abc.validateAbcSyntax(abc).warnings || [];
    const measureCheck = validateAbcMeasures(abc);
    const primaryInst = f.instruments?.includes('piano')
      ? 'piano'
      : f.instruments?.includes('bajo') && f.instruments.length === 1
        ? 'bajo'
        : (f.instruments?.[0] || 'guitarra');
    const rangeCheck = validateAbcInstrumentRange(abc, primaryInst);
    const combined = [
      ...syntaxWarnings,
      ...(measureCheck.errors || []).slice(0, 3),
      ...(rangeCheck.errors || []).slice(0, 2)
    ];
    this.abcWarnings.set(combined, true);
  }

  _cancelDraftSave() {
    if (this._draftTimer !== null) {
      clearTimeout(this._draftTimer);
      this._draftTimer = null;
    }
  }

  _scheduleDraftSave(formState) {
    this._cancelDraftSave();
    const targetKey = this._draftKey;
    this._draftTimer = setTimeout(async () => {
      this._draftTimer = null;
      if (targetKey !== this._draftKey) return;
      await this._storage.saveDraft(targetKey, formState);
      this.autosaveLabel.set('Borrador guardado automáticamente');
    }, 450);
  }

  /** Libera timers de autoguardado, vista previa de audio y sub-ViewModels. */
  dispose() {
    this._cancelDraftSave();
    this.ioPreview.dispose();
    this.progressionEditor.dispose();
  }
}
