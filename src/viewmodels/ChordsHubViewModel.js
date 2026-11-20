import { ComputedObservable, Observable } from '../core/Observable.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { ChordQuality } from '../models/ChordQuality.js';
import { Practice, generatePracticeId } from '../models/Practice.js';
import { Tuning } from '../models/Tuning.js';

/**
 * ViewModel del módulo Acordes y Armonía (#/acordes).
 * Centraliza el estado reactivo y comandos de las 4 herramientas armónicas:
 * Biblioteca de acordes, Explorador de campo armónico, Entrenador de cambios / Conducción de voces
 * y Entrenamiento de oído.
 */
export class ChordsHubViewModel {
  /**
   * Construye el ViewModel inyectando los servicios puros de armonía y audio.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({ appVm, voicingGenerator, harmonyService, audioService, metronomeService }) {
    /** ViewModel global de la app. */
    this._appVm = appVm;
    /** Generador puro de voicings y conducción de voces. */
    this._voicingGen = voicingGenerator;
    /** Servicio puro de campo armónico y entrenamiento de oído. */
    this._harmony = harmonyService;
    /** Sintetizador de audio exacto por voicing. */
    this._audio = audioService;
    /** Metrónomo Web Audio para el entrenador de cambios. */
    this._metronome = metronomeService;

    /** Pestaña activa del módulo ('biblioteca' | 'campo' | 'cambios' | 'oido'). */
    this.activeTab = new Observable('biblioteca');

    // --- Estado Biblioteca de Acordes ---
    /** Instrumento de la biblioteca ('guitarra' | 'guitarra-clasica' | 'bajo'). */
    this.instrument = new Observable(appVm.settings.value.defaultInstrument || 'guitarra');
    /** ID de afinación activa (Tuning). */
    this.tuningId = new Observable('guitar-standard');
    /** Raíz seleccionada en cifrado americano ('C'..'B'). */
    this.selectedRoot = new Observable('C');
    /** Calidad seleccionada ('', 'm', '7', 'maj7', 'm7', etc.). */
    this.selectedQuality = new Observable('');
    /** Bajo alternativo opcional (slash chord) o ''. */
    this.selectedBass = new Observable('');
    /** Filtro de tipo de voicing ('todos' | 'abierto' | 'cejilla' | 'triada' | 'drop2' | 'shell' | 'sugerido'). */
    this.voicingTypeFilter = new Observable('todos');
    /** Filtro de inversión ('todas' | 0 | 1 | 2 | 3). */
    this.inversionFilter = new Observable('todas');
    /** Filtro de rango de trastes ('todos' | 'abierto' | 'medio' | 'agudo'). */
    this.fretRangeFilter = new Observable('todos');
    /** Modo de vista del acorde ('diagrama' | 'pentagrama' | 'ambos'). */
    this.diagramViewMode = new Observable('diagrama');
    /** Etiquetas dentro de los puntos ('fingers' | 'functions' | 'notes'). */
    this.labelMode = new Observable('fingers');
    /** Orientación para zurdos. */
    this.leftHanded = new Observable(false);
    /** Modo de reproducción al tocar el diagrama. */
    this.playMode = new Observable('strum-down');
    /** Voicings adicionales generados por VoicingGenerator para el acorde actual. */
    this.generatedVoicings = new Observable([]);
    /** Índice del voicing seleccionado en el carrusel. */
    this.activeVoicingIndex = new Observable(0);

    // --- Estado Explorador de Campo Armónico ---
    /** Tonalidad del campo armónico. */
    this.fieldKey = new Observable('C');
    /** Modo del campo armónico ('major' | 'minor'). */
    this.fieldMode = new Observable('major');
    /** Mostrar acordes de séptima en lugar de tríadas. */
    this.fieldUseSevenths = new Observable(false);
    /** Progresión que el usuario arma tocando/reordenando grados. */
    this.builderChords = new Observable(['C', 'Am', 'F', 'G']);

    // --- Estado Entrenador de Cambios, Conducción de Voces e Inversiones ---
    /** Secuencia de acordes del entrenador de cambios. */
    this.trainerChords = new Observable(['G', 'C']);
    /** BPM del entrenador de cambios. */
    this.trainerBpm = new Observable(60);
    /** Pulsos entre cada cambio de acorde. */
    this.trainerBeatsPerChange = new Observable(4);
    /** Estado activo del entrenador de cambios. */
    this.trainerRunning = new Observable(false);
    /** Índice del acorde actual en el entrenador. */
    this.trainerStepIndex = new Observable(0);
    /** Pulso actual dentro del ciclo de cambio (1..trainerBeatsPerChange). */
    this.trainerCurrentBeat = new Observable(0);
    /** Contador de cambios completados en la sesión del entrenador. */
    this.trainerChangesCount = new Observable(0);
    /** Marca de inicio de sesión del entrenador para calcular CPM. */
    this._trainerStartedAtMs = null;
    /** Resultado de conducción de voces calculado para builderChords. */
    this.voiceLedSequence = new Observable([]);
    /** Juego de cuerdas para el modo recorrido de inversiones ('321' | '432' | '5432'). */
    this.inversionStringSet = new Observable('432');

    // --- Estado Entrenamiento de Oído ---
    /** Dificultad de oído (1..4). */
    this.earLevel = new Observable(1);
    /** Pregunta actual de entrenamiento de oído. */
    this.earQuestion = new Observable(null);
    /** Respuesta elegida por el usuario (o null si aún no respondió). */
    this.earSelectedId = new Observable(null);
    /** Puntaje acumulado (correctas / totales). */
    this.earScore = new Observable({ correct: 0, total: 0 });

    /** Afinación activa resuelta como objeto Tuning. */
    this.activeTuning = new ComputedObservable([this.tuningId], () => Tuning.byId(this.tuningId.value));

    /** Instancia Chord correspondiente a raíz + calidad + bajo seleccionados. */
    this.activeChord = new ComputedObservable(
      [this.selectedRoot, this.selectedQuality, this.selectedBass],
      () => new Chord({
        root: this.selectedRoot.value,
        quality: this.selectedQuality.value,
        bass: this.selectedBass.value || null
      })
    );

    /** Lista combinada y filtrada de voicings (curados + generados) para el acorde activo. */
    this.voicingsList = new ComputedObservable(
      [
        this.activeChord,
        this.instrument,
        this.activeTuning,
        this.voicingTypeFilter,
        this.inversionFilter,
        this.fretRangeFilter,
        this.generatedVoicings
      ],
      () => this._computeVoicingsList()
    );

    /** Campo armónico de 7 grados calculado reactivamente. */
    this.diatonicField = new ComputedObservable(
      [this.fieldKey, this.fieldMode, this.fieldUseSevenths, this.instrument],
      () => {
        const fam = this.instrument.value === 'bajo' ? 'bass' : 'guitar';
        return this._harmony.getDiatonicField(
          this.fieldKey.value,
          this.fieldMode.value,
          this.fieldUseSevenths.value,
          fam
        );
      }
    );

    // Sincroniza instrumento por defecto cuando terminan de cargar ajustes
    appVm.isReady.subscribe((ready) => {
      if (ready && appVm.settings.value.defaultInstrument) {
        this.setInstrument(appVm.settings.value.defaultInstrument);
      }
    });

    this.recomputeVoiceLeading();
    this.nextEarQuestion();
  }

  /**
   * Cambia la pestaña activa del módulo Acordes.
   * @param {'biblioteca'|'campo'|'cambios'|'oido'} tab Pestaña destino.
   */
  setActiveTab(tab) {
    if (['biblioteca', 'campo', 'cambios', 'oido'].includes(tab)) {
      if (this.trainerRunning.value && tab !== 'cambios') {
        this.stopChangeTrainer();
      }
      this.activeTab.set(tab);
    }
  }

  /**
   * Selecciona el instrumento activo en la biblioteca y ajusta la afinación predeterminada.
   * @param {'guitarra'|'guitarra-clasica'|'bajo'} inst Instrumento.
   */
  setInstrument(inst) {
    this.instrument.set(inst);
    if (inst === 'bajo') {
      if (!this.tuningId.value.startsWith('bass-')) this.tuningId.set('bass-4-standard');
    } else if (this.tuningId.value.startsWith('bass-')) {
      this.tuningId.set('guitar-standard');
    }
    this.generatedVoicings.set([]);
    this.activeVoicingIndex.set(0);
    this.recomputeVoiceLeading();
  }

  /**
   * Cambia la afinación activa (permite Drop D, DADGAD, Open G, bajo 5 cuerdas, etc.).
   * @param {string} tuningId Clave en PRESET_TUNINGS.
   */
  setTuning(tuningId) {
    this.tuningId.set(tuningId);
    this.generatedVoicings.set([]);
    this.activeVoicingIndex.set(0);
    this.recomputeVoiceLeading();
  }

  /**
   * Selecciona raíz, calidad o bajo del acorde activo en la biblioteca.
   * @param {{ root?: string, quality?: string, bass?: string }} patch Campos a cambiar.
   */
  selectChord(patch = {}) {
    if (patch.root !== undefined) this.selectedRoot.set(patch.root);
    if (patch.quality !== undefined) this.selectedQuality.set(patch.quality);
    if (patch.bass !== undefined) this.selectedBass.set(patch.bass);
    this.generatedVoicings.set([]);
    this.activeVoicingIndex.set(0);
  }

  /**
   * Ejecuta el VoicingGenerator puro para sugerir digitaciones adicionales (incluyendo inversiones)
   * para el acorde y afinación actuales.
   */
  generateSuggestedVoicings() {
    const symbol = this.activeChord.value.americanSymbol;
    const tuning = this.activeTuning.value;
    const isBass = tuning.instrument === 'bass';
    const sets = isBass
      ? [Array.from({ length: Math.min(3, tuning.stringCount) }, (_, i) => tuning.stringCount - 1 - i).reverse()]
      : [[1, 2, 3, 4], [2, 3, 4, 5], [2, 3, 4], [3, 4, 5]];

    const all = [];
    const seen = new Set();
    for (const stringSet of sets) {
      try {
        const list = this._voicingGen.generate(symbol, { tuning, stringSet, maxSpan: 4, maxFret: 12, limit: 5 });
        for (const v of list) {
          const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
          if (!seen.has(sig)) {
            seen.add(sig);
            all.push(v);
          }
        }
      } catch {
        // Ignora juegos de cuerdas inválidos
      }
    }

    this.generatedVoicings.set(all);
    this._appVm.showSnackbar(
      all.length > 0
        ? `Se generaron ${all.length} digitaciones sugeridas para ${symbol}.`
        : 'No se encontraron digitaciones adicionales para ese filtro.'
    );
  }

  /**
   * Combina voicings curados + generados aplicando filtros de tipo, inversión y rango de trastes.
   * @returns {import('../models/Voicing.js').Voicing[]} Lista filtrada de voicings.
   */
  _computeVoicingsList() {
    const symbol = this.activeChord.value.americanSymbol;
    const tuning = this.activeTuning.value;
    const fam = tuning.instrument;
    const curated = getCuratedVoicingsForChord(symbol, fam, tuning);

    const seen = new Set(curated.map((v) => v.frets.map((f) => (f === null ? 'x' : f)).join('-')));
    const combined = [...curated];
    for (const v of this.generatedVoicings.value) {
      const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
      if (!seen.has(sig)) {
        seen.add(sig);
        combined.push(v);
      }
    }

    // Si no hubo ningún voicing curado para esa afinación/slash, genera sugerencias automáticamente
    if (combined.length === 0) {
      try {
        const autoSet = tuning.stringCount >= 6 ? [1, 2, 3, 4] : [0, 1, 2];
        const auto = this._voicingGen.generate(symbol, { tuning, stringSet: autoSet, limit: 6 });
        combined.push(...auto);
      } catch {
        // Sin resultados
      }
    }

    const typeF = this.voicingTypeFilter.value;
    const invF = this.inversionFilter.value;
    const rangeF = this.fretRangeFilter.value;

    return combined.filter((v) => {
      if (typeF !== 'todos') {
        if (typeF === 'sugerido' && !v.suggested) return false;
        if (typeF !== 'sugerido' && !v.tags.includes(typeF)) return false;
      }
      if (invF !== 'todas' && v.computeInversion(tuning) !== Number(invF)) {
        return false;
      }
      if (rangeF === 'abierto' && v.baseFret > 2) return false;
      if (rangeF === 'medio' && (v.baseFret < 3 || v.baseFret > 7)) return false;
      if (rangeF === 'agudo' && v.baseFret < 8) return false;
      return true;
    });
  }

  /**
   * Reproduce un voicing exacto respetando PitchPolicy y el modo elegido (rasgueo/arpegio/bloque).
   * @param {import('../models/Voicing.js').Voicing} voicing Voicing a sonar.
   * @param {string} [overrideMode] Modo de ejecución opcional.
   */
  playVoicing(voicing, overrideMode) {
    if (!voicing) return;
    const tuning = this.activeTuning.value;
    const isBass = this.instrument.value === 'bajo';
    const synthInst = isBass
      ? 'electric-bass'
      : this.instrument.value === 'guitarra-clasica'
        ? 'nylon-guitar'
        : 'acoustic-guitar';

    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playVoicing(voicing, {
      mode: overrideMode || (isBass ? 'arpeggio-asc' : this.playMode.value),
      instrument: synthInst,
      tuning,
      duration: 1.7
    });
  }

  /**
   * Reproduce un arpegio con las notas del acorde activo (ideal para bajo).
   * @param {string} [chordSymbol] Acorde opcional.
   */
  playChordArpeggio(chordSymbol = this.activeChord.value.americanSymbol) {
    const c = Chord.parse(chordSymbol);
    const isBass = this.instrument.value === 'bajo';
    const baseMidi = isBass ? 28 + ((c.rootPc - 4 + 12) % 12) : 48 + c.rootPc;
    const midis = c.quality.intervals.map((iv) => baseMidi + iv);
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playVoicing(midis, {
      mode: 'arpeggio-asc',
      instrument: isBass ? 'electric-bass' : 'nylon-guitar',
      duration: 1.5
    });
  }

  /**
   * Marca o desmarca el acorde actual como favorito en el progreso del usuario.
   * @returns {Promise<void>}
   */
  async toggleFavoriteActiveChord() {
    const symbol = this.activeChord.value.americanSymbol;
    const prog = this._appVm.progress.value;
    const clone = prog.toJSON();
    const { UserProgress } = await import('../models/UserProgress.js');
    const next = new UserProgress(clone);
    const isFav = next.toggleFavoriteChord(symbol);
    await this._appVm.replaceProgress(next);
    this._appVm.showSnackbar(isFav ? `${symbol} guardado en favoritos.` : `${symbol} quitado de favoritos.`);
  }

  /**
   * Crea una práctica rápida de armonía con el acorde/voicing activo y la abre en el reproductor.
   * @param {import('../models/Voicing.js').Voicing|null} voicing Voicing elegido.
   */
  async practiceActiveChord(voicing) {
    const chord = this.activeChord.value;
    const inst = this.instrument.value;
    const title = `Estudio de acorde: ${chord.americanSymbol}`;
    const pr = new Practice({
      id: generatePracticeId(title),
      version: 2,
      type: 'harmony',
      title,
      instruments: [inst],
      category: 'formas',
      level: 2,
      tags: ['biblioteca', chord.americanSymbol],
      key: chord.root,
      timeSignature: '4/4',
      tempo: { start: 65, target: 100, step: 5 },
      progression: [
        { bars: 2, chord: chord.americanSymbol, voicingId: voicing?.id || null },
        { bars: 2, chord: chord.americanSymbol, voicingId: voicing?.id || null }
      ],
      comping: inst === 'guitarra-clasica' ? 'arpegio-pima' : inst === 'bajo' ? 'arpegio-asc' : 'negras-abajo',
      customVoicings: voicing?.suggested ? [voicing.toJSON()] : [],
      goals: ['Que todas las cuerdas suenen limpias', 'Armar la forma de memoria sin mirar el mango'],
      notes: `Creada desde la Biblioteca de Acordes (${voicing ? voicing.toAccessibleDescription(this.activeTuning.value) : chord.americanSymbol}).`,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
  }

  /**
   * Abre el editor con una nueva práctica de armonía precargada con el acorde actual.
   */
  addActiveChordToNewPractice() {
    const symbol = this.activeChord.value.americanSymbol;
    this._appVm.showSnackbar(`Abrí el editor y usá "${symbol}" en tu progresión.`);
    this._appVm.navigate('#/editor/nueva');
  }

  // --- Comandos del Explorador de Campo Armónico ---

  /**
   * Agrega un acorde del campo armónico a la progresión en construcción.
   * @param {string} chordSymbol Símbolo americano.
   */
  addChordToBuilder(chordSymbol) {
    if (this.builderChords.value.length >= 16) return;
    this.builderChords.set([...this.builderChords.value, chordSymbol]);
    this.recomputeVoiceLeading();
  }

  /**
   * Reordena o elimina un acorde de la progresión en construcción.
   * @param {number} index Índice del acorde.
   * @param {'left'|'right'|'remove'} action Acción de edición.
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
    this.recomputeVoiceLeading();
  }

  /**
   * Aplica un atajo clásico (I-IV-V, I-vi-IV-V, ii-V-I, blues-12, i-iv-V) en la tonalidad actual.
   * @param {string} shortcutId Clave en HARMONIC_FIELD_SHORTCUTS.
   */
  applyFieldShortcut(shortcutId) {
    const chords = this._harmony.buildShortcutProgression(
      shortcutId,
      this.fieldKey.value,
      this.fieldUseSevenths.value
    );
    this.builderChords.set(chords);
    this.recomputeVoiceLeading();
  }

  /**
   * Reproduce la progresión armada actualmente usando sus voicings reales.
   * @param {boolean} [useVoiceLed=false] Si true reproduce la versión optimizada de conducción de voces.
   */
  playBuilderProgression(useVoiceLed = false) {
    const tuning = this.activeTuning.value;
    const fam = tuning.instrument;
    const seq = useVoiceLed && this.voiceLedSequence.value.length > 0
      ? this.voiceLedSequence.value.map((step) => step.voicing.getMidiNotes(tuning))
      : this.builderChords.value.map((sym) => {
          const list = getCuratedVoicingsForChord(sym, fam, tuning);
          if (list[0]) return list[0].getMidiNotes(tuning);
          const c = Chord.parse(sym);
          return c.quality.intervals.map((iv) => (fam === 'bass' ? 36 : 48) + c.rootPc + iv);
        });
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(seq, {
      stepMs: 900,
      mode: fam === 'bass' ? 'arpeggio-asc' : 'strum-down',
      instrument: fam === 'bass' ? 'electric-bass' : 'acoustic-guitar'
    });
  }

  /**
   * Guarda la progresión armada en el explorador como una nueva práctica de armonía editable.
   * @returns {Promise<Practice>} Práctica creada.
   */
  async saveBuilderAsPractice() {
    const chords = this.builderChords.value;
    const inst = this.instrument.value;
    const key = this.fieldKey.value;
    const title = `Progresión ${chords.slice(0, 4).join(' – ')} (${key})`;
    const voiceLed = this.voiceLedSequence.value;

    const progression = chords.map((chord, idx) => ({
      bars: 1,
      chord,
      voicingId: voiceLed[idx]?.voicing?.id || null
    }));
    const customVoicings = voiceLed
      .map((s) => s.voicing)
      .filter((v) => v && v.suggested)
      .map((v) => v.toJSON());

    const pr = new Practice({
      id: generatePracticeId(title),
      version: 2,
      type: 'harmony',
      title,
      instruments: [inst],
      category: 'campo-armonico',
      level: 2,
      tags: ['campo armónico', key],
      key,
      timeSignature: '4/4',
      tempo: { start: 65, target: 105, step: 5 },
      progression,
      comping: inst === 'guitarra-clasica' ? 'arpegio-pima' : inst === 'bajo' ? 'arpegio-asc' : 'negras-abajo',
      customVoicings,
      goals: ['Reconocer la función de cada grado', 'Cambiar sin cortar el pulso'],
      notes: 'Creada desde el Explorador de Campo Armónico.',
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.showSnackbar(`Práctica "${pr.title}" guardada.`);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
    return pr;
  }

  // --- Conducción de voces, Inversiones y Entrenador de Cambios ---

  /**
   * Recalcula la secuencia óptima de conducción de voces para builderChords.
   */
  recomputeVoiceLeading() {
    const tuning = this.activeTuning.value;
    const result = this._voicingGen.findVoiceLedProgression(
      this.builderChords.value,
      tuning,
      tuning.instrument
    );
    this.voiceLedSequence.set(result, true);
  }

  /**
   * Calcula las inversiones (fundamental → 1ª → 2ª → 3ª) del acorde activo subiendo por el diapasón.
   * @returns {import('../models/Voicing.js').Voicing[]} Lista ordenada por inversión ascendente.
   */
  getInversionWalkVoicings() {
    const symbol = this.activeChord.value.americanSymbol;
    const tuning = this.activeTuning.value;
    const setMap = {
      '321': [3, 4, 5],
      '432': [2, 3, 4],
      '5432': [1, 2, 3, 4]
    };
    const stringSet = tuning.stringCount >= 6
      ? (setMap[this.inversionStringSet.value] || [2, 3, 4])
      : [0, 1, 2];

    const list = this._voicingGen.generate(symbol, {
      tuning,
      stringSet,
      maxSpan: 4,
      maxFret: 14,
      limit: 16
    });

    // Agrupa por inversión 0, 1, 2, 3 tomando la posición más clara de cada una
    const byInv = new Map();
    for (const v of list) {
      const inv = v.computeInversion(tuning);
      if (!byInv.has(inv)) byInv.set(inv, v);
    }
    return [0, 1, 2, 3].map((inv) => byInv.get(inv)).filter(Boolean);
  }

  /**
   * Inicia el Entrenador de Cambios sincronizado con el metrónomo Web Audio.
   */
  startChangeTrainer() {
    if (this.trainerRunning.value) return;
    const chords = this.trainerChords.value;
    if (chords.length < 2) return;

    this.trainerStepIndex.set(0);
    this.trainerCurrentBeat.set(0);
    this.trainerChangesCount.set(0);
    this._trainerStartedAtMs = Date.now();
    this.trainerRunning.set(true);

    let beatCount = 0;
    const beatsPer = this.trainerBeatsPerChange.value;
    this._metronome.configure({
      bpm: this.trainerBpm.value,
      timeSignature: `${beatsPer}/4`,
      subdivision: 1,
      accentFirstBeat: true,
      speedTrainerEnabled: false,
      silentBarEnabled: false
    });
    this._metronome.onBeat = (ev) => {
      if (!ev.isMainBeat) return;
      beatCount += 1;
      const pos = ((beatCount - 1) % beatsPer) + 1;
      this.trainerCurrentBeat.set(pos, true);
      if (pos === 1 && beatCount > 1) {
        this.trainerStepIndex.update((i) => (i + 1) % this.trainerChords.value.length);
        this.trainerChangesCount.update((c) => c + 1);
      }
    };
    this._metronome.start();
  }

  /**
   * Detiene el Entrenador de Cambios, calcula los cambios limpios por minuto (CPM) y los guarda en progreso.
   * @returns {Promise<number>} CPM logrado en la sesión.
   */
  async stopChangeTrainer() {
    if (!this.trainerRunning.value) return 0;
    this._metronome.stop();
    this.trainerRunning.set(false);
    this.trainerCurrentBeat.set(0);

    const changes = this.trainerChangesCount.value;
    const elapsedSec = this._trainerStartedAtMs ? Math.max(5, (Date.now() - this._trainerStartedAtMs) / 1000) : 0;
    this._trainerStartedAtMs = null;

    if (changes >= 2 && elapsedSec >= 5) {
      const cpm = Math.round((changes / elapsedSec) * 60);
      const seqKey = this.trainerChords.value.join(' – ');
      const { UserProgress } = await import('../models/UserProgress.js');
      const next = new UserProgress(this._appVm.progress.value.toJSON());
      const best = next.recordChangeTrainerCpm(seqKey, cpm);
      await this._appVm.replaceProgress(next);
      this._appVm.triggerHaptic(18);
      this._appVm.showSnackbar(`Entrenador: ${cpm} CPM (${changes} cambios). Mejor marca en ${seqKey}: ${best} CPM.`);
      return cpm;
    }
    return 0;
  }

  // --- Entrenamiento de Oído (4.8) ---

  /**
   * Genera una nueva pregunta de entrenamiento de oído para el nivel actual.
   */
  nextEarQuestion() {
    this.earSelectedId.set(null);
    this.earQuestion.set(this._harmony.createEarTrainingQuestion(this.earLevel.value), true);
  }

  /**
   * Reproduce el audio de la pregunta actual de entrenamiento de oído.
   */
  playEarQuestion() {
    const q = this.earQuestion.value;
    if (!q) return;
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(q.playbackMidis, {
      stepMs: 780,
      mode: 'strum-down',
      instrument: 'nylon-guitar'
    });
  }

  /**
   * Evalúa la respuesta seleccionada por el usuario y actualiza el puntaje.
   * @param {string} optionId Identificador de la opción elegida.
   * @returns {boolean} True si la respuesta fue correcta.
   */
  answerEarQuestion(optionId) {
    const q = this.earQuestion.value;
    if (!q || this.earSelectedId.value !== null) return false;
    this.earSelectedId.set(optionId);
    const isCorrect = optionId === q.correctId;
    const prev = this.earScore.value;
    this.earScore.set({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    });
    if (isCorrect) this._appVm.triggerHaptic(16);
    return isCorrect;
  }

  /**
   * Lista todas las calidades de acorde disponibles para los selectores de la Biblioteca.
   * @returns {ChordQuality[]} Lista de calidades.
   */
  getAvailableQualities() {
    return ChordQuality.listAll();
  }
}
