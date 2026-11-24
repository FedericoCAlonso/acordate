import { ComputedObservable, Observable } from '../../core/Observable.js';
import { getCuratedVoicingsForChord } from '../../data/voicings.js';
import { Chord } from '../../models/Chord.js';
import { createProgressionPractice } from '../../services/PracticeFactoryService.js';

/**
 * Sub-ViewModel del Explorador de Campo Armónico (#/acordes/campo).
 * Calcula el campo diatónico (4 modos), permite armar progresiones con atajos y
 * reproducirlas o guardarlas como práctica editable de armonía.
 */
export class HarmonicFieldViewModel {
  /**
   * Construye el sub-ViewModel de Campo Armónico.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({ appVm, instrument, activeTuning, harmonyService, voicingGenerator, audioService }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Observable compartido de instrumento. */
    this._instrument = instrument;
    /** Observable derivado compartido de afinación. */
    this._activeTuning = activeTuning;
    /** Servicio puro de campo armónico. */
    this._harmony = harmonyService;
    /** Generador puro de voicings y conducción de voces. */
    this._voicingGen = voicingGenerator;
    /** Sintetizador de audio. */
    this._audio = audioService;

    /** Tonalidad del campo armónico. */
    this.fieldKey = new Observable('C');
    /** Modo del campo armónico ('major' | 'minor' | 'harmonic-minor' | 'melodic-minor'). */
    this.fieldMode = new Observable('major');
    /** Mostrar acordes de séptima en lugar de tríadas. */
    this.fieldUseSevenths = new Observable(false);
    /** Progresión que el usuario arma tocando/reordenando grados. */
    this.builderChords = new Observable(['C', 'Am', 'F', 'G']);

    /** Campo armónico de 7 grados calculado reactivamente. */
    this.diatonicField = new ComputedObservable(
      [this.fieldKey, this.fieldMode, this.fieldUseSevenths, this._instrument, this._activeTuning],
      () => {
        const tuning = this._activeTuning.value;
        return this._harmony.getDiatonicField(
          this.fieldKey.value,
          this.fieldMode.value,
          this.fieldUseSevenths.value,
          tuning.instrument,
          tuning
        );
      }
    );
  }

  /**
   * Agrega un acorde del campo armónico a la progresión en construcción.
   * @param {string} chordSymbol Símbolo americano.
   */
  addChordToBuilder(chordSymbol) {
    if (this.builderChords.value.length >= 16) return;
    this.builderChords.set([...this.builderChords.value, chordSymbol]);
  }

  /**
   * Reordena o elimina un acorde de la progresión en construcción.
   * @param {number} index Índice del acorde.
   * @param {'left'|'right'|'remove'} action Acción.
   */
  editBuilderChord(index, action) {
    const list = [...this.builderChords.value];
    if (action === 'remove' && list.length > 1) {
      list.splice(index, 1);
    } else if (action === 'left' && index > 0) {
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
    } else if (action === 'right' && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    }
    this.builderChords.set(list);
  }

  /**
   * Aplica un atajo clásico (I-IV-V, ii-V-I, blues-12, etc.) en la tonalidad actual.
   * @param {string} shortcutId Clave en HARMONIC_FIELD_SHORTCUTS.
   */
  applyFieldShortcut(shortcutId) {
    const chords = this._harmony.buildShortcutProgression(
      shortcutId,
      this.fieldKey.value,
      this.fieldUseSevenths.value
    );
    this.builderChords.set(chords);
  }

  /**
   * Reproduce la progresión armada (o una secuencia ya conducida por voces).
   * @param {Array<object>} [voiceLedSequence=[]] Secuencia opcional con conducción de voces.
   * @param {boolean} [useVoiceLed=false] True para usar `voiceLedSequence`.
   */
  playBuilderProgression(voiceLedSequence = [], useVoiceLed = false) {
    const isPiano = this._instrument.value === 'piano';
    const tuning = this._activeTuning.value;
    const fam = tuning.instrument;
    const synthInst = isPiano
      ? 'acoustic-piano'
      : fam === 'bass'
        ? 'electric-bass'
        : this._instrument.value === 'guitarra-clasica'
          ? 'nylon-guitar'
          : 'acoustic-guitar';

    const seq = useVoiceLed && voiceLedSequence.length > 0
      ? voiceLedSequence.map((step) =>
          typeof step.voicing.getMidiNotes === 'function'
            ? step.voicing.getMidiNotes(tuning)
            : step.voicing.midis || []
        )
      : this.builderChords.value.map((sym) => {
          if (isPiano) {
            const c = Chord.parse(sym);
            return [48 + c.rootPc, ...c.quality.intervals.map((iv) => 60 + c.rootPc + iv)];
          }
          const list = getCuratedVoicingsForChord(sym, fam, tuning);
          if (list[0]) return list[0].getMidiNotes(tuning);
          const c = Chord.parse(sym);
          return c.quality.intervals.map((iv) => (fam === 'bass' ? 40 : 48) + c.rootPc + iv);
        });

    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(seq, {
      stepMs: 900,
      mode: isPiano || fam === 'bass' ? 'block' : 'strum-down',
      instrument: synthInst
    });
  }

  /**
   * Guarda una progresión como práctica editable de armonía y la abre en el Reproductor.
   * @param {object} [opts={}] Opciones ({ title, chords, voiceLed, category, notes }).
   * @returns {Promise<import('../../models/Practice.js').Practice>} Práctica creada.
   */
  async saveBuilderAsPractice(opts = {}) {
    const chords = opts.chords || this.builderChords.value;
    const key = this.fieldKey.value;
    const tuning = this._activeTuning.value;
    const voiceLed = opts.voiceLed || this._voicingGen.findVoiceLedProgression(chords, tuning, tuning.instrument);

    const pr = createProgressionPractice({
      chords,
      instrument: this._instrument.value,
      key,
      voiceLed,
      opts
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.showSnackbar(`Práctica "${pr.title}" guardada.`);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
    return pr;
  }

  /**
   * Libera el `ComputedObservable` del campo armónico.
   */
  dispose() {
    this.diatonicField.dispose();
  }
}
