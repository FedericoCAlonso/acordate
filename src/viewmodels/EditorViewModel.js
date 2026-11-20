import { Observable } from '../core/Observable.js';
import { Practice, generatePracticeId, validatePracticeSchema } from '../models/Practice.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';
import { findVoicingById, getCuratedVoicingsForChord } from '../data/voicings.js';
import { extractMeasuresFromAbc, parseTimeSignature } from '../core/MusicTheory.js';

/**
 * Plantillas iniciales listas para usar al crear una nueva práctica desde el editor.
 */
export const EDITOR_TEMPLATES = {
  escala: {
    label: 'Escala',
    category: 'escala',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 70, target: 110, step: 5 },
    goals: ['Mantener pulso parejo en corcheas', 'Alternar dedos limpiamente'],
    notes: 'Practicá lento y subí de a 5 BPM.',
    abc: 'X:1\nT:Escala mayor en Do\nM:4/4\nL:1/8\nK:C clef=treble-8\nCD EF GA Bc | cB AG FE DC |]'
  },
  arpegio: {
    label: 'Arpegio',
    category: 'arpegio',
    level: 3,
    key: 'Am',
    timeSignature: '4/4',
    tempo: { start: 75, target: 115, step: 5 },
    goals: ['Dejar resonar las notas del acorde', 'Patrón p-i-m-a estable'],
    notes: 'Relajá la mano derecha y marcá suavemente el bajo.',
    abc: 'X:1\nT:Arpegio p-i-m-a\nM:4/4\nL:1/8\nK:C clef=treble-8\n"Am"A,E Ac A,E Ac | "Dm"DA df DA df | "E7"E,^G Be E,G Be | "Am"A,E Ac A,4 |]'
  },
  progresion: {
    label: 'Progresión de acordes',
    category: 'acordes',
    level: 2,
    key: 'G',
    timeSignature: '4/4',
    tempo: { start: 70, target: 105, step: 5 },
    goals: ['Cambiar de acorde sin cortar el pulso', 'Conducir notas guía'],
    notes: 'Activá el acompañamiento para practicar el comping.',
    abc: 'X:1\nT:Progresión I-vi-IV-V en Sol\nM:4/4\nL:1/4\nK:G clef=treble-8\n"G"B2 d2 | "Em"B2 e2 | "C"c2 e2 | "D7"c2 d2 |]'
  },
  walking: {
    label: 'Walking bass',
    category: 'walking',
    level: 4,
    key: 'F',
    timeSignature: '4/4',
    tempo: { start: 95, target: 140, step: 5 },
    instruments: ['bajo'],
    goals: ['Raíz firme en el tiempo 1', 'Aproximación cromática en el tiempo 4'],
    notes: 'Conectá las negras con legato suave.',
    abc: 'X:1\nT:Walking ii-V-I en Fa\nM:4/4\nL:1/4\nK:F clef=bass\n"Gm7"G,, B,, D, ^C, | "C7"C, E, G, E, | "Fmaj7"F, A, C B, | "D7"D, ^F, A, _A, |]'
  },
  lectura: {
    label: 'Lectura a primera vista',
    category: 'lectura',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 65, target: 95, step: 5 },
    goals: ['Leer un compás adelante', 'No detenerse ante un error'],
    notes: 'Mirá primero la armadura y el compás antes de contar.',
    abc: 'X:1\nT:Lectura melódica en Do\nM:4/4\nL:1/4\nK:C clef=treble-8\nC E G F | E D C2 | G A B c | d B G2 |\nc B A G | F E D F | E G D B, | C4 |]'
  },
  blanco: {
    label: 'En blanco',
    category: 'lectura',
    level: 1,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 70, target: 100, step: 5 },
    goals: ['Mantener el pulso constante'],
    notes: '',
    abc: 'X:1\nT:Nueva práctica\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C"C E G c | "G7"B G F D | "C"C4 |]'
  }
};

/**
 * Acordes frecuentes ofrecidos como botones de inserción rápida en el editor.
 */
export const QUICK_CHORDS = [
  'C', 'Cm', 'C7', 'Cmaj7', 'Dm7', 'Em7', 'F', 'Fmaj7', 'G', 'G7', 'Am', 'Am7', 'Bm7b5', 'Bb7', 'Eb7', 'D7'
];

/**
 * ViewModel del Editor y Creador de Prácticas (#/editor/ID).
 * Gestiona el formulario reactivo, validación en vivo de esquema y ABC, plantillas,
 * generadores de dominio, grilla de cifrado por compás, borradores automáticos e importar/exportar.
 */
export class EditorViewModel {
  /**
   * Construye el ViewModel del editor con todos los servicios inyectados manualmente.
   * @param {object} deps Dependencias inyectadas.
   * @param {import('./AppViewModel.js').AppViewModel} deps.appVm ViewModel raíz.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Almacenamiento para borradores.
   * @param {import('../services/AbcService.js').AbcService} deps.abcService Validador/renderizador ABC.
   * @param {import('../services/AudioSynthService.js').AudioSynthService} deps.audioService Reproducción inmediata de vista previa.
   * @param {import('../services/ScaleGenerator.js').ScaleGenerator} deps.scaleGenerator Generador de escalas y arpegios.
   * @param {import('../services/ProgressionGenerator.js').ProgressionGenerator} deps.progressionGenerator Generador de progresiones.
   * @param {import('../services/WalkingBassGenerator.js').WalkingBassGenerator} deps.walkingBassGenerator Generador de walking bass.
   * @param {import('../services/ImportExportService.js').ImportExportService} deps.importExportService Exportación/importación.
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
    /** Servicio ABC para diagnóstico en vivo y timeline. */
    this._abc = abcService;
    /** Sintetizador offline para escucha inmediata en el editor. */
    this._audio = audioService;
    /** Generador puro de escalas y arpegios. */
    this.scaleGenerator = scaleGenerator;
    /** Generador puro de progresiones de acordes. */
    this.progressionGenerator = progressionGenerator;
    /** Generador puro de líneas de walking bass. */
    this.walkingBassGenerator = walkingBassGenerator;
    /** Servicio de importación y exportación JSON/.abc. */
    this._io = importExportService;

    /** Modo actual del editor ('new' | 'edit'). */
    this.mode = new Observable('new');
    /** Clave de borrador actual en IndexedDB/localStorage. */
    this._draftKey = 'nueva';
    /** Indica si la práctica cargada proviene del catálogo incluido (se guardará como copia). */
    this.isBuiltinSource = new Observable(false);
    /** Indica si se recuperó un borrador guardado automáticamente. */
    this.draftRecovered = new Observable(false);
    /** Estado mutable del formulario de la práctica en edición. */
    this.form = new Observable(this._createBlankForm());
    /** Errores de validación del esquema de práctica. */
    this.validationErrors = new Observable([]);
    /** Advertencias de sintaxis ABC detectadas en vivo. */
    this.abcWarnings = new Observable([]);
    /** Grilla de acordes por compás para ingreso visual rápido. */
    this.chordGridBars = new Observable(['C', 'Am', 'Dm7', 'G7']);
    /** Indica si la vista previa está reproduciéndose. */
    this.isPreviewPlaying = new Observable(false);
    /** Estado del último autoguardado de borrador. */
    this.autosaveLabel = new Observable('');

    /** Temporizador de debounce para autoguardado de borrador. */
    this._draftTimer = null;
  }

  /**
   * Crea un objeto de formulario en blanco con valores iniciales válidos.
   * @returns {object} Formulario inicial.
   */
  _createBlankForm() {
    const tpl = EDITOR_TEMPLATES.blanco;
    return {
      id: '',
      version: 2,
      type: 'melody',
      title: 'Mi nueva práctica',
      instruments: ['guitarra'],
      category: tpl.category,
      level: tpl.level,
      tagsText: 'propia',
      key: tpl.key,
      timeSignature: tpl.timeSignature,
      tempoStart: tpl.tempo.start,
      tempoTarget: tpl.tempo.target,
      tempoStep: tpl.tempo.step,
      goalsText: tpl.goals.join('\n'),
      notes: tpl.notes,
      abc: tpl.abc,
      comping: 'negras-abajo',
      progression: [
        { bars: 1, chord: 'G', voicingId: 'g-major-open' },
        { bars: 1, chord: 'C', voicingId: 'c-major-open' },
        { bars: 1, chord: 'Am', voicingId: 'a-minor-open' },
        { bars: 1, chord: 'D', voicingId: 'd-major-open' }
      ],
      customVoicings: [],
      fingerings: {},
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Carga una práctica existente por ID o inicializa el editor para crear una nueva.
   * Si existe un borrador automático previo, lo restaura para no perder trabajo.
   * @param {string} idOrNew ID de práctica o 'nueva'.
   * @returns {Promise<void>}
   */
  async loadForEdit(idOrNew = 'nueva') {
    this.stopPreview();
    this.validationErrors.set([]);
    this.draftRecovered.set(false);
    this.autosaveLabel.set('');

    if (!idOrNew || idOrNew === 'nueva') {
      this.mode.set('new');
      this.isBuiltinSource.set(false);
      this._draftKey = 'nueva';

      const savedDraft = await this._storage.loadDraft('nueva');
      if (savedDraft?.data) {
        this.form.set({ ...this._createBlankForm(), ...savedDraft.data }, true);
        this.draftRecovered.set(true);
      } else {
        this.form.set(this._createBlankForm(), true);
      }
      this._syncChordGridFromAbc();
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

    const baseForm = {
      id: isBuiltin ? '' : existing.id,
      version: existing.version || 2,
      type: existing.type || 'melody',
      title: isBuiltin ? `${existing.title} (copia)` : existing.title,
      instruments: [...existing.instruments],
      category: existing.category,
      level: existing.level,
      tagsText: existing.tags.join(', '),
      key: existing.key,
      timeSignature: existing.timeSignature,
      tempoStart: existing.tempo.start,
      tempoTarget: existing.tempo.target,
      tempoStep: existing.tempo.step,
      goalsText: existing.goals.join('\n'),
      notes: existing.notes,
      abc: existing.abc || '',
      comping: existing.comping || 'negras-abajo',
      progression: existing.progression?.length > 0
        ? existing.progression.map((s) => s.toJSON())
        : [
            { bars: 1, chord: existing.key || 'C', voicingId: null },
            { bars: 1, chord: 'G', voicingId: null }
          ],
      customVoicings: (existing.customVoicings || []).map((v) => v.toJSON()),
      fingerings: { ...existing.fingerings },
      createdAt: isBuiltin ? new Date().toISOString() : existing.createdAt
    };

    const savedDraft = await this._storage.loadDraft(this._draftKey);
    if (savedDraft?.data) {
      this.form.set({ ...baseForm, ...savedDraft.data }, true);
      this.draftRecovered.set(true);
    } else {
      this.form.set(baseForm, true);
    }

    this._syncChordGridFromAbc();
    this._validateAbcLive();
  }

  /**
   * Actualiza un campo del formulario, revalida ABC si corresponde y agenda autoguardado de borrador.
   * @param {string} field Nombre del campo del formulario.
   * @param {*} value Nuevo valor.
   */
  updateField(field, value) {
    const next = { ...this.form.value, [field]: value };
    this.form.set(next, true);

    if (field === 'abc') {
      this._validateAbcLive();
    }
    this._scheduleDraftSave(next);
  }

  /**
   * Alterna la selección de un instrumento en el formulario (asegurando siempre al menos uno).
   * @param {'guitarra-clasica'|'guitarra'|'bajo'} instrument Instrumento a alternar.
   */
  toggleInstrument(instrument) {
    const current = [...this.form.value.instruments];
    const idx = current.indexOf(instrument);
    if (idx >= 0) {
      if (current.length === 1) return; // Siempre debe haber al menos uno
      current.splice(idx, 1);
    } else {
      current.push(instrument);
    }
    this.updateField('instruments', current);
  }

  /**
   * Aplica una de las 6 plantillas predefinidas al formulario actual.
   * @param {keyof typeof EDITOR_TEMPLATES} templateId Clave de plantilla.
   */
  applyTemplate(templateId) {
    const tpl = EDITOR_TEMPLATES[templateId];
    if (!tpl) return;
    const next = {
      ...this.form.value,
      category: tpl.category,
      level: tpl.level,
      key: tpl.key,
      timeSignature: tpl.timeSignature,
      tempoStart: tpl.tempo.start,
      tempoTarget: tpl.tempo.target,
      tempoStep: tpl.tempo.step,
      goalsText: tpl.goals.join('\n'),
      notes: tpl.notes,
      abc: tpl.abc,
      instruments: tpl.instruments ? [...tpl.instruments] : this.form.value.instruments
    };
    this.form.set(next, true);
    this._syncChordGridFromAbc();
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar(`Plantilla "${tpl.label}" aplicada.`);
  }

  /**
   * Actualiza el acorde asignado a un compás específico dentro de la grilla visual de cifrado.
   * @param {number} barIndex Índice de compás (0-based).
   * @param {string} chordText Símbolo de acorde americano.
   */
  updateChordGridBar(barIndex, chordText) {
    const bars = [...this.chordGridBars.value];
    bars[barIndex] = chordText;
    this.chordGridBars.set(bars, true);
  }

  /**
   * Agrega o quita un compás al final de la grilla de cifrado del editor.
   * @param {number} delta +1 para agregar, -1 para quitar.
   */
  resizeChordGrid(delta) {
    const bars = [...this.chordGridBars.value];
    if (delta > 0 && bars.length < 32) {
      bars.push(bars[bars.length - 1] || 'C');
    } else if (delta < 0 && bars.length > 1) {
      bars.pop();
    }
    this.chordGridBars.set(bars, true);
  }

  /**
   * Convierte la grilla actual de acordes por compás en notación ABC e inserta notas guía editables.
   */
  applyChordGridToAbc() {
    const chords = this.chordGridBars.value.map((c) => c.trim()).filter(Boolean);
    if (chords.length === 0) return;

    const f = this.form.value;
    const isBass = f.instruments.includes('bajo') && f.instruments.length === 1;
    const generated = this.progressionGenerator.generate({
      customChords: chords,
      key: f.key || 'C',
      instrument: isBass ? 'bajo' : 'guitarra',
      pattern: 'blancas',
      title: f.title || 'Progresión personalizada'
    });

    this.updateField('abc', generated.abc);
    this._appVm.showSnackbar(`Grilla de ${chords.length} compases insertada en el ABC.`);
  }

  /**
   * Ejecuta el generador de escalas y arpegios y vuelca el ABC resultante al editor para ajuste manual.
   * @param {object} options Parámetros del ScaleGenerator.
   */
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
    this._syncChordGridFromAbc();
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Escala/arpegio generado. Ya podés ajustarlo a mano.');
  }

  /**
   * Ejecuta el generador de progresiones armónicas y vuelca el ABC resultante al editor.
   * @param {object} options Parámetros del ProgressionGenerator.
   */
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
    this.chordGridBars.set([...res.chords], true);
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Progresión generada con notas guía.');
  }

  /**
   * Ejecuta el generador de walking bass sobre un cifrado y vuelca el ABC al editor.
   * @param {object} options Parámetros del WalkingBassGenerator.
   */
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
    this.chordGridBars.set(res.measures.map((m) => m.chord), true);
    this._validateAbcLive();
    this._scheduleDraftSave(next);
    this._appVm.showSnackbar('Línea de walking bass generada.');
  }

  /**
   * Actualiza un paso de la progresión armónica del formulario.
   * @param {number} idx Índice del paso.
   * @param {{ bars?: number, chord?: string, voicingId?: string|null }} patch Cambios del paso.
   */
  updateProgressionStep(idx, patch) {
    const steps = [...(this.form.value.progression || [])];
    if (!steps[idx]) return;
    steps[idx] = { ...steps[idx], ...patch };
    this.updateField('progression', steps);
  }

  /**
   * Agrega o quita un paso de la progresión armónica del formulario.
   * @param {number} delta +1 para agregar, -1 para quitar el último.
   */
  resizeProgressionSteps(delta) {
    const steps = [...(this.form.value.progression || [])];
    if (delta > 0 && steps.length < 32) {
      const last = steps[steps.length - 1] || { bars: 1, chord: 'C', voicingId: null };
      steps.push({ bars: 1, chord: last.chord, voicingId: last.voicingId });
    } else if (delta < 0 && steps.length > 1) {
      steps.pop();
    }
    this.updateField('progression', steps);
  }

  /**
   * Guarda un voicing personalizado (creado en la grilla 6×5) y lo asigna al paso indicado.
   * @param {number} stepIdx Índice del paso destino.
   * @param {Voicing} voicing Instancia Voicing personalizada.
   */
  attachCustomVoicingToStep(stepIdx, voicing) {
    const vJson = voicing instanceof Voicing ? voicing.toJSON() : new Voicing(voicing).toJSON();
    const customList = [
      ...(this.form.value.customVoicings || []).filter((v) => v.id !== vJson.id),
      vJson
    ];
    const steps = [...(this.form.value.progression || [])];
    if (steps[stepIdx]) {
      steps[stepIdx] = { ...steps[stepIdx], chord: vJson.chord, voicingId: vJson.id };
    }
    const next = { ...this.form.value, customVoicings: customList, progression: steps };
    this.form.set(next, true);
    this._scheduleDraftSave(next);
  }

  /**
   * Construye el objeto candidato JSON a partir del formulario actual (esquema v2).
   * @returns {object} Objeto candidato para validación o guardado.
   */
  buildCandidateObject() {
    const f = this.form.value;
    const type = f.type || 'melody';
    const id = this.mode.value === 'edit' && f.id ? f.id : generatePracticeId(f.title);
    const tags = String(f.tagsText || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const goals = String(f.goalsText || '')
      .split('\n')
      .map((g) => g.trim())
      .filter(Boolean);

    const isHarmony = type === 'harmony';
    const includeProg = type === 'harmony' || type === 'mixed';

    return {
      id,
      version: includeProg ? 2 : Number(f.version) || 1,
      type,
      title: String(f.title || '').trim(),
      instruments: [...(f.instruments || [])],
      category: f.category,
      level: Number(f.level),
      tags,
      key: String(f.key || '').trim(),
      timeSignature: String(f.timeSignature || '').trim(),
      tempo: {
        start: Number(f.tempoStart),
        target: Number(f.tempoTarget),
        step: Number(f.tempoStep)
      },
      abc: isHarmony ? null : String(f.abc || '').trim(),
      ...(includeProg ? { progression: f.progression || [], comping: f.comping || 'negras-abajo' } : {}),
      ...(includeProg && f.customVoicings?.length ? { customVoicings: f.customVoicings } : {}),
      fingerings: f.fingerings || {},
      goals,
      notes: String(f.notes || ''),
      origin: 'user',
      createdAt: f.createdAt || new Date().toISOString()
    };
  }

  /**
   * Valida el formulario actual contra el esquema oficial de Practice.
   * @returns {{ valid: boolean, errors: string[], candidate: object }} Resultado de validación.
   */
  validateForm() {
    const candidate = this.buildCandidateObject();
    const res = validatePracticeSchema(candidate);
    this.validationErrors.set(res.errors, true);
    return { ...res, candidate };
  }

  /**
   * Guarda la práctica en IndexedDB tras validar el esquema, limpia el borrador y navega al reproductor.
   * @returns {Promise<Practice|null>} Práctica guardada o null si hubo errores de validación.
   */
  async savePractice() {
    const { valid, candidate } = this.validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Revisá los errores antes de guardar.');
      return null;
    }

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

  /**
   * Duplica la práctica actualmente en edición como una nueva práctica independiente.
   * @returns {Promise<Practice|null>} Nueva práctica guardada.
   */
  async duplicateCurrent() {
    const { valid, candidate } = this.validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Corregí los errores antes de duplicar.');
      return null;
    }
    const copyTitle = `${candidate.title} (copia)`;
    const copy = new Practice({
      ...candidate,
      id: generatePracticeId(copyTitle),
      title: copyTitle,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(copy);
    this._appVm.showSnackbar(`Copia "${copy.title}" guardada.`);
    this._appVm.navigate(`#/editor/${encodeURIComponent(copy.id)}`);
    return copy;
  }

  /**
   * Elimina la práctica actual si es propiedad del usuario y vuelve a la lista.
   * @returns {Promise<boolean>} True si se eliminó correctamente.
   */
  async deleteCurrent() {
    const id = this.form.value.id;
    if (!id || this.mode.value !== 'edit') return false;
    const deleted = await this._appVm.deleteUserPractice(id);
    if (deleted) {
      await this._storage.clearDraft(id);
      this.stopPreview();
      this._appVm.showSnackbar('Práctica eliminada.');
      this._appVm.navigate('#/practicas');
    }
    return deleted;
  }

  /**
   * Descarta el borrador automático guardado y recarga limpio.
   * @returns {Promise<void>}
   */
  async discardDraft() {
    await this._storage.clearDraft(this._draftKey);
    this.draftRecovered.set(false);
    await this.loadForEdit(this._draftKey === 'nueva' ? 'nueva' : this._draftKey);
    this._appVm.showSnackbar('Borrador descartado.');
  }

  /**
   * Exporta la práctica actual en formato JSON descargable.
   */
  exportCurrentJson() {
    const { valid, candidate } = this.validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Corregí los errores antes de exportar.');
      return;
    }
    const content = this._io.exportPracticeJson(candidate);
    this._io.triggerBrowserDownload(`${candidate.id}.json`, content, 'application/json');
    this._appVm.showSnackbar('Práctica exportada en JSON.');
  }

  /**
   * Exporta únicamente la partitura ABC en un archivo .abc.
   */
  exportCurrentAbc() {
    const candidate = this.buildCandidateObject();
    const content = this._io.exportPracticeAbc(candidate);
    this._io.triggerBrowserDownload(`${candidate.id}.abc`, content, 'text/vnd.abc');
    this._appVm.showSnackbar('Partitura exportada en formato .abc.');
  }

  /**
   * Exporta todas las prácticas creadas por el usuario como una colección JSON.
   */
  exportUserCollection() {
    const userPractices = this._appVm.allPractices.value.filter((p) => p.origin === 'user');
    if (userPractices.length === 0) {
      this._appVm.showSnackbar('Todavía no tenés prácticas propias para exportar.');
      return;
    }
    const content = this._io.exportCollectionJson(userPractices, 'Mis prácticas de Acordate');
    this._io.triggerBrowserDownload('acordate-coleccion.json', content, 'application/json');
    this._appVm.showSnackbar(`Colección exportada (${userPractices.length} prácticas).`);
  }

  /**
   * Importa una o varias prácticas desde contenido JSON o archivo .abc.
   * @param {string} text Contenido del archivo leído.
   * @param {string} filename Nombre del archivo original.
   * @returns {Promise<{ importedCount: number, errors: string[] }>} Resultado de la importación.
   */
  async importFileContent(text, filename = 'import.json') {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.abc')) {
      const { practice, errors } = this._io.importPracticeFromAbc(text, filename);
      if (errors.length > 0 || !practice) {
        this.validationErrors.set(errors, true);
        this._appVm.showSnackbar('Error al importar archivo .abc.');
        return { importedCount: 0, errors };
      }
      await this._appVm.upsertUserPractice(practice);
      await this.loadForEdit(practice.id);
      this._appVm.showSnackbar(`Importada "${practice.title}" desde .abc.`);
      return { importedCount: 1, errors: [] };
    }

    const { practices, errors } = this._io.importPracticesFromJson(text);
    if (practices.length === 0) {
      this.validationErrors.set(errors, true);
      this._appVm.showSnackbar('No se pudo importar el JSON.');
      return { importedCount: 0, errors };
    }

    const count = await this._appVm.importUserPractices(practices);
    await this.loadForEdit(practices[0].id);
    this._appVm.showSnackbar(
      count === 1
        ? `Práctica "${practices[0].title}" importada.`
        : `${count} prácticas importadas correctamente.`
    );
    return { importedCount: count, errors };
  }

  /**
   * Reproduce o detiene una vista previa inmediata del ABC actual del editor.
   * @param {object|null} [visualObj=null] Objeto visual de abcjs si se renderizó en pantalla.
   */
  togglePreviewPlay(visualObj = null) {
    if (this.isPreviewPlaying.value) {
      this.stopPreview();
      return;
    }
    const f = this.form.value;
    const isBass = f.instruments.includes('bajo') && f.instruments.length === 1;
    const fam = isBass ? 'bass' : 'guitar';
    const tuning = Tuning.defaultForInstrument(fam);
    let timeline;

    if (f.type === 'harmony') {
      const { beats, beatUnit } = parseTimeSignature(f.timeSignature || '4/4');
      const beatsPerMeasure = beats * (4 / beatUnit);
      let cursor = 0;
      const chords = (f.progression || []).map((st, idx) => {
        const dur = (Number(st.bars) || 1) * beatsPerMeasure;
        const v = findVoicingById(st.voicingId, f.customVoicings || [], st.chord, fam) ||
          getCuratedVoicingsForChord(st.chord, fam, tuning)[0];
        const ev = {
          beat: cursor,
          durationBeats: dur,
          symbol: st.chord,
          measureIndex: Math.floor(cursor / beatsPerMeasure) + 1,
          stepIndex: idx,
          voicingMidis: v ? v.getMidiNotes(tuning) : [],
          rhythm: st.rhythm || null
        };
        cursor += dur;
        return ev;
      });
      timeline = {
        notes: [],
        chords,
        totalBeats: Math.max(beatsPerMeasure, cursor),
        beatsPerMeasure,
        beatUnit,
        measureCount: Math.max(1, Math.ceil(cursor / beatsPerMeasure)),
        isBassPiece: isBass,
        isHarmonyOnly: true
      };
    } else {
      timeline = this._abc.extractTimeline(visualObj, f.abc, {
        instrument: f.instruments[0] || 'guitarra',
        isBass,
        timeSignature: f.timeSignature
      });
    }

    this._audio.loadTimeline(timeline);
    this._audio.configure({
      bpm: Number(f.tempoStart) || 85,
      instrument: isBass ? 'electric-bass' : f.instruments.includes('guitarra-clasica') ? 'nylon-guitar' : 'acoustic-guitar',
      comping: f.comping || 'negras-abajo',
      countInMeasures: 0,
      loopEnabled: false,
      metronomeEnabled: true,
      chordsEnabled: true
    });
    this._audio.onPlaybackEnd = () => {
      this.isPreviewPlaying.set(false);
    };
    this._audio.play();
    this.isPreviewPlaying.set(true);
  }

  /**
   * Detiene la reproducción de vista previa del editor.
   */
  stopPreview() {
    if (this.isPreviewPlaying.value) {
      this._audio.stop();
      this.isPreviewPlaying.set(false);
    }
  }

  /**
   * Extrae los acordes actuales del ABC para sincronizar la grilla visual de compases.
   */
  _syncChordGridFromAbc() {
    const measures = extractMeasuresFromAbc(this.form.value.abc);
    const chords = measures.map((m) => m.chords[0] || '');
    if (chords.some(Boolean)) {
      this.chordGridBars.set(chords, true);
    }
  }

  /**
   * Ejecuta el diagnóstico sintáctico ABC en vivo y actualiza el observable abcWarnings.
   */
  _validateAbcLive() {
    const res = this._abc.validateAbcSyntax(this.form.value.abc);
    this.abcWarnings.set(res.warnings, true);
  }

  /**
   * Guarda el borrador automáticamente con un breve debounce para evitar escrituras excesivas.
   * @param {object} formState Estado actual del formulario.
   */
  _scheduleDraftSave(formState) {
    if (this._draftTimer) clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(async () => {
      await this._storage.saveDraft(this._draftKey, formState);
      this.autosaveLabel.set('Borrador guardado automáticamente');
    }, 450);
  }
}
