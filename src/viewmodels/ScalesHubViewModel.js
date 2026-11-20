import { formatChordSymbol } from '../core/i18n.js';
import { getChordVoicingMidi } from '../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../core/Observable.js';
import { Practice, generatePracticeId } from '../models/Practice.js';
import { normalizeVoicingInstrument } from '../services/FingeringDesignService.js';
import {
  SCALE_CATALOG,
  SCALE_EAR_LEVELS,
  SCALE_FAMILIES,
  SCALE_STUDY_PATTERNS
} from '../services/ScaleCatalogService.js';

/** Orden de los 7 modos griegos del más brillante al más oscuro para comparación en paralelo. */
const GREEK_MODES_BY_BRIGHTNESS = [
  'lidio',
  'mayor',
  'mixolidio',
  'dorico',
  'menor-natural',
  'frigio',
  'locrio'
];

/** Pestañas válidas del módulo Escalas y Modos. */
const VALID_SCALES_TABS = new Set(['explorador', 'modos', 'patrones', 'oido']);

/**
 * ViewModel del módulo Escalas y Modos (#/escalas).
 * Gestiona el estado reactivo de las 4 herramientas pedagógicas:
 * Explorador (diapasón + digitaciones + teoría + enlaces), Modos en paralelo (por brillo + drone),
 * Patrones de estudio (terceras, grupos, arpegios + partitura ABC sin tablatura) y Oído modal.
 */
export class ScalesHubViewModel {
  /**
   * Construye el ViewModel inyectando los servicios puros de escalas y audio.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({ appVm, scaleCatalogService, audioService, onOpenChord = null }) {
    /** ViewModel global de la aplicación. */
    this._appVm = appVm;
    /** Servicio musicológico de escalas, digitaciones y patrones ABC. */
    this._scales = scaleCatalogService;
    /** Sintetizador Web Audio para notas, secuencias y pedal modal (drone). */
    this._audio = audioService;
    /** Callback opcional para saltar al módulo Acordes con un símbolo precargado. */
    this._onOpenChord = onOpenChord;

    /** Pestaña activa ('explorador' | 'modos' | 'patrones' | 'oido'). */
    this.activeTab = new Observable('explorador');

    const initialInst = normalizeVoicingInstrument(appVm.settings.value.defaultInstrument || 'guitarra');
    /** Instrumento de digitación activo ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5'). */
    this.voicingInstrument = new Observable(initialInst);
    /** Raíz seleccionada en notación americana ('C'..'B'). */
    this.selectedRoot = new Observable('C');
    /** Preferencia de enarmonía para la botonera de raíces (true = sostenidos, false = bemoles). */
    this.preferSharps = new Observable(true);
    /** Identificador de la escala o modo activo dentro del catálogo de 22 escalas. */
    this.selectedScaleId = new Observable('mayor');
    /** Identificador del sistema de digitación elegido para el instrumento activo. */
    this.fingeringSystemId = new Observable(this._defaultSystemFor(initialInst));
    /** Índice de caja/posición dentro del sistema de digitación actual. */
    this.positionIndex = new Observable(0);

    /** Etiqueta mostrada dentro de cada punto del diapasón ('note' | 'degree' | 'finger'). */
    this.labelMode = new Observable('note');
    /** Si true, resalta con borde punteado las notas a evitar (avoid notes). */
    this.showAvoidNotes = new Observable(true);
    /** Orientación para personas zurdas. */
    this.leftHanded = new Observable(false);
    /** En menor melódica, alterna entre modo jazz (fija) y clásico (baja como menor natural). */
    this.classicalMelodicDesc = new Observable(false);
    /** Combinación de mano derecha en guitarra clásica ('i-m' | 'm-i' | 'm-a'). */
    this.rightHandPattern = new Observable('i-m');

    /** Patrón de estudio activo ('asc-desc' | 'terceras' | 'grupos-3' | 'grupos-4' | 'arpegios'). */
    this.studyPattern = new Observable('asc-desc');
    /** Cantidad de octavas para reproducción y partitura ABC (1 o 2). */
    this.octaves = new Observable(1);
    /** Tempo de reproducción en BPM. */
    this.bpm = new Observable(96);

    /** Indica si el pedal armónico modal (drone) está sonando actualmente. */
    this.droneActive = new Observable(false);
    /** Indica si se está reproduciendo una secuencia de escala o patrón. */
    this.isPlayingSequence = new Observable(false);
    /** Altura MIDI real resaltada actualmente en el diapasón SVG durante la reproducción. */
    this.activeHighlightMidi = new Observable(null);

    // --- Estado del entrenador de oído modal ---
    /** Nivel de dificultad de oído modal (1..4). */
    this.earLevel = new Observable(1);
    /** Pregunta activa del entrenador de oído modal. */
    this.earQuestion = new Observable(null);
    /** ID de escala elegida por el usuario en la pregunta actual (o null). */
    this.earSelectedId = new Observable(null);
    /** Puntaje acumulado de la sesión de oído modal. */
    this.earScore = new Observable({ correct: 0, total: 0 });

    /** Definición completa de la escala o modo activo. */
    this.activeScale = new ComputedObservable([this.selectedScaleId], () =>
      this._scales.getScaleById(this.selectedScaleId.value)
    );

    /** Sistemas de digitación disponibles para el instrumento actual. */
    this.availableSystems = new ComputedObservable([this.voicingInstrument], () =>
      this._scales.getFingeringSystems(this.voicingInstrument.value)
    );

    /** Datos completos de layout del diapasón SVG (puntos, dedos, cajas, notas). */
    this.fretboardLayout = new ComputedObservable(
      [this.selectedRoot, this.selectedScaleId, this.voicingInstrument, this.fingeringSystemId, this.positionIndex],
      () =>
        this._scales.computeFretboardLayout({
          root: this.selectedRoot.value,
          scaleId: this.selectedScaleId.value,
          voicingInstrument: this.voicingInstrument.value,
          systemId: this.fingeringSystemId.value,
          positionIndex: this.positionIndex.value
        })
    );

    /** Acordes asociados resueltos en la tonalidad elegida. */
    this.associatedChords = new ComputedObservable([this.selectedRoot, this.selectedScaleId], () =>
      this._scales.getAssociatedChords(this.selectedRoot.value, this.selectedScaleId.value)
    );

    /** Etiqueta secundaria de tonalidad madre relativa. */
    this.relativeParentLabel = new ComputedObservable(
      [this.selectedRoot, this.selectedScaleId, this._appVm.settings],
      () =>
        this._scales.getRelativeParentLabel(
          this.selectedRoot.value,
          this.selectedScaleId.value,
          this._appVm.settings.value.chordNotation
        )
    );

    /** Prácticas reales del repertorio vinculadas a la escala activa. */
    this.linkedRepertoirePractices = new ComputedObservable(
      [this.activeScale, this._appVm.allPractices],
      () => {
        const ids = this.activeScale.value?.repertoireIds || [];
        return ids
          .map((id) => this._appVm.findPracticeById(id))
          .filter(Boolean);
      }
    );

    /** Partitura ABC sin tablatura lista para previsualizar o abrir en el Reproductor. */
    this.previewAbc = new ComputedObservable(
      [
        this.selectedRoot,
        this.selectedScaleId,
        this.voicingInstrument,
        this.studyPattern,
        this.octaves,
        this.classicalMelodicDesc,
        this.rightHandPattern
      ],
      () =>
        this._scales.buildScalePracticeAbc({
          root: this.selectedRoot.value,
          scaleId: this.selectedScaleId.value,
          voicingInstrument: this.voicingInstrument.value,
          pattern: this.studyPattern.value,
          octaves: this.octaves.value,
          classicalMelodicDesc: this.classicalMelodicDesc.value,
          rightHandPattern: this.rightHandPattern.value
        })
    );

    /** Comparativa paralela de los 7 modos griegos ordenados por brillo desde la raíz actual. */
    this.parallelModesComparison = new ComputedObservable([this.selectedRoot], () =>
      GREEK_MODES_BY_BRIGHTNESS.map((modeId) => {
        const scale = this._scales.getScaleById(modeId);
        const notes = this._scales.spellScaleNotes(this.selectedRoot.value, modeId);
        const charNotes = notes.filter((n) => n.isCharacteristic);
        const avoidNotes = notes.filter((n) => n.isAvoid);
        const chords = this._scales.getAssociatedChords(this.selectedRoot.value, modeId);
        return {
          scale,
          notes,
          characteristicNotes: charNotes,
          avoidNotes,
          tonicChord: chords[0]?.symbol || `${this.selectedRoot.value}${scale.droneChordQuality || ''}`
        };
      })
    );
  }

  /**
   * Devuelve el catálogo completo y metadatos estáticos para renderizar selectores.
   * @returns {object} Constantes pedagógicas del módulo.
   */
  getCatalogMeta() {
    return {
      scales: SCALE_CATALOG,
      families: SCALE_FAMILIES,
      patterns: SCALE_STUDY_PATTERNS,
      earLevels: SCALE_EAR_LEVELS
    };
  }

  /**
   * Resuelve el sistema de digitación inicial más idiomatico para cada instrumento.
   * @param {string} inst Instrumento normalizado.
   * @returns {string} ID de sistema por defecto.
   */
  _defaultSystemFor(inst) {
    if (inst === 'guitarra-clasica') return 'primera-posicion';
    if (inst === 'bajo' || inst === 'bajo-5') return 'caja-1oct';
    return 'caged';
  }

  /**
   * Devuelve el timbre de AudioSynthService acorde al instrumento de digitación activo.
   * @returns {'nylon-guitar'|'acoustic-guitar'|'electric-bass'} Timbre sintetizado.
   */
  _getAudioTimbre() {
    const inst = this.voicingInstrument.value;
    if (inst === 'guitarra-clasica') return 'nylon-guitar';
    if (inst === 'bajo' || inst === 'bajo-5') return 'electric-bass';
    return 'acoustic-guitar';
  }

  /**
   * Cambia la pestaña activa del módulo Escalas.
   * @param {string} tab Nombre de pestaña destino.
   */
  setActiveTab(tab) {
    const safe = VALID_SCALES_TABS.has(tab) ? tab : 'explorador';
    if (this.activeTab.value !== safe) {
      this.activeTab.set(safe);
    }
    if (safe === 'oido' && !this.earQuestion.value) {
      this.nextEarQuestion();
    }
  }

  /**
   * Cambia el instrumento de digitación y actualiza al sistema más adecuado si el previo no aplica.
   * @param {string} inst Instrumento elegido ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5').
   */
  setVoicingInstrument(inst) {
    const norm = normalizeVoicingInstrument(inst);
    this.voicingInstrument.set(norm);
    const systems = this._scales.getFingeringSystems(norm);
    if (!systems.some((s) => s.id === this.fingeringSystemId.value)) {
      this.fingeringSystemId.set(this._defaultSystemFor(norm));
    }
    this.positionIndex.set(0);
    if (this.droneActive.value) this._refreshDrone();
  }

  /**
   * Selecciona una raíz nueva y refresca el drone si estaba sonando.
   * @param {string} root Raíz americana ('C'..'B', con # o b).
   */
  selectRoot(root) {
    this.selectedRoot.set(root);
    this.positionIndex.set(0);
    if (this.droneActive.value) this._refreshDrone();
  }

  /**
   * Alterna la preferencia de enarmonía (sostenidos vs. bemoles) en la botonera de raíces.
   * @param {boolean} preferSharps True para sostenidos, false para bemoles.
   */
  setPreferSharps(preferSharps) {
    this.preferSharps.set(Boolean(preferSharps));
  }

  /**
   * Selecciona una escala o modo del catálogo y reinicia la posición a la caja 1.
   * @param {string} scaleId Identificador de la escala.
   */
  selectScale(scaleId) {
    this.selectedScaleId.set(scaleId);
    this.positionIndex.set(0);
    if (this.droneActive.value) this._refreshDrone();
  }

  /**
   * Cambia el sistema de digitación (CAGED, 3NPS, Segovia, Simandl/1FPC, etc.).
   * @param {string} systemId Identificador del sistema.
   */
  setFingeringSystem(systemId) {
    this.fingeringSystemId.set(systemId);
    this.positionIndex.set(0);
  }

  /**
   * Cambia la posición/caja activa dentro del sistema actual.
   * @param {number} idx Índice de posición.
   */
  setPositionIndex(idx) {
    const maxIdx = Math.max(0, (this.fretboardLayout.value?.positions?.length || 1) - 1);
    this.positionIndex.set(Math.max(0, Math.min(maxIdx, Number(idx) || 0)));
  }

  /**
   * Enciende o apaga el pedal armónico modal sostenido (drone) para la tónica y escala activas.
   */
  toggleDrone() {
    if (this.droneActive.value) {
      this._audio.stopDrone();
      this.droneActive.set(false);
    } else {
      this.droneActive.set(true);
      this._refreshDrone();
    }
  }

  /**
   * Actualiza las alturas MIDI del drone modal cuando cambian tónica, escala o instrumento.
   */
  _refreshDrone() {
    const { droneMidis } = this._scales.buildStudySequence({
      root: this.selectedRoot.value,
      scaleId: this.selectedScaleId.value,
      voicingInstrument: this.voicingInstrument.value,
      pattern: 'asc-desc',
      octaves: 1
    });
    this._audio.startDrone(droneMidis, { volume: 0.25 });
  }

  /**
   * Reproduce la escala o el patrón de estudio seleccionado iluminando cada nota en el diapasón SVG.
   * @param {string|null} [overridePattern=null] Patrón opcional para previsualizar uno específico.
   */
  playCurrentScale(overridePattern = null) {
    const { midis, droneMidis } = this._scales.buildStudySequence({
      root: this.selectedRoot.value,
      scaleId: this.selectedScaleId.value,
      voicingInstrument: this.voicingInstrument.value,
      pattern: overridePattern || this.studyPattern.value,
      octaves: this.octaves.value,
      classicalMelodicDesc: this.classicalMelodicDesc.value
    });

    this.isPlayingSequence.set(true);
    this._audio.playScaleSequence(midis, {
      bpm: this.bpm.value,
      instrument: this._getAudioTimbre(),
      useDrone: !this.droneActive.value,
      droneMidis,
      onStep: (midi) => this.activeHighlightMidi.set(midi),
      onEnd: () => {
        this.isPlayingSequence.set(false);
        this.activeHighlightMidi.set(null);
      }
    });
  }

  /**
   * Escucha cualquier modo paralelo desde la raíz actual con su pedal armónico (pestaña Modos).
   * @param {string} modeId Identificador del modo griego.
   */
  playParallelMode(modeId) {
    const { midis, droneMidis } = this._scales.buildStudySequence({
      root: this.selectedRoot.value,
      scaleId: modeId,
      voicingInstrument: this.voicingInstrument.value,
      pattern: 'asc-desc',
      octaves: 1
    });
    this.isPlayingSequence.set(true);
    this._audio.playScaleSequence(midis, {
      bpm: this.bpm.value,
      instrument: this._getAudioTimbre(),
      useDrone: true,
      droneMidis,
      onStep: (midi) => this.activeHighlightMidi.set(midi),
      onEnd: () => {
        this.isPlayingSequence.set(false);
        this.activeHighlightMidi.set(null);
      }
    });
  }

  /**
   * Suena una nota puntual al tocar o hacer clic en un punto del diapasón SVG.
   * @param {number} midi Altura MIDI real.
   */
  playSingleNote(midi) {
    if (!Number.isFinite(midi)) return;
    this._audio.playVoicing([midi], {
      mode: 'block',
      instrument: this._getAudioTimbre(),
      duration: 1.2,
      volume: 0.9
    });
  }

  /**
   * Reproduce un acorde asociado desde el chip armónico de la escala.
   * @param {string} chordSymbol Símbolo americano del acorde (ej. "Dm7").
   */
  playAssociatedChord(chordSymbol) {
    const voicing = getChordVoicingMidi(chordSymbol, this._getAudioTimbre() === 'electric-bass' ? 43 : 52);
    if (!voicing) return;
    const midis = [voicing.bassMidi, ...voicing.chordMidis];
    this._audio.playVoicing(midis, {
      mode: this._getAudioTimbre() === 'electric-bass' ? 'block' : 'strum-down',
      instrument: this._getAudioTimbre(),
      duration: 1.6,
      volume: 0.85
    });
  }

  /**
   * Detiene toda reproducción de escala y el pedal armónico modal.
   */
  stopAudio() {
    this._audio.stopScaleSequence();
    this._audio.stopDrone();
    this.droneActive.set(false);
    this.isPlayingSequence.set(false);
    this.activeHighlightMidi.set(null);
  }

  /**
   * Navega al módulo Acordes (#/acordes/biblioteca) precargando el acorde seleccionado (puente Escalas → Acordes).
   * @param {string} chordSymbol Símbolo americano del acorde.
   */
  openChordInHub(chordSymbol) {
    this.stopAudio();
    if (typeof this._onOpenChord === 'function') {
      this._onOpenChord(chordSymbol);
    } else {
      this._appVm.navigate('#/acordes/biblioteca');
    }
  }

  /**
   * Abre una obra vinculada del catálogo de Repertorio directamente en el Reproductor (puente Escalas → Repertorio).
   * @param {string} practiceId Identificador de la práctica.
   */
  openRepertoirePractice(practiceId) {
    if (!practiceId) return;
    this.stopAudio();
    this._appVm.activePracticeId.set(practiceId);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
  }

  /**
   * Recibe un acorde desde el módulo Acordes, selecciona la escala más compatible y navega al Explorador.
   * @param {string} chordSymbol Símbolo americano del acorde (ej. "G7", "Dm7").
   */
  openForChord(chordSymbol) {
    const suggestion = this._scales.suggestScaleForChord(chordSymbol);
    this.selectedRoot.set(suggestion.root);
    this.selectedScaleId.set(suggestion.scaleId);
    this.positionIndex.set(0);
    this.activeTab.set('explorador');
    this._appVm.navigate('#/escalas/explorador');
    const notation = this._appVm.settings.value.chordNotation;
    const scale = this._scales.getScaleById(suggestion.scaleId);
    this._appVm.showSnackbar(
      `Escala sugerida para ${formatChordSymbol(chordSymbol, notation)}: ${formatChordSymbol(suggestion.root, notation)} ${scale.name}`
    );
  }

  /**
   * Crea una práctica completa (esquema v3, sin tablatura) para la escala y patrón actuales,
   * la guarda en las prácticas del usuario y opcionalmente la abre de inmediato en el Reproductor.
   * @param {boolean} [openImmediately=true] Si true, abre directo en #/practica/:id.
   * @returns {Promise<Practice>} Práctica creada.
   */
  async practiceCurrentScale(openImmediately = true) {
    const scale = this.activeScale.value;
    const root = this.selectedRoot.value;
    const notation = this._appVm.settings.value.chordNotation;
    const displayRoot = formatChordSymbol(root, notation);
    const patternMeta = SCALE_STUDY_PATTERNS.find((p) => p.id === this.studyPattern.value) || SCALE_STUDY_PATTERNS[0];
    const normInst = this.voicingInstrument.value;
    const practiceInst = normInst === 'bajo-5' ? 'bajo' : normInst;
    const layout = this.fretboardLayout.value;

    const abc = this.previewAbc.value;
    const practice = new Practice({
      id: generatePracticeId(`escala-${scale.id}`),
      version: 3,
      origin: 'user',
      type: 'melody',
      title: `${displayRoot} ${scale.name} · ${patternMeta.label}`,
      instruments: [practiceInst],
      level: scale.level || 2,
      category: 'escala',
      key: root,
      timeSignature: this.studyPattern.value === 'grupos-3' ? '3/4' : '4/4',
      defaultBpm: this.bpm.value,
      targetBpm: Math.min(180, this.bpm.value + 24),
      description: `Estudio de ${displayRoot} ${scale.name} (${layout?.system?.label || ''}) en ${this.octaves.value} octava(s). ${scale.uses}`,
      guide: [
        `Fórmula: ${scale.degreeLabels.join(' – ')}.`,
        `Digitación sugerida: ${layout?.system?.label || ''} — ${layout?.activePosition?.label || ''}.`,
        scale.techniqueTip,
        scale.avoidNoteExplanation ? `Nota a cuidar: ${scale.avoidNoteExplanation}` : ''
      ].filter(Boolean),
      abc,
      rights: 'user_import',
      verified: true
    });

    await this._appVm.upsertUserPractice(practice);
    if (openImmediately) {
      this.stopAudio();
      this._appVm.navigate(`#/practica/${encodeURIComponent(practice.id)}`);
      this._appVm.showSnackbar('Estudio de escala abierto en el Reproductor.');
    } else {
      this._appVm.showSnackbar('Estudio de escala guardado en tus Prácticas.');
    }
    return practice;
  }

  // --- Entrenador de oído modal ---

  /**
   * Cambia el nivel del entrenador de oído modal y genera una pregunta nueva.
   * @param {number} level Nivel (1..4).
   */
  setEarLevel(level) {
    this.earLevel.set(Math.max(1, Math.min(4, Number(level) || 1)));
    this.nextEarQuestion();
  }

  /**
   * Genera una nueva pregunta de oído modal en enfoque paralelo sobre la raíz seleccionada.
   */
  nextEarQuestion() {
    const q = this._scales.generateScaleEarQuestion(this.earLevel.value, this.selectedRoot.value);
    this.earQuestion.set(q);
    this.earSelectedId.set(null);
  }

  /**
   * Reproduce la pregunta actual de oído modal con su pedal armónico de tónica.
   */
  playEarQuestion() {
    const q = this.earQuestion.value;
    if (!q) return;
    this.isPlayingSequence.set(true);
    this._audio.playScaleSequence(q.midis, {
      bpm: 100,
      instrument: 'nylon-guitar',
      useDrone: true,
      droneMidis: q.droneMidis,
      onEnd: () => this.isPlayingSequence.set(false)
    });
  }

  /**
   * Evalúa la respuesta elegida por el estudiante en el entrenador de oído modal.
   * @param {string} scaleId Identificador elegido.
   */
  answerEarQuestion(scaleId) {
    const q = this.earQuestion.value;
    if (!q || this.earSelectedId.value) return;
    this.earSelectedId.set(scaleId);
    const isCorrect = scaleId === q.answerScale.id;
    const prev = this.earScore.value;
    this.earScore.set({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    });
    this._appVm.triggerHaptic(isCorrect ? 15 : [20, 40, 20]);
  }
}
