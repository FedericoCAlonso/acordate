import { extractMeasuresFromAbc } from '../../core/MusicTheory.js';
import { Observable } from '../../core/Observable.js';
import { Voicing } from '../../models/Voicing.js';

/**
 * Sub-ViewModel especialista en la edición armónica dentro del Editor:
 * grilla de cifrado por compás, pasos de progresión (dividir compás, repetir bloque, reordenar),
 * escucha de voicing y creación de digitaciones personalizadas 6×5 guardadas en "Mis acordes".
 */
export class EditorProgressionViewModel {
  /**
   * Construye el sub-ViewModel de progresiones del editor.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({
    appVm,
    form,
    progressionGenerator,
    audioService,
    onUpdateField,
    onCommitForm
  }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Observable compartido con el estado del formulario del editor. */
    this._form = form;
    /** Generador puro de progresiones con notas guía. */
    this._progressionGen = progressionGenerator;
    /** Sintetizador para escucha inmediata de voicings. */
    this._audio = audioService;
    /** Callback para actualizar un campo puntual del formulario con autoguardado. */
    this._onUpdateField = onUpdateField;
    /** Callback para reemplazar el formulario completo y programar autoguardado. */
    this._onCommitForm = onCommitForm;

    /** Grilla visual de acordes por compás para ingreso rápido. */
    this.chordGridBars = new Observable(['C', 'Am', 'Dm7', 'G7']);
  }

  /** Actualiza el acorde asignado a un compás específico dentro de la grilla. */
  updateChordGridBar(barIndex, chordText) {
    const bars = [...this.chordGridBars.value];
    bars[barIndex] = chordText;
    this.chordGridBars.set(bars, true);
  }

  /** Agrega (+1) o quita (-1) un compás al final de la grilla de cifrado. */
  resizeChordGrid(delta) {
    const bars = [...this.chordGridBars.value];
    if (delta > 0 && bars.length < 32) {
      bars.push(bars[bars.length - 1] || 'C');
    } else if (delta < 0 && bars.length > 1) {
      bars.pop();
    }
    this.chordGridBars.set(bars, true);
  }

  /** Convierte la grilla actual de acordes por compás en notación ABC editable. */
  applyChordGridToAbc() {
    const chords = this.chordGridBars.value.map((c) => c.trim()).filter(Boolean);
    if (chords.length === 0) return;

    const f = this._form.value;
    const isPiano = f.instruments.includes('piano') && (f.instruments.length === 1 || f.instruments[0] === 'piano');
    const isBass = !isPiano && f.instruments.includes('bajo') && f.instruments.length === 1;
    const generated = this._progressionGen.generate({
      customChords: chords,
      key: f.key || 'C',
      instrument: isPiano ? 'piano' : isBass ? 'bajo' : 'guitarra',
      pattern: 'blancas',
      title: f.title || 'Progresión personalizada'
    });

    this._onUpdateField('abc', generated.abc);
    this._appVm.showSnackbar(`Grilla de ${chords.length} compases insertada en el ABC.`);
  }

  /** Extrae los acordes actuales del ABC para sincronizar la grilla visual. */
  syncChordGridFromAbc() {
    const measures = extractMeasuresFromAbc(this._form.value.abc);
    const chords = measures.map((m) => m.chords[0] || '');
    if (chords.some(Boolean)) {
      this.chordGridBars.set(chords, true);
    }
  }

  /** Actualiza un paso de la progresión armónica del formulario. */
  updateProgressionStep(idx, patch) {
    const steps = [...(this._form.value.progression || [])];
    if (!steps[idx]) return;
    steps[idx] = { ...steps[idx], ...patch };
    this._onUpdateField('progression', steps);
  }

  /** Agrega (+1) o quita (-1) un paso al final de la progresión armónica. */
  resizeProgressionSteps(delta) {
    const steps = [...(this._form.value.progression || [])];
    if (delta > 0 && steps.length < 32) {
      const last = steps[steps.length - 1] || { bars: 1, chord: 'C', voicingId: null };
      steps.push({ bars: 1, chord: last.chord, voicingId: last.voicingId });
    } else if (delta < 0 && steps.length > 1) {
      steps.pop();
    }
    this._onUpdateField('progression', steps);
  }

  /** Divide un paso de la progresión en dos acordes dentro del mismo compás (ej. ii–V). */
  splitProgressionStep(idx) {
    const steps = [...(this._form.value.progression || [])];
    const target = steps[idx];
    if (!target || steps.length >= 64) return;
    const half = Math.max(0.25, Number(((Number(target.bars) || 1) / 2).toFixed(2)));
    steps.splice(
      idx,
      1,
      { ...target, bars: half },
      { bars: half, chord: target.chord, voicingId: target.voicingId }
    );
    this._onUpdateField('progression', steps);
  }

  /** Elimina o reordena un paso puntual de la progresión armónica. */
  editProgressionStepOrder(idx, action) {
    const steps = [...(this._form.value.progression || [])];
    if (action === 'remove' && steps.length > 1) {
      steps.splice(idx, 1);
    } else if (action === 'left' && idx > 0) {
      [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
    } else if (action === 'right' && idx < steps.length - 1) {
      [steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]];
    }
    this._onUpdateField('progression', steps);
  }

  /** Duplica el bloque completo de la progresión actual (repetición ×2). */
  repeatProgressionBlock() {
    const steps = [...(this._form.value.progression || [])];
    if (steps.length === 0 || steps.length * 2 > 64) return;
    const clone = steps.map((s) => ({ ...s, section: undefined }));
    this._onUpdateField('progression', [...steps, ...clone]);
    this._appVm.showSnackbar(`Se repitió la progresión (ahora ${steps.length * 2} pasos).`);
  }

  /** Reproduce un voicing de vista previa desde el selector de acordes del editor. */
  playVoicingPreview(voicing, tuning) {
    if (!voicing) return;
    const isBass = tuning.instrument === 'bass';
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playVoicing(voicing, {
      mode: isBass ? 'block' : 'strum-down',
      instrument: isBass
        ? 'electric-bass'
        : this._form.value.instruments.includes('guitarra-clasica')
          ? 'nylon-guitar'
          : 'acoustic-guitar',
      tuning,
      duration: 1.4
    });
  }

  /**
   * Asocia una digitación personalizada (grilla 6×5) al paso indicado y la guarda en "Mis acordes"
   * delegando en `ProgressStore` (sin imports dinámicos de `UserProgress`).
   * @param {number} stepIdx Índice del paso destino.
   * @param {Voicing|object} voicing Voicing personalizado.
   * @param {boolean} [saveToMyChords=true] Si true, persiste en "Mis acordes".
   */
  async attachCustomVoicingToStep(stepIdx, voicing, saveToMyChords = true) {
    const vJson = voicing instanceof Voicing ? voicing.toJSON() : new Voicing(voicing).toJSON();
    vJson.tags = [...new Set([...(vJson.tags || []), 'propio'])];
    const customList = [
      ...(this._form.value.customVoicings || []).filter((v) => v.id !== vJson.id),
      vJson
    ];
    const steps = [...(this._form.value.progression || [])];
    if (steps[stepIdx]) {
      steps[stepIdx] = { ...steps[stepIdx], chord: vJson.chord, voicingId: vJson.id };
    }
    this._onCommitForm({ ...this._form.value, customVoicings: customList, progression: steps });

    if (saveToMyChords && typeof this._appVm?.saveCustomChord === 'function') {
      await this._appVm.saveCustomChord(vJson);
      this._appVm.showSnackbar(`Digitación de ${vJson.chord} guardada en "Mis acordes".`);
    }
  }

  /** Contrato uniforme de ciclo de vida. */
  dispose() {
    // Sin suscripciones ni timers propios
  }
}
