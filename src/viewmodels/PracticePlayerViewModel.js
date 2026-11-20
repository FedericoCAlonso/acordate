import { ComputedObservable, Observable } from '../core/Observable.js';
import { NOTE_TO_PC, parseTimeSignature, pcToNoteName, prefersFlats, transposeAbc, transposeChordSymbol } from '../core/MusicTheory.js';
import { findVoicingById, getCuratedVoicingsForChord } from '../data/voicings.js';
import { Exercise } from '../models/Exercise.js';
import { Practice, generatePracticeId } from '../models/Practice.js';
import { Tuning } from '../models/Tuning.js';
import { WalkingBassGenerator } from '../services/WalkingBassGenerator.js';

/**
 * ViewModel del reproductor de prácticas ("Modo Atril").
 * Coordina transposición, vistas (Pentagrama / Cifrado / Mixto), síntesis multi-voz con
 * mezcla guardada por práctica, registro de escucha real/+1oct, bucle, conteo previo,
 * entrenador de velocidad, lista de verificación de objetivos y modo pantalla completa.
 */
export class PracticePlayerViewModel {
  /**
   * Inicializa el reproductor inyectando los servicios y el AppViewModel.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({ appVm, audioService, abcService, wakeLockService, importExportService = null }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Servicio de reproducción Web Audio multi-voz. */
    this._audio = audioService;
    /** Servicio de análisis y preparación ABC. */
    this._abc = abcService;
    /** Servicio de bloqueo de pantalla durante el estudio. */
    this._wakeLock = wakeLockService;
    /** Servicio opcional de exportación desde el menú superior. */
    this._io = importExportService;

    /** Práctica activa cargada actualmente. */
    this.practice = new Observable(null);
    /** Tempo actual en BPM (40-240). */
    this.bpm = new Observable(80);
    /** Desplazamiento de transposición en semitonos (-11 a +11). */
    this.transposeSemitones = new Observable(0);
    /** Modo de vista de notación ('pentagrama' | 'cifrado' | 'mixto'). */
    this.viewMode = new Observable('mixto');
    /** Nivel de zoom de la partitura (0.75 a 1.6). */
    this.zoom = new Observable(1.0);

    /** Estado de reproducción en curso. */
    this.isPlaying = new Observable(false);
    /** Estado de pausa a mitad de reproducción. */
    this.isPaused = new Observable(false);
    /** Estado del conteo previo (null o { beat, countDown, totalBeats }). */
    this.countInStatus = new Observable(null);
    /** Compás actualmente sonando (1-based, 0 si está detenido). */
    this.activeMeasure = new Observable(0);
    /** Índice del paso armónico actualmente sonando en prácticas de armonía/mixtas (-1 si detenido). */
    this.activeChordStepIndex = new Observable(-1);
    /** Patrón rítmico de acompañamiento (comping) editable en vivo sin modificar la práctica. */
    this.compingPattern = new Observable('negras-abajo');
    /** Último evento de nota visual (primera voz activa) para compatibilidad. */
    this.activeNoteEvent = new Observable(null);
    /** Lista simultánea de eventos de nota activos en todas las voces del pulso actual. */
    this.activeNoteEvents = new Observable([]);

    /** Bucle activado. */
    this.loopEnabled = new Observable(false);
    /** Compás inicial del bucle (1-based). */
    this.loopStartMeasure = new Observable(1);
    /** Compás final del bucle (1-based). */
    this.loopEndMeasure = new Observable(4);
    /** Compases de conteo previo (0, 1 o 2). */
    this.countInMeasures = new Observable(appVm.settings.value.countInMeasures ?? 1);

    /** Instrumento de síntesis seleccionado. */
    this.synthInstrument = new Observable('acoustic-guitar');
    /** Volumen de melodía / voz principal (1.0 = 100 % por defecto). */
    this.melodyVolume = new Observable(1.0);
    /** Acompañamiento de acordes activado/desactivado (el guitarrista puede silenciarlo en play-along). */
    this.chordsEnabled = new Observable(true);
    /** Volumen del acompañamiento de acordes (0-1). */
    this.chordsVolume = new Observable(0.55);
    /** Pista de bajo activada/desactivada (el bajista puede silenciarla en play-along). */
    this.bassEnabled = new Observable(true);
    /** Volumen independiente de la voz de bajo (0-1). */
    this.bassVolume = new Observable(0.75);
    /** Modo de voces en piezas polifónicas clásicas ('both' | 'v1' | 'v2'). */
    this.voiceMode = new Observable('both');
    /** Indica si la partitura activa posee varias voces (V:1 / V:2). */
    this.hasMultipleVoices = new Observable(false);
    /** Mostrar capa opcional de análisis armónico (grados y cadencias en clásica). */
    this.showHarmonicAnalysis = new Observable(false);
    /** Walking bass sugerido generado sobre una progresión armónica de bajo/repertorio. */
    this.generatedWalkingAbc = new Observable('');
    /** Generador puro de líneas de walking bass sobre progresiones. */
    this._walkingGen = new WalkingBassGenerator();
    /** Metrónomo integrado activado durante la reproducción. */
    this.metronomeEnabled = new Observable(true);
    /** Volumen del metrónomo integrado (0-1). */
    this.metronomeVolume = new Observable(0.65);

    /** Mostrar digitaciones anotadas sobre las notas. */
    this.showFingerings = new Observable(appVm.settings.value.showFingerings ?? true);
    /** Mostrar funciones armónicas en bajo (R, 3, 5, 7, Crom). */
    this.showBassFunctions = new Observable(appVm.settings.value.showBassFunctions ?? true);

    /** Modo entrenador de velocidad integrado al bucle del reproductor. */
    this.speedTrainerEnabled = new Observable(false);
    /** Cantidad de vueltas de bucle antes de subir el tempo automáticamente. */
    this.speedTrainerEveryLoops = new Observable(2);

    /** Modo pantalla completa ("atril"): muestra solo partitura y barra de transporte. */
    this.isAtrilFullscreen = new Observable(false);
    /** Indica si el panel modal de ajustes (bottom sheet / side sheet) está abierto. */
    this.isSheetOpen = new Observable(false);
    /** Pestaña activa del sheet de ajustes ('mezcla' | 'bucle' | 'timbre' | 'vista'). */
    this.activeSheetTab = new Observable('mezcla');

    /** Repeticiones completadas durante la sesión actual. */
    this.sessionRepetitions = new Observable(0);
    /** Vueltas limpias registradas al BPM actual para sugerir subir tempo. */
    this._cleanRepsAtCurrentBpm = 0;
    /** Cantidad de compases detectados en la práctica activa. */
    this.measureCount = new Observable(4);

    /** Marca de inicio de reproducción actual para contabilizar tiempo de estudio. */
    this._playStartedAtMs = null;
    /** Segundos acumulados sin guardar en la sesión en curso. */
    this._pendingStudySeconds = 0;

    /** ABC resultante luego de aplicar la transposición en semitonos. */
    this.transposedAbc = new ComputedObservable(
      [this.practice, this.transposeSemitones],
      () => {
        const pr = this.practice.value;
        if (!pr || !pr.abc) return '';
        return transposeAbc(pr.abc, this.transposeSemitones.value);
      }
    );

    /** Pasos de progresión armónica resueltos con su acorde transpuesto y su Voicing exacto. */
    this.harmonySteps = new ComputedObservable(
      [this.practice, this.transposeSemitones],
      () => {
        const pr = this.practice.value;
        if (!pr || !Array.isArray(pr.progression) || pr.progression.length === 0) return [];
        const semi = this.transposeSemitones.value;
        const isBass = pr.instruments.includes('bajo');
        const fam = isBass ? 'bass' : 'guitar';
        const tuning = Tuning.defaultForInstrument(fam);
        const useFlats = prefersFlats(this.transposedKey?.value || pr.key);

        let barCursor = 1;
        return pr.progression.map((step, idx) => {
          const chordSymbol = semi ? transposeChordSymbol(step.chord, semi, useFlats) : step.chord;
          const voicing = !semi && step.voicingId
            ? findVoicingById(step.voicingId, pr.customVoicings, chordSymbol, fam)
            : (getCuratedVoicingsForChord(chordSymbol, fam, tuning)[0] || findVoicingById(null, pr.customVoicings, chordSymbol, fam));
          const startMeasure = Math.floor(barCursor);
          barCursor += Number(step.bars) || 1;
          return {
            index: idx,
            bars: step.bars,
            startMeasure,
            section: step.section || null,
            chord: chordSymbol,
            voicing,
            rhythm: step.rhythm || null,
            midis: voicing ? voicing.getMidiNotes(tuning) : []
          };
        });
      }
    );

    /** Tonalidad visible luego de la transposición. */
    this.transposedKey = new ComputedObservable(
      [this.practice, this.transposeSemitones],
      () => {
        const pr = this.practice.value;
        if (!pr) return 'C';
        const semi = this.transposeSemitones.value;
        if (!semi) return pr.key;
        const match = pr.key.match(/^([A-G][#b]?)(.*)$/);
        if (!match || NOTE_TO_PC[match[1]] === undefined) return pr.key;
        const newPc = (NOTE_TO_PC[match[1]] + semi + 120) % 12;
        const flatCand = pcToNoteName(newPc, true) + match[2];
        const useFlats = prefersFlats(flatCand);
        return transposeChordSymbol(pr.key, semi, useFlats);
      }
    );

    /** Modelo Exercise parseado a partir del ABC transpuesto. */
    this.exercise = new ComputedObservable(
      [this.practice, this.transposedAbc],
      () => {
        const pr = this.practice.value;
        if (!pr) return null;
        return new Exercise({
          practiceId: pr.id,
          abc: this.transposedAbc.value,
          key: this.transposedKey.value,
          timeSignature: pr.timeSignature
        });
      }
    );

    /** ABC preparado finalmente para renderizar con abcjs (sin título T: duplicado). */
    this.renderableAbc = new ComputedObservable(
      [
        this.practice,
        this.transposedAbc,
        this.viewMode,
        this.showFingerings,
        this.showBassFunctions,
        this.showHarmonicAnalysis,
        this._appVm.settings
      ],
      () => {
        const pr = this.practice.value;
        if (!pr) return '';
        return this._abc.prepareAbcForRender(this.transposedAbc.value, {
          viewMode: this.viewMode.value,
          chordNotation: this._appVm.settings.value.chordNotation,
          showFingerings: this.showFingerings.value,
          fingerings: pr.fingerings,
          showBassFunctions: this.showBassFunctions.value,
          showHarmonicAnalysis: this.showHarmonicAnalysis.value,
          harmonicAnalysis: pr.harmonicAnalysis || [],
          isBass: pr.instruments.includes('bajo'),
          stripTitle: true
        });
      }
    );

    /** Estadísticas guardadas de la práctica activa en el progreso global. */
    this.practiceStats = new ComputedObservable(
      [this.practice, this._appVm.progress],
      () => {
        const pr = this.practice.value;
        if (!pr) return null;
        return this._appVm.progress.value.getPracticeStats(pr.id);
      }
    );

    // Vincula eventos del motor de audio
    this._audio.onVisualEvent = (ev) => {
      if (ev.isCountIn) {
        this.countInStatus.set(
          { beat: ev.countInBeat, countDown: ev.countDown ?? ev.countInBeat, totalBeats: ev.totalBeats },
          true
        );
        return;
      }
      this.countInStatus.set(null);
      if (ev.measureIndex) this.activeMeasure.set(ev.measureIndex);
      if (ev.chordStepIndex !== undefined) this.activeChordStepIndex.set(ev.chordStepIndex);
      if (Array.isArray(ev.activeNotes)) {
        this.activeNoteEvents.set(ev.activeNotes, true);
        this.activeNoteEvent.set(ev.activeNotes[0] || null, true);
      } else if (ev.noteEvent) {
        this.activeNoteEvents.set([ev.noteEvent], true);
        this.activeNoteEvent.set(ev.noteEvent, true);
      }
    };

    this._audio.onPassComplete = () => {
      this._handlePassComplete();
    };

    this._audio.onPlaybackEnd = () => {
      this._flushStudyTime();
      this.isPlaying.set(false);
      this.isPaused.set(false);
      this.countInStatus.set(null);
      this.activeNoteEvent.set(null);
      this.activeNoteEvents.set([]);
      this._wakeLock.release();
    };

    // Sincroniza ajustes globales (registro de escucha, digitaciones, conteo)
    appVm.settings.subscribe((s) => {
      this.showFingerings.set(s.showFingerings);
      this.showBassFunctions.set(s.showBassFunctions);
      this.countInMeasures.set(s.countInMeasures);
      this._audio.configure({ listeningRegister: s.listeningRegister });
    });
  }

  /**
   * Carga una práctica en el reproductor, aplicando su mezcla guardada (o 100 % voz principal por defecto).
   * @param {import('../models/Practice.js').Practice|null} practice Práctica a cargar.
   */
  loadPractice(practice) {
    this.stop();
    this.practice.set(practice || null);
    this.transposeSemitones.set(0);
    this.sessionRepetitions.set(0);
    this.bassEnabled.set(true);
    this.voiceMode.set('both');
    this.generatedWalkingAbc.set('');
    this.hasMultipleVoices.set(Boolean(practice?.abc && /^V:\s*2/m.test(practice.abc)));
    this.showHarmonicAnalysis.set(Boolean(practice?.harmonicAnalysis?.length > 0));
    this._cleanRepsAtCurrentBpm = 0;
    this._pendingStudySeconds = 0;

    if (!practice) return;

    this.bpm.set(practice.tempo.start);
    this.synthInstrument.set(practice.getDefaultSynthInstrument());
    this.compingPattern.set(practice.comping || 'negras-abajo');
    this.activeChordStepIndex.set(-1);

    // Ajusta vista inicial idónea según tipo de práctica (Armonía muestra diagramas; Melodía/Mixta muestra Mixto)
    if (practice.type === 'harmony') {
      this.viewMode.set('diagramas');
    } else if (this.viewMode.value === 'diagramas') {
      this.viewMode.set('mixto');
    }

    // Carga la mezcla propia de la práctica (o la predeterminada con melodía al 100 %)
    const mix = this._appVm.getPracticeMix(practice);
    this.melodyVolume.set(mix.melody);
    this.chordsVolume.set(mix.chords);
    this.bassVolume.set(mix.bass);
    this.metronomeVolume.set(mix.metronome);
    this.chordsEnabled.set(mix.chordsEnabled);
    this.metronomeEnabled.set(mix.metronomeEnabled);

    if (practice.type === 'harmony') {
      const harmonyTl = this.buildHarmonyTimeline();
      this.measureCount.set(harmonyTl.measureCount);
      this.loopEnabled.set(false);
      this.loopStartMeasure.set(1);
      this.loopEndMeasure.set(harmonyTl.measureCount);
      this._audio.loadTimeline(harmonyTl);
    } else {
      const ex = this.exercise.value;
      const totalMeasures = Math.max(1, ex?.measureCount || 4);
      this.measureCount.set(totalMeasures);
      this.loopEnabled.set(false);
      this.loopStartMeasure.set(1);
      this.loopEndMeasure.set(totalMeasures);

      const fallbackTimeline = this._abc.extractTimeline(null, this.transposedAbc.value, {
        instrument: practice.instruments[0] || 'guitarra',
        isBass: practice.instruments.includes('bajo'),
        timeSignature: practice.timeSignature
      });
      this._enrichTimelineWithHarmonyVoicings(fallbackTimeline);
      this._audio.loadTimeline(fallbackTimeline);
    }
    this._syncAudioConfig();
  }

  /**
   * Construye la línea de tiempo exacta de una práctica de armonía usando los MIDI reales
   * de cada Voicing (Tuning + frets) y el compás de la práctica.
   * @returns {object} Timeline lista para AudioSynthService.
   */
  buildHarmonyTimeline() {
    const pr = this.practice.value;
    const { beats, beatUnit } = parseTimeSignature(pr?.timeSignature || '4/4');
    const beatsPerMeasure = beats * (4 / beatUnit);
    const steps = this.harmonySteps.value;
    const isBassPiece = Boolean(pr?.instruments?.includes('bajo'));

    let cursorBeat = 0;
    const chords = steps.map((step, idx) => {
      const durBeats = step.bars * beatsPerMeasure;
      const measureIndex = Math.floor(cursorBeat / beatsPerMeasure) + 1;
      const ev = {
        beat: cursorBeat,
        durationBeats: durBeats,
        symbol: step.chord,
        measureIndex,
        stepIndex: idx,
        voicingMidis: step.midis,
        rhythm: step.rhythm
      };
      cursorBeat += durBeats;
      return ev;
    });

    const totalBeats = Math.max(beatsPerMeasure, cursorBeat);
    return {
      notes: [],
      chords,
      totalBeats,
      beatsPerMeasure,
      beatUnit,
      measureCount: Math.max(1, Math.ceil(totalBeats / beatsPerMeasure)),
      isBassPiece,
      isHarmonyOnly: true
    };
  }

  /**
   * Inyecta los voicingMidis exactos de harmonySteps en la línea de tiempo de una práctica mixta.
   * @param {object} timeline Timeline extraída de abcjs.
   */
  _enrichTimelineWithHarmonyVoicings(timeline) {
    if (!timeline || this.harmonySteps.value.length === 0) return;
    const harmonyTl = this.buildHarmonyTimeline();
    if (harmonyTl.chords.length > 0) {
      timeline.chords = harmonyTl.chords;
    }
  }

  /**
   * Cambia el patrón de ritmo (comping) en vivo sin modificar ni guardar la práctica.
   * @param {string} pattern Clave en COMPING_PATTERNS.
   */
  setCompingPattern(pattern) {
    this.compingPattern.set(pattern);
    this._audio.configure({ comping: pattern });
  }

  /**
   * Reproduce un voicing puntual al tocar su diagrama dentro de la pantalla de práctica.
   * @param {object} step Paso de harmonySteps.
   */
  playStepVoicing(step) {
    if (!step) return;
    const isBass = this.practice.value?.instruments?.includes('bajo');
    const comping = this.compingPattern.value || this.practice.value?.comping || 'negras-abajo';
    const isArpComping = comping.startsWith('arpegio');
    const mode = isBass
      ? (isArpComping ? 'arpeggio-asc' : 'block')
      : (comping === 'arpegio-pima' ? 'arpeggio-pima' : 'strum-down');
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    if (step.voicing) {
      this._audio.playVoicing(step.voicing, {
        mode,
        instrument: this.synthInstrument.value,
        tuning: Tuning.defaultForInstrument(isBass ? 'bass' : 'guitar'),
        duration: 1.5
      });
    }
  }

  /**
   * Registra la línea de tiempo extraída tras el renderizado de abcjs sin interrumpir la reproducción.
   * @param {object} timeline Línea de tiempo devuelta por AbcService.extractTimeline.
   */
  registerVisualTimeline(timeline) {
    if (!timeline) return;
    this.measureCount.set(timeline.measureCount);
    if (timeline.hasMultipleVoices !== undefined) {
      this.hasMultipleVoices.set(Boolean(timeline.hasMultipleVoices));
    }
    if (this.loopEndMeasure.value > timeline.measureCount) {
      this.loopEndMeasure.set(timeline.measureCount);
    }
    this._audio.loadTimeline(timeline);
  }

  /**
   * Activa o silencia la pista de bajo (permite al bajista tocar sobre la base sin doblar su instrumento).
   * @param {boolean} enabled True para escuchar el bajo de base.
   */
  setBassEnabled(enabled) {
    this.bassEnabled.set(Boolean(enabled));
    this._syncAudioConfig();
  }

  /**
   * Cambia el modo de voces en piezas polifónicas clásicas ('both' | 'v1' | 'v2').
   * @param {'both'|'v1'|'v2'} mode Voces activas.
   */
  setVoiceMode(mode) {
    if (['both', 'v1', 'v2'].includes(mode)) {
      this.voiceMode.set(mode);
      this._syncAudioConfig();
    }
  }

  /**
   * Calcula las secciones marcadas (A, B, C…) de la progresión actual para bucle rápido por sección.
   * @returns {Array<{ label: string, startMeasure: number, endMeasure: number }>} Secciones detectadas.
   */
  getFormSections() {
    const steps = this.harmonySteps.value || [];
    const totalMeasures = Math.max(1, this.measureCount.value || 1);
    const markers = [];
    let lastLabel = null;
    steps.forEach((s) => {
      if (s.section && s.section !== lastLabel) {
        lastLabel = s.section;
        markers.push({ label: s.section, startMeasure: Math.max(1, s.startMeasure || 1) });
      }
    });
    if (markers.length === 0) return [];
    return markers.map((mk, idx) => ({
      label: mk.label,
      startMeasure: mk.startMeasure,
      endMeasure: idx + 1 < markers.length ? Math.max(mk.startMeasure, markers[idx + 1].startMeasure - 1) : totalMeasures
    }));
  }

  /**
   * Activa el bucle exactamente sobre una sección de la forma del tema (ej. Sección A o B).
   * @param {{ label: string, startMeasure: number, endMeasure: number }} section Sección elegida.
   */
  loopSection(section) {
    if (!section) return;
    this.setLoop({
      enabled: true,
      start: section.startMeasure,
      end: section.endMeasure
    });
    this._appVm.showSnackbar(`Bucle en sección ${section.label} (compases ${section.startMeasure}–${section.endMeasure}).`);
  }

  /**
   * Genera una línea de walking bass sugerida sobre la progresión armónica actual (con notas del acorde
   * y objetivos de notas guía 3ª y 7ª) para estudiar o guardar como práctica editable de bajo.
   * @returns {string} Partitura ABC de walking bass generada.
   */
  generateWalkingForCurrent() {
    const pr = this.practice.value;
    const steps = this.harmonySteps.value || [];
    if (!pr || steps.length === 0) return '';

    const chordsPerBar = [];
    for (const s of steps) {
      const count = Math.max(1, Math.round(Number(s.bars) || 1));
      for (let i = 0; i < count; i++) {
        chordsPerBar.push(s.chord);
      }
    }
    const generated = this._walkingGen.generate({
      chords: chordsPerBar.slice(0, 32),
      key: this.transposedKey.value || pr.key || 'C',
      title: `Walking sobre ${pr.title}`
    });
    this.generatedWalkingAbc.set(generated.abc);
    this._appVm.showSnackbar('Walking bass generado sobre la progresión. Podés guardarlo como práctica editable.');
    return generated.abc;
  }

  /**
   * Guarda el walking bass generado como una práctica editable del usuario y la abre en el editor.
   */
  async saveGeneratedWalkingAsPractice() {
    const abc = this.generatedWalkingAbc.value;
    const pr = this.practice.value;
    if (!abc || !pr) return;
    const title = `Walking: ${pr.title}`;
    const nextPr = new Practice({
      id: generatePracticeId(title),
      version: 3,
      type: 'mixed',
      title,
      instruments: ['bajo'],
      category: 'walking',
      level: pr.level,
      tags: ['walking', 'generado', ...(pr.tags || []).slice(0, 2)],
      key: this.transposedKey.value || pr.key,
      timeSignature: pr.timeSignature,
      tempo: { ...pr.tempo },
      abc,
      progression: pr.progression.map((s) => s.toJSON()),
      comping: pr.comping || 'swing-negras',
      goals: ['Marcar la raíz en el tiempo 1', 'Apuntar a notas guía (3.ª y 7.ª) en tiempos fuertes'],
      notes: `Línea de walking sugerida generada sobre ${pr.title}.`,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(nextPr);
    this._appVm.navigate(`#/editor/${encodeURIComponent(nextPr.id)}`);
  }

  /**
   * Marca o desmarca localmente la pieza actual como verificada por el usuario o su profesor.
   */
  async toggleVerifiedCurrent() {
    const pr = this.practice.value;
    if (!pr) return;
    const { UserProgress } = await import('../models/UserProgress.js');
    const next = new UserProgress(this._appVm.progress.value.toJSON());
    const currentlyVerified = next.isPracticeVerified(pr);
    next.setPracticeVerified(pr.id, !currentlyVerified);
    await this._appVm.replaceProgress(next);
    this._appVm.showSnackbar(!currentlyVerified ? 'Transcripción marcada como verificada.' : 'Marcada como "A verificar".');
  }

  /**
   * Sincroniza la configuración actual del ViewModel hacia el servicio de audio.
   */
  _syncAudioConfig() {
    this._audio.configure({
      bpm: this.bpm.value,
      instrument: this.synthInstrument.value,
      listeningRegister: this._appVm.settings.value.listeningRegister || 'real',
      melodyVolume: this.melodyVolume.value,
      chordsEnabled: this.chordsEnabled.value,
      chordsVolume: this.chordsVolume.value,
      bassEnabled: this.bassEnabled.value,
      bassVolume: this.bassVolume.value,
      voiceMode: this.voiceMode.value,
      metronomeEnabled: this.metronomeEnabled.value,
      metronomeVolume: this.metronomeVolume.value,
      comping: this.compingPattern.value,
      countInMeasures: this.countInMeasures.value,
      loopEnabled: this.loopEnabled.value,
      loopStartMeasure: this.loopStartMeasure.value,
      loopEndMeasure: this.loopEndMeasure.value
    });
  }

  /**
   * Persiste la mezcla actual asociada a la práctica activa.
   */
  _persistCurrentMix() {
    const pr = this.practice.value;
    if (!pr) return;
    this._appVm.savePracticeMix(pr.id, {
      melody: this.melodyVolume.value,
      chords: this.chordsVolume.value,
      bass: this.bassVolume.value,
      metronome: this.metronomeVolume.value,
      chordsEnabled: this.chordsEnabled.value,
      metronomeEnabled: this.metronomeEnabled.value
    });
  }

  /**
   * Restablece el mezclador de la práctica activa a sus niveles óptimos por defecto (melodía 100 %).
   */
  async resetPracticeMix() {
    const pr = this.practice.value;
    if (!pr) return;
    await this._appVm.resetPracticeMix(pr.id);
    const mix = this._appVm.getPracticeMix(pr);
    this.melodyVolume.set(mix.melody);
    this.chordsVolume.set(mix.chords);
    this.bassVolume.set(mix.bass);
    this.metronomeVolume.set(mix.metronome);
    this.chordsEnabled.set(mix.chordsEnabled);
    this.metronomeEnabled.set(mix.metronomeEnabled);
    this._syncAudioConfig();
    this._appVm.showSnackbar('Mezcla restablecida (voz principal al 100 %).');
  }

  /**
   * Inicia o reanuda la reproducción y solicita Wake Lock para mantener la pantalla encendida.
   */
  play() {
    if (!this.practice.value) return;
    this._syncAudioConfig();
    this._audio.play();
    this.isPlaying.set(true);
    this.isPaused.set(false);
    this._playStartedAtMs = Date.now();
    this._wakeLock.request();
  }

  /**
   * Pausa la reproducción acumulando el tiempo practicado.
   */
  pause() {
    if (!this.isPlaying.value) return;
    this._accumulateElapsedTime();
    this._audio.pause();
    this.isPlaying.set(false);
    this.isPaused.set(true);
    this._wakeLock.release();
  }

  /**
   * Detiene la reproducción, guarda el progreso acumulado y limpia el resaltado activo.
   */
  stop() {
    this._accumulateElapsedTime();
    this._flushStudyTime();
    this._audio.stop();
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.countInStatus.set(null);
    this.activeMeasure.set(0);
    this.activeChordStepIndex.set(-1);
    this.activeNoteEvent.set(null);
    this.activeNoteEvents.set([]);
    this._wakeLock.release();
  }

  /**
   * Alterna entre reproducir y pausar.
   */
  togglePlay() {
    if (this.isPlaying.value) this.pause();
    else this.play();
  }

  /**
   * Cambia el tempo de reproducción (40-240 BPM) sin alterar la afinación.
   * @param {number} bpm Nuevo BPM.
   */
  setTempo(bpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(Number(bpm) || 80)));
    if (clamped !== this.bpm.value) {
      this._cleanRepsAtCurrentBpm = 0;
    }
    this.bpm.set(clamped);
    this._audio.configure({ bpm: clamped });
  }

  /**
   * Sube o baja el tempo actual en un incremento dado.
   * @param {number} delta Incremento en BPM.
   */
  stepTempo(delta) {
    this.setTempo(this.bpm.value + Number(delta));
  }

  /**
   * Transpone melodía y cifrado juntos una cantidad de semitonos respecto a la tonalidad original.
   * @param {number} semitones Semitonos a desplazar (-11 a +11).
   */
  transpose(semitones) {
    const wasPlaying = this.isPlaying.value;
    if (wasPlaying) this.stop();
    const clamped = Math.max(-11, Math.min(11, Math.round(Number(semitones) || 0)));
    this.transposeSemitones.set(clamped);
    const pr = this.practice.value;
    if (pr) {
      if (pr.type === 'harmony') {
        this._audio.loadTimeline(this.buildHarmonyTimeline());
      } else {
        const tl = this._abc.extractTimeline(null, this.transposedAbc.value, {
          instrument: pr.instruments[0] || 'guitarra',
          isBass: pr.instruments.includes('bajo'),
          timeSignature: pr.timeSignature
        });
        this._enrichTimelineWithHarmonyVoicings(tl);
        this._audio.loadTimeline(tl);
      }
    }
  }

  /**
   * Restaura la tonalidad original de la práctica.
   */
  resetTranspose() {
    this.transpose(0);
  }

  /**
   * Cambia la vista de notación (Pentagrama, Cifrado o Mixto).
   * @param {'pentagrama'|'cifrado'|'mixto'} mode Vista seleccionada.
   */
  setViewMode(mode) {
    if (['pentagrama', 'cifrado', 'diagramas', 'mixto'].includes(mode)) {
      this.viewMode.set(mode);
    }
  }

  /**
   * Ajusta el nivel de zoom de la partitura.
   * @param {number} nextZoom Factor de zoom (0.75 a 1.6).
   */
  setZoom(nextZoom) {
    const clamped = Math.max(0.75, Math.min(1.6, Math.round(Number(nextZoom) * 100) / 100));
    this.zoom.set(clamped);
  }

  /**
   * Configura el bucle por compás o rango de compases.
   * @param {{ enabled?: boolean, start?: number, end?: number }} cfg Configuración del bucle.
   */
  setLoop(cfg = {}) {
    const maxM = Math.max(1, this.measureCount.value);
    if (cfg.enabled !== undefined) this.loopEnabled.set(Boolean(cfg.enabled));
    if (cfg.start !== undefined) {
      const s = Math.max(1, Math.min(maxM, Number(cfg.start) || 1));
      this.loopStartMeasure.set(s);
      if (this.loopEndMeasure.value < s) this.loopEndMeasure.set(s);
    }
    if (cfg.end !== undefined) {
      const e = Math.max(this.loopStartMeasure.value, Math.min(maxM, Number(cfg.end) || maxM));
      this.loopEndMeasure.set(e);
    }
    this._syncAudioConfig();
  }

  /**
   * Configura la cantidad de compases de conteo previo (0, 1 o 2).
   * @param {number} measures Cantidad de compases.
   */
  setCountIn(measures) {
    const safe = Math.max(0, Math.min(2, Number(measures) || 0));
    this.countInMeasures.set(safe);
    this._syncAudioConfig();
  }

  /**
   * Selecciona el instrumento de síntesis (nylon, acústica, bajo eléctrico, bajo acústico).
   * @param {string} instrument Clave del instrumento.
   */
  setSynthInstrument(instrument) {
    this.synthInstrument.set(instrument);
    this._syncAudioConfig();
  }

  /**
   * Cambia el registro de escucha global ('real' | '+1oct') directamente desde el sheet del reproductor.
   * @param {'real'|'+1oct'} register Registro de escucha.
   */
  setListeningRegister(register) {
    this._appVm.updateSettings({ listeningRegister: register });
  }

  /**
   * Ajusta volúmenes independientes y persiste la mezcla propia de la práctica activa.
   * @param {{ melody?: number, chords?: number, bass?: number, metronome?: number }} volumes Volúmenes.
   */
  setVolumes(volumes = {}) {
    const safe = (v, prev) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : prev;
    };
    if (volumes.melody !== undefined) this.melodyVolume.set(safe(volumes.melody, this.melodyVolume.value));
    if (volumes.chords !== undefined) this.chordsVolume.set(safe(volumes.chords, this.chordsVolume.value));
    if (volumes.bass !== undefined) this.bassVolume.set(safe(volumes.bass, this.bassVolume.value));
    if (volumes.metronome !== undefined) this.metronomeVolume.set(safe(volumes.metronome, this.metronomeVolume.value));
    this._syncAudioConfig();
    this._persistCurrentMix();
  }

  /**
   * Activa o desactiva el acompañamiento reproducible de acordes y guarda en la mezcla de la práctica.
   * @param {boolean} enabled Nuevo estado.
   */
  setChordsEnabled(enabled) {
    this.chordsEnabled.set(Boolean(enabled));
    this._syncAudioConfig();
    this._persistCurrentMix();
  }

  /**
   * Activa o desactiva el metrónomo integrado y guarda en la mezcla de la práctica.
   * @param {boolean} enabled Nuevo estado.
   */
  setMetronomeEnabled(enabled) {
    this.metronomeEnabled.set(Boolean(enabled));
    this._syncAudioConfig();
    this._persistCurrentMix();
  }

  /**
   * Alterna la visualización de digitaciones anotadas sobre la partitura.
   */
  toggleFingerings() {
    this.showFingerings.set(!this.showFingerings.value);
  }

  /**
   * Alterna la visualización de funciones armónicas en bajo (R, 3, 5, 7, Crom).
   */
  toggleBassFunctions() {
    this.showBassFunctions.set(!this.showBassFunctions.value);
  }

  /**
   * Configura el entrenador automático de velocidad integrado al bucle del reproductor.
   * @param {{ enabled?: boolean, everyLoops?: number }} cfg Parámetros.
   */
  setSpeedTrainer(cfg = {}) {
    if (cfg.enabled !== undefined) this.speedTrainerEnabled.set(Boolean(cfg.enabled));
    if (cfg.everyLoops !== undefined) this.speedTrainerEveryLoops.set(Math.max(1, Math.min(16, Number(cfg.everyLoops))));
  }

  /**
   * Abre o cierra el bottom sheet / side sheet de ajustes avanzados del reproductor.
   * @param {boolean} open True para abrir.
   * @param {'mezcla'|'bucle'|'timbre'|'vista'} [tab] Pestaña a enfocar.
   */
  setSheetOpen(open, tab) {
    if (tab) this.activeSheetTab.set(tab);
    this.isSheetOpen.set(Boolean(open));
  }

  /**
   * Activa o desactiva el modo pantalla completa ("atril") dejando solo partitura y transporte.
   */
  toggleAtrilFullscreen() {
    this.isAtrilFullscreen.set(!this.isAtrilFullscreen.value);
  }

  /**
   * Marca o desmarca un objetivo pedagógico de la práctica activa.
   * @param {number} goalIndex Índice del objetivo.
   */
  async toggleGoal(goalIndex) {
    const pr = this.practice.value;
    if (!pr) return;
    await this._appVm.toggleGoalChecked(pr.id, goalIndex);
  }

  /**
   * Registra una vuelta manual con snackbar, opción "Deshacer", retroalimentación háptica
   * y sugerencia de subir BPM tras 3 vueltas limpias.
   * @returns {Promise<void>}
   */
  async logManualRepetition() {
    const pr = this.practice.value;
    if (!pr) return;
    const prevSessionReps = this.sessionRepetitions.value;
    this.sessionRepetitions.set(prevSessionReps + 1);
    this._cleanRepsAtCurrentBpm += 1;

    const prevProgressSnapshot = await this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: Math.max(15, this._pendingStudySeconds)
    });
    this._pendingStudySeconds = 0;

    const reached = this.bpm.value >= pr.tempo.target;
    this._appVm.triggerHaptic(reached ? [20, 40, 30] : 16);

    // Si completó 3 vueltas limpias por debajo del objetivo, sugiere subir el BPM
    if (!reached && this._cleanRepsAtCurrentBpm >= 3) {
      const suggestedBpm = Math.min(pr.tempo.target, this.bpm.value + (pr.tempo.step || 5));
      this._cleanRepsAtCurrentBpm = 0;
      this._appVm.showSnackbar(`¡3 vueltas limpias a ${this.bpm.value} BPM! ¿Subimos a ${suggestedBpm} BPM?`, {
        actionLabel: `Subir a ${suggestedBpm}`,
        durationMs: 5500,
        onAction: () => this.setTempo(suggestedBpm)
      });
      return;
    }

    this._appVm.showSnackbar(
      reached
        ? `¡Objetivo alcanzado a ${this.bpm.value} BPM!`
        : `Vuelta registrada a ${this.bpm.value} BPM.`,
      {
        actionLabel: 'Deshacer',
        durationMs: 4800,
        onAction: async () => {
          this.sessionRepetitions.set(prevSessionReps);
          this._cleanRepsAtCurrentBpm = Math.max(0, this._cleanRepsAtCurrentBpm - 1);
          await this._appVm.replaceProgress(prevProgressSnapshot);
          this._appVm.showSnackbar('Registro deshecho.');
        }
      }
    );
  }

  /**
   * Duplica una práctica incluida como copia editable del usuario y abre el editor.
   * @returns {Promise<void>}
   */
  async duplicateAndEdit() {
    const pr = this.practice.value;
    if (!pr) return;
    const copy = pr.duplicateAsUser();
    await this._appVm.upsertUserPractice(copy);
    this._appVm.showSnackbar('Copia creada. Ya podés editarla libremente.');
    this._appVm.navigate(`#/editor/${encodeURIComponent(copy.id)}`);
  }

  /**
   * Abre el editor directamente si es práctica de usuario, o duplica y edita si es incluida.
   */
  editCurrent() {
    const pr = this.practice.value;
    if (!pr) return;
    if (pr.isReadOnly) {
      this.duplicateAndEdit();
    } else {
      this._appVm.navigate(`#/editor/${encodeURIComponent(pr.id)}`);
    }
  }

  /**
   * Exporta la práctica activa en JSON o .abc desde el menú superior de la pantalla de práctica.
   * @param {'json'|'abc'} [format='json'] Formato deseado.
   */
  exportCurrent(format = 'json') {
    const pr = this.practice.value;
    if (!pr || !this._io) return;
    if (format === 'abc') {
      const content = this._io.exportPracticeAbc(pr);
      this._io.triggerBrowserDownload(`${pr.id}.abc`, content, 'text/vnd.abc');
      this._appVm.showSnackbar('Partitura exportada en .abc.');
    } else {
      const content = this._io.exportPracticeJson(pr);
      this._io.triggerBrowserDownload(`${pr.id}.json`, content, 'application/json');
      this._appVm.showSnackbar('Práctica exportada en JSON.');
    }
  }

  /**
   * Maneja la finalización de una pasada completa o una vuelta del bucle.
   */
  _handlePassComplete() {
    const pr = this.practice.value;
    if (!pr) return;

    this._accumulateElapsedTime();
    const nextReps = this.sessionRepetitions.value + 1;
    this.sessionRepetitions.set(nextReps);

    const studySecs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;

    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: studySecs
    });

    if (
      this.loopEnabled.value &&
      this.speedTrainerEnabled.value &&
      nextReps % this.speedTrainerEveryLoops.value === 0 &&
      this.bpm.value < pr.tempo.target
    ) {
      const nextBpm = Math.min(pr.tempo.target, this.bpm.value + (pr.tempo.step || 5));
      this.setTempo(nextBpm);
      this._appVm.triggerHaptic(16);
      this._appVm.showSnackbar(`Entrenador de velocidad: subiendo a ${nextBpm} BPM`);
    }
  }

  /**
   * Acumula los segundos transcurridos desde que empezó el tramo actual de reproducción.
   */
  _accumulateElapsedTime() {
    if (this._playStartedAtMs !== null) {
      const elapsed = Math.floor((Date.now() - this._playStartedAtMs) / 1000);
      if (elapsed > 0) this._pendingStudySeconds += elapsed;
      this._playStartedAtMs = this.isPlaying.value ? Date.now() : null;
    }
  }

  /**
   * Guarda tiempo de estudio pendiente al detener si hubo al menos 5 segundos de práctica.
   */
  _flushStudyTime() {
    const pr = this.practice.value;
    if (!pr || this._pendingStudySeconds < 5) {
      this._pendingStudySeconds = 0;
      return;
    }
    const secs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;
    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 0,
      studySeconds: secs
    });
  }
}
