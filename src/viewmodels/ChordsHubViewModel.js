import { ALL_KEYS, FLAT_NOTES, SHARP_NOTES } from '../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../core/Observable.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { ChordQuality } from '../models/ChordQuality.js';
import { Practice, generatePracticeId } from '../models/Practice.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';

/**
 * ViewModel del módulo Acordes y Armonía (#/acordes).
 * Centraliza el estado reactivo y comandos de las 4 herramientas armónicas:
 * Biblioteca de acordes (guitarra, clásica y acordes al estilo del bajo),
 * Explorador de campo armónico (4 modos),
 * Entrenador de cambios / Conducción de voces / Inversiones (100 % editables, sin secuencias fijas)
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

    // --- Estado compartido de instrumento y afinación ---
    const initialInst = appVm.settings.value.defaultInstrument || 'guitarra';
    /** Instrumento activo en todo el módulo ('guitarra' | 'guitarra-clasica' | 'bajo'). */
    this.instrument = new Observable(initialInst);
    /** ID de afinación activa (Tuning). */
    this.tuningId = new Observable(initialInst === 'bajo' ? 'bass-4-standard' : 'guitar-standard');

    // --- Estado Biblioteca de Acordes ---
    /** Raíz seleccionada en cifrado americano ('C'..'B'). */
    this.selectedRoot = new Observable('C');
    /** Preferencia de enarmonía en la botonera de raíces (true = sostenidos C#, D#...; false = bemoles Db, Eb...). */
    this.preferSharps = new Observable(true);
    /** Calidad seleccionada ('', 'm', '7', 'maj7', 'm7', etc.). */
    this.selectedQuality = new Observable('');
    /** Bajo alternativo opcional (slash chord) o ''. */
    this.selectedBass = new Observable('');
    /** Filtro de tipo de voicing ('todos' | 'abierto' | 'cejilla' | 'triada' | 'drop2' | 'drop3' | 'shell' | 'decima' | 'guias' | 'inversion' | 'sugerido'). */
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
    /** Modo de reproducción al tocar el diagrama (en bajo arranca en bloque/acorde pulsado). */
    this.playMode = new Observable(initialInst === 'bajo' ? 'block' : 'strum-down');
    /** Voicings adicionales generados por VoicingGenerator para el acorde actual. */
    this.generatedVoicings = new Observable([]);
    /** Índice del voicing seleccionado en el carrusel. */
    this.activeVoicingIndex = new Observable(0);

    // --- Estado Explorador de Campo Armónico ---
    /** Tonalidad del campo armónico. */
    this.fieldKey = new Observable('C');
    /** Modo del campo armónico ('major' | 'minor' | 'harmonic-minor' | 'melodic-minor'). */
    this.fieldMode = new Observable('major');
    /** Mostrar acordes de séptima en lugar de tríadas. */
    this.fieldUseSevenths = new Observable(false);
    /** Progresión que el usuario arma tocando/reordenando grados. */
    this.builderChords = new Observable(['C', 'Am', 'F', 'G']);

    // --- Estado Entrenador de Cambios (100 % editable) ---
    /** Secuencia editable de acordes del entrenador de cambios. */
    this.trainerChords = new Observable(['G', 'C']);
    /** Índice de variante de voicing elegido por posición del entrenador ({ [slotIdx]: voicingIdx }). */
    this.trainerVoicingIndices = new Observable({});
    /** BPM del entrenador de cambios. */
    this.trainerBpm = new Observable(60);
    /** Pulsos entre cada cambio de acorde (1, 2, 3, 4 u 8). */
    this.trainerBeatsPerChange = new Observable(4);
    /** Reproducir el acorde de guía en el tiempo 1 de cada cambio. */
    this.trainerAudioCue = new Observable(true);
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

    // --- Estado Conducción de Voces (100 % editable) ---
    /** Secuencia editable de acordes para calcular conducción de voces. */
    this.voiceLeadingChords = new Observable(['Dm7', 'G7', 'Cmaj7', 'A7']);
    /** Zona preferida del diapasón ('libre' | 'abierto' | 'medio' | 'agudo'). */
    this.voiceLeadingZone = new Observable('libre');
    /** Estilo o juego de cuerdas para la conducción ('auto' | '321' | '432' | '5432' | 'shell' | 'decima' | 'triadas-agudas' | 'guias'). */
    this.voiceLeadingStyle = new Observable('auto');
    /** Resultado de conducción de voces calculado para voiceLeadingChords. */
    this.voiceLedSequence = new Observable([]);

    // --- Estado Inversiones por el mango (100 % editable) ---
    /** Raíz seleccionada en la herramienta de inversiones por el mango. */
    this.inversionRoot = new Observable('C');
    /** Calidad seleccionada en la herramienta de inversiones por el mango. */
    this.inversionQuality = new Observable('');
    /** Juego de cuerdas / estilo para el recorrido de inversiones (adaptado a guitarra o bajo). */
    this.inversionStringSet = new Observable(initialInst === 'bajo' ? 'bass-triadas' : '432');

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

    /** Instancia Chord correspondiente a raíz + calidad + bajo seleccionados en la Biblioteca. */
    this.activeChord = new ComputedObservable(
      [this.selectedRoot, this.selectedQuality, this.selectedBass],
      () => new Chord({
        root: this.selectedRoot.value,
        quality: this.selectedQuality.value,
        bass: this.selectedBass.value || null
      })
    );

    /** Instancia Chord correspondiente a la herramienta de Inversiones por el mango. */
    this.inversionChord = new ComputedObservable(
      [this.inversionRoot, this.inversionQuality],
      () => new Chord({
        root: this.inversionRoot.value,
        quality: this.inversionQuality.value
      })
    );

    /** Lista combinada y filtrada de voicings (Mis acordes + curados + generados) para el acorde activo. */
    this.voicingsList = new ComputedObservable(
      [
        this.activeChord,
        this.instrument,
        this.activeTuning,
        this.voicingTypeFilter,
        this.inversionFilter,
        this.fretRangeFilter,
        this.generatedVoicings,
        appVm.progress
      ],
      () => this._computeVoicingsList()
    );

    /** Campo armónico de 7 grados calculado reactivamente. */
    this.diatonicField = new ComputedObservable(
      [this.fieldKey, this.fieldMode, this.fieldUseSevenths, this.instrument, this.activeTuning],
      () => {
        const tuning = this.activeTuning.value;
        return this._harmony.getDiatonicField(
          this.fieldKey.value,
          this.fieldMode.value,
          this.fieldUseSevenths.value,
          tuning.instrument,
          tuning
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
   * Selecciona el instrumento activo en todo el módulo y ajusta afinación, modo de reproducción y juegos de cuerdas.
   * @param {'guitarra'|'guitarra-clasica'|'bajo'} inst Instrumento.
   */
  setInstrument(inst) {
    const prevWasBass = this.instrument.value === 'bajo';
    const nextIsBass = inst === 'bajo';
    this.instrument.set(inst);

    if (nextIsBass) {
      if (!this.tuningId.value.startsWith('bass-')) this.tuningId.set('bass-4-standard');
      if (!prevWasBass) {
        this.playMode.set('block');
        this.voicingTypeFilter.set('todos');
        this.voiceLeadingStyle.set('auto');
        this.inversionStringSet.set('bass-triadas');
      }
    } else {
      if (this.tuningId.value.startsWith('bass-')) this.tuningId.set('guitar-standard');
      if (prevWasBass) {
        this.playMode.set(inst === 'guitarra-clasica' ? 'arpeggio-pima' : 'strum-down');
        this.voicingTypeFilter.set('todos');
        this.voiceLeadingStyle.set('auto');
        this.inversionStringSet.set('432');
      }
    }

    this.trainerVoicingIndices.set({});
    this.generatedVoicings.set([]);
    this.activeVoicingIndex.set(0);
    this.recomputeVoiceLeading();
  }

  /**
   * Cambia la afinación activa (permite Drop D, DADGAD, Open G, bajo 4 y 5 cuerdas, etc.).
   * @param {string} tuningId Clave en PRESET_TUNINGS.
   */
  setTuning(tuningId) {
    this.tuningId.set(tuningId);
    this.trainerVoicingIndices.set({});
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
   * Ejecuta el VoicingGenerator puro para sugerir digitaciones adicionales (incluyendo acordes idiomáticos de bajo)
   * para el acorde y afinación actuales.
   */
  generateSuggestedVoicings() {
    const symbol = this.activeChord.value.americanSymbol;
    const tuning = this.activeTuning.value;
    const isBass = tuning.instrument === 'bass';
    const pad = isBass ? Math.max(0, tuning.stringCount - 4) : 0;

    const sets = isBass
      ? [
          { stringSet: [pad + 0, pad + 3], allowSkippedStrings: true, allowRootless: false },
          { stringSet: [pad + 0, pad + 2, pad + 3], allowSkippedStrings: true, allowRootless: false },
          { stringSet: [pad + 1, pad + 2, pad + 3], allowSkippedStrings: true, allowRootless: false },
          { stringSet: [pad + 2, pad + 3], allowSkippedStrings: true, allowRootless: true },
          { stringSet: [pad + 0, pad + 1, pad + 2, pad + 3], allowSkippedStrings: true, allowRootless: false }
        ]
      : [
          { stringSet: [1, 2, 3, 4], allowSkippedStrings: false },
          { stringSet: [2, 3, 4, 5], allowSkippedStrings: false },
          { stringSet: [2, 3, 4], allowSkippedStrings: false },
          { stringSet: [3, 4, 5], allowSkippedStrings: false }
        ];

    const all = [];
    const seen = new Set();
    for (const cfg of sets) {
      try {
        const list = this._voicingGen.generate(symbol, {
          tuning,
          stringSet: cfg.stringSet,
          allowSkippedStrings: cfg.allowSkippedStrings,
          allowRootless: cfg.allowRootless,
          maxSpan: 4,
          maxFret: isBass ? 17 : 12,
          limit: 6
        });
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
   * Devuelve las 12 raíces cromáticas según la preferencia de enarmonía activa (sostenidos o bemoles).
   * @returns {string[]} Lista de 12 raíces.
   */
  getRootChoices() {
    return this.preferSharps.value ? [...SHARP_NOTES] : [...FLAT_NOTES];
  }

  /**
   * Alterna la preferencia de enarmonía (♯ sostenidos / ♭ bemoles) convirtiendo la raíz activa si es alterada.
   * @param {boolean} useSharps True para sostenidos, false para bemoles.
   */
  setPreferSharps(useSharps) {
    this.preferSharps.set(Boolean(useSharps));
    const current = this.activeChord.value;
    const targetList = useSharps ? SHARP_NOTES : FLAT_NOTES;
    const mapped = targetList[current.rootPc];
    if (mapped && mapped !== this.selectedRoot.value) {
      this.selectedRoot.set(mapped);
    }
  }

  /**
   * Agrupa los voicings filtrados por familia pedagógica (Mis acordes, Abiertas, Cejillas/CAGED,
   * Tríadas, Drop 2/3, Shell, Décimas/Bajo, Extensiones, Sugeridas) ordenados por posición en el mango.
   * @returns {Array<{ id: string, label: string, items: Array<{ voicing: Voicing, flatIndex: number }> }>} Grupos ordenados.
   */
  getGroupedVoicings() {
    const list = this.voicingsList.value;
    const isBass = this.instrument.value === 'bajo';
    const order = isBass
      ? [
          { id: 'propio', label: 'Mis acordes' },
          { id: 'decima', label: 'Décimas y díadas' },
          { id: 'shell', label: 'Shell voicings' },
          { id: 'triada', label: 'Tríadas (abiertas y agudas)' },
          { id: 'guias', label: 'Notas guía (3.ª y 7.ª)' },
          { id: 'extension', label: 'Extensiones y color' },
          { id: 'sugerido', label: 'Sugeridas' }
        ]
      : [
          { id: 'propio', label: 'Mis acordes' },
          { id: 'abierto', label: 'Abiertas' },
          { id: 'cejilla', label: 'Cejillas / CAGED' },
          { id: 'triada', label: 'Tríadas' },
          { id: 'drop2', label: 'Drop 2 / Drop 3' },
          { id: 'shell', label: 'Shell' },
          { id: 'extension', label: 'Extensiones y alteradas' },
          { id: 'sugerido', label: 'Sugeridas' }
        ];

    const classify = (v) => {
      const tags = v.tags || [];
      if (tags.includes('propio')) return 'propio';
      if (v.suggested) return 'sugerido';
      if (isBass) {
        if (tags.includes('decima') || tags.includes('power')) return 'decima';
        if (tags.includes('shell')) return 'shell';
        if (tags.includes('guias')) return 'guias';
        if (tags.includes('triada') || tags.includes('inversion')) return 'triada';
        if (tags.includes('extension')) return 'extension';
        return 'decima';
      }
      if (tags.includes('abierto')) return 'abierto';
      if (tags.includes('cejilla') || tags.includes('CAGED')) return 'cejilla';
      if (tags.includes('triada')) return 'triada';
      if (tags.includes('drop2') || tags.includes('drop3')) return 'drop2';
      if (tags.includes('shell')) return 'shell';
      if (tags.includes('extension') || tags.includes('alterado') || tags.includes('power')) return 'extension';
      return 'cejilla';
    };

    const buckets = new Map(order.map((g) => [g.id, []]));
    list.forEach((v, flatIndex) => {
      const key = classify(v);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ voicing: v, flatIndex });
    });

    const minFretOf = (v) => {
      const active = v.frets.filter((f) => f !== null);
      return active.length > 0 ? Math.min(...active) : 0;
    };

    const groups = [];
    for (const spec of order) {
      const items = buckets.get(spec.id) || [];
      if (items.length === 0) continue;
      items.sort((a, b) => a.voicing.baseFret - b.voicing.baseFret || minFretOf(a.voicing) - minFretOf(b.voicing));
      groups.push({ id: spec.id, label: spec.label, items });
    }
    return groups;
  }

  /**
   * Combina Mis acordes + voicings curados + generados aplicando filtros de tipo, inversión y rango de trastes,
   * ordenados ascendentemente por posición en el diapasón.
   * @returns {import('../models/Voicing.js').Voicing[]} Lista filtrada de voicings.
   */
  _computeVoicingsList() {
    const symbol = this.activeChord.value.americanSymbol;
    const tuning = this.activeTuning.value;
    const fam = tuning.instrument;
    const curated = getCuratedVoicingsForChord(symbol, fam, tuning);

    // Incluye "Mis acordes" guardados por el usuario que coincidan con este acorde e instrumento
    const userSaved = (this._appVm.progress.value.customChords || [])
      .filter((raw) => raw.instrument === fam && raw.chord === symbol)
      .map((raw) => new Voicing({ ...raw, tags: [...new Set([...(raw.tags || []), 'propio'])] }));

    const seen = new Set();
    const combined = [];
    const addIfUnique = (v) => {
      const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
      if (seen.has(sig)) return;
      seen.add(sig);
      combined.push(v);
    };

    userSaved.forEach(addIfUnique);
    curated.forEach(addIfUnique);
    this.generatedVoicings.value.forEach(addIfUnique);

    // Si no hubo ningún voicing curado para esa afinación/slash, genera sugerencias automáticamente
    if (combined.length === 0) {
      try {
        const pad = fam === 'bass' ? Math.max(0, tuning.stringCount - 4) : 0;
        const autoSets = fam === 'bass'
          ? [[pad + 0, pad + 2, pad + 3], [pad + 1, pad + 2, pad + 3], [pad + 0, pad + 3]]
          : [[1, 2, 3, 4], [2, 3, 4]];
        for (const autoSet of autoSets) {
          const auto = this._voicingGen.generate(symbol, {
            tuning,
            stringSet: autoSet,
            allowSkippedStrings: fam === 'bass',
            maxFret: fam === 'bass' ? 17 : 12,
            limit: 6
          });
          for (const v of auto) {
            const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
            if (!seen.has(sig)) {
              seen.add(sig);
              combined.push(v);
            }
          }
          if (combined.length >= 6) break;
        }
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
   * Reproduce un voicing exacto respetando PitchPolicy y el modo elegido (bloque/rasgueo/arpegio).
   * En bajo respeta el modo elegido por el usuario (por defecto bloque simultáneo para acordes de bajo).
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
      mode: overrideMode || this.playMode.value,
      instrument: synthInst,
      tuning,
      duration: 1.7
    });
  }

  /**
   * Reproduce un arpegio con las notas del acorde activo.
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
      comping: inst === 'guitarra-clasica' ? 'arpegio-pima' : inst === 'bajo' ? 'bloque' : 'negras-abajo',
      customVoicings: voicing?.suggested ? [voicing.toJSON()] : [],
      goals: ['Que todas las cuerdas suenen limpias', 'Armar la forma de memoria sin mirar el mango'],
      notes: `Creada desde la Biblioteca de Acordes (${voicing ? voicing.toAccessibleDescription(this.activeTuning.value) : chord.americanSymbol}).`,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
  }

  // --- Comandos del Explorador de Campo Armónico ---

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
  }

  /**
   * Aplica un atajo clásico (I-IV-V, I-vi-IV-V, ii-V-I, blues-12, i-iv-V, andaluza) en la tonalidad actual.
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
   * Envía la progresión armada en Campo Armónico a Conducción de voces y abre la pestaña Cambios y voces.
   */
  loadBuilderIntoVoiceLeading() {
    this.voiceLeadingChords.set([...this.builderChords.value]);
    this.recomputeVoiceLeading();
    this.setActiveTab('cambios');
  }

  /**
   * Envía la progresión armada en Campo Armónico al Entrenador de Cambios y abre la pestaña Cambios y voces.
   */
  loadBuilderIntoTrainer() {
    this.stopChangeTrainer();
    const list = this.builderChords.value.length >= 2 ? [...this.builderChords.value] : ['C', 'G'];
    this.trainerChords.set(list);
    this.trainerVoicingIndices.set({});
    this.trainerStepIndex.set(0);
    this.setActiveTab('cambios');
  }

  /**
   * Reproduce una lista de acordes o la progresión armada usando los voicings reales del instrumento activo.
   * @param {boolean} [useVoiceLed=false] Si true reproduce la versión optimizada de conducción de voces.
   */
  playBuilderProgression(useVoiceLed = false) {
    const tuning = this.activeTuning.value;
    const fam = tuning.instrument;
    const synthInst = fam === 'bass'
      ? 'electric-bass'
      : this.instrument.value === 'guitarra-clasica'
        ? 'nylon-guitar'
        : 'acoustic-guitar';

    const seq = useVoiceLed && this.voiceLedSequence.value.length > 0
      ? this.voiceLedSequence.value.map((step) => step.voicing.getMidiNotes(tuning))
      : this.builderChords.value.map((sym) => {
          const list = getCuratedVoicingsForChord(sym, fam, tuning);
          if (list[0]) return list[0].getMidiNotes(tuning);
          const c = Chord.parse(sym);
          return c.quality.intervals.map((iv) => (fam === 'bass' ? 40 : 48) + c.rootPc + iv);
        });
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(seq, {
      stepMs: 900,
      mode: fam === 'bass' ? 'block' : 'strum-down',
      instrument: synthInst
    });
  }

  /**
   * Guarda una progresión (del campo armónico, conducción o entrenador) como práctica editable de armonía.
   * @param {{ title?: string, chords?: string[], voiceLed?: Array<object>, category?: string, notes?: string }} [opts={}] Opciones.
   * @returns {Promise<Practice>} Práctica creada.
   */
  async saveBuilderAsPractice(opts = {}) {
    const chords = opts.chords || this.builderChords.value;
    const inst = this.instrument.value;
    const key = this.fieldKey.value;
    const title = opts.title || `Progresión ${chords.slice(0, 4).join(' – ')} (${key})`;
    const voiceLed = opts.voiceLed || this._voicingGen.findVoiceLedProgression(chords, this.activeTuning.value, this.activeTuning.value.instrument);

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
      category: opts.category || 'campo-armonico',
      level: 2,
      tags: ['armonía', key],
      key,
      timeSignature: '4/4',
      tempo: { start: 65, target: 105, step: 5 },
      progression,
      comping: inst === 'guitarra-clasica' ? 'arpegio-pima' : inst === 'bajo' ? 'bloque' : 'negras-abajo',
      customVoicings,
      goals: ['Reconocer la función de cada acorde', 'Cambiar sin cortar el pulso'],
      notes: opts.notes || 'Creada desde el módulo de Acordes y Armonía.',
      origin: 'user',
      createdAt: new Date().toISOString()
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.showSnackbar(`Práctica "${pr.title}" guardada.`);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
    return pr;
  }

  // --- Entrenador de Cambios (100 % editable) ---

  /**
   * Devuelve todos los voicings disponibles (curados + respaldo generado) para un acorde del entrenador.
   * @param {string} chordSymbol Símbolo americano.
   * @returns {import('../models/Voicing.js').Voicing[]} Lista de voicings utilizables.
   */
  getTrainerSlotVoicings(chordSymbol) {
    const tuning = this.activeTuning.value;
    const fam = tuning.instrument;
    const curated = getCuratedVoicingsForChord(chordSymbol, fam, tuning);
    if (curated.length > 0) return curated;
    try {
      const pad = fam === 'bass' ? Math.max(0, tuning.stringCount - 4) : 0;
      const set = fam === 'bass' ? [pad + 0, pad + 2, pad + 3] : [1, 2, 3, 4];
      return this._voicingGen.generate(chordSymbol, {
        tuning,
        stringSet: set,
        allowSkippedStrings: fam === 'bass',
        maxFret: fam === 'bass' ? 17 : 12,
        limit: 4
      });
    } catch {
      return [];
    }
  }

  /**
   * Devuelve el voicing actualmente seleccionado para un slot concreto del Entrenador de Cambios.
   * @param {number} slotIndex Índice en trainerChords.
   * @returns {import('../models/Voicing.js').Voicing|null} Voicing elegido.
   */
  getActiveTrainerVoicing(slotIndex) {
    const chords = this.trainerChords.value;
    const sym = chords[slotIndex];
    if (!sym) return null;
    const list = this.getTrainerSlotVoicings(sym);
    if (list.length === 0) return null;
    const chosenIdx = (this.trainerVoicingIndices.value[slotIndex] || 0) % list.length;
    return list[chosenIdx];
  }

  /**
   * Cambia a la siguiente digitación disponible para un acorde del Entrenador de Cambios.
   * @param {number} slotIndex Índice en trainerChords.
   */
  cycleTrainerSlotVoicing(slotIndex) {
    const sym = this.trainerChords.value[slotIndex];
    if (!sym) return;
    const list = this.getTrainerSlotVoicings(sym);
    if (list.length <= 1) return;
    const map = { ...this.trainerVoicingIndices.value };
    map[slotIndex] = ((map[slotIndex] || 0) + 1) % list.length;
    this.trainerVoicingIndices.set(map, true);
    this.playVoicing(list[map[slotIndex]]);
  }

  /**
   * Agrega un acorde personalizado a la secuencia del Entrenador de Cambios.
   * @param {string} chordSymbol Acorde americano (ej. "Bm7", "C/E", "Fmaj7").
   */
  addTrainerChord(chordSymbol) {
    if (!chordSymbol || this.trainerChords.value.length >= 12) return;
    this.stopChangeTrainer();
    this.trainerChords.set([...this.trainerChords.value, chordSymbol]);
  }

  /**
   * Reordena o quita un acorde del Entrenador de Cambios (conservando mínimo 2 acordes).
   * @param {number} index Índice del acorde.
   * @param {'left'|'right'|'remove'} action Acción.
   */
  editTrainerChord(index, action) {
    const list = [...this.trainerChords.value];
    if (action === 'remove' && list.length > 2) {
      this.stopChangeTrainer();
      list.splice(index, 1);
      this.trainerVoicingIndices.set({});
      this.trainerStepIndex.set(0);
    } else if (action === 'left' && index > 0) {
      this.stopChangeTrainer();
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
      this.trainerVoicingIndices.set({});
    } else if (action === 'right' && index < list.length - 1) {
      this.stopChangeTrainer();
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
      this.trainerVoicingIndices.set({});
    }
    this.trainerChords.set(list);
  }

  /**
   * Reemplaza la secuencia del entrenador con una secuencia diatónica aleatoria (sin secuencias fijas).
   * @param {object} [opts={}] Tonalidad, modo, séptimas y cantidad de acordes.
   */
  randomizeTrainerChords(opts = {}) {
    this.stopChangeTrainer();
    const key = opts.key || ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const mode = opts.mode || (Math.random() > 0.35 ? 'major' : 'minor');
    const useSevenths = opts.useSevenths !== undefined ? opts.useSevenths : Math.random() > 0.5;
    const length = opts.length || 3;
    const seq = this._harmony.generateRandomDiatonicSequence({ key, mode, useSevenths, length });
    this.trainerChords.set(seq);
    this.trainerVoicingIndices.set({});
    this.trainerStepIndex.set(0);
    this._appVm.showSnackbar(`Nueva secuencia aleatoria en ${key}: ${seq.join(' – ')}`);
  }

  /**
   * Carga los acordes favoritos del usuario en el Entrenador de Cambios (requiere al menos 2).
   */
  loadFavoritesIntoTrainer() {
    const favs = this._appVm.progress.value.favoriteChords || [];
    if (favs.length < 2) {
      this._appVm.showSnackbar('Marcá al menos 2 acordes como favoritos en la Biblioteca para practicarlos acá.');
      return;
    }
    this.stopChangeTrainer();
    this.trainerChords.set(favs.slice(0, 8));
    this.trainerVoicingIndices.set({});
    this.trainerStepIndex.set(0);
  }

  // --- Conducción de voces (100 % editable) ---

  /**
   * Recalcula la secuencia óptima de conducción de voces para `voiceLeadingChords`
   * respetando el instrumento, afinación, zona del mango y estilo elegidos.
   */
  recomputeVoiceLeading() {
    const tuning = this.activeTuning.value;
    const result = this._voicingGen.findVoiceLedProgression(
      this.voiceLeadingChords.value,
      tuning,
      tuning.instrument,
      {
        fretZone: this.voiceLeadingZone.value,
        style: this.voiceLeadingStyle.value
      }
    );
    this.voiceLedSequence.set(result, true);
  }

  /**
   * Agrega un acorde a la progresión editable de Conducción de voces.
   * @param {string} chordSymbol Símbolo americano.
   */
  addVoiceLeadingChord(chordSymbol) {
    if (!chordSymbol || this.voiceLeadingChords.value.length >= 12) return;
    this.voiceLeadingChords.set([...this.voiceLeadingChords.value, chordSymbol]);
    this.recomputeVoiceLeading();
  }

  /**
   * Reordena o elimina un acorde de la progresión de Conducción de voces.
   * @param {number} index Índice.
   * @param {'left'|'right'|'remove'} action Acción.
   */
  editVoiceLeadingChord(index, action) {
    const list = [...this.voiceLeadingChords.value];
    if (action === 'remove' && list.length > 2) {
      list.splice(index, 1);
    } else if (action === 'left' && index > 0) {
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
    } else if (action === 'right' && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    }
    this.voiceLeadingChords.set(list);
    this.recomputeVoiceLeading();
  }

  /**
   * Reemplaza la progresión de Conducción de voces y recalcula al instante.
   * @param {string[]} chords Lista de acordes.
   */
  setVoiceLeadingChords(chords) {
    if (!Array.isArray(chords) || chords.length < 2) return;
    this.voiceLeadingChords.set([...chords]);
    this.recomputeVoiceLeading();
  }

  /**
   * Genera una progresión diatónica aleatoria en cualquier tonalidad para practicar conducción de voces.
   */
  randomizeVoiceLeadingChords() {
    const key = ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const modes = ['major', 'minor', 'harmonic-minor'];
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const useSevenths = Math.random() > 0.4;
    const seq = this._harmony.generateRandomDiatonicSequence({ key, mode, useSevenths, length: 4 });
    this.setVoiceLeadingChords(seq);
    this._appVm.showSnackbar(`Conducción aleatoria en ${key}: ${seq.join(' – ')}`);
  }

  /**
   * Cambia la zona del mango preferida para Conducción de voces y recalcula.
   * @param {'libre'|'abierto'|'medio'|'agudo'} zone Zona.
   */
  setVoiceLeadingZone(zone) {
    this.voiceLeadingZone.set(zone);
    this.recomputeVoiceLeading();
  }

  /**
   * Cambia el estilo/juego de cuerdas de Conducción de voces y recalcula.
   * @param {string} style Clave de estilo.
   */
  setVoiceLeadingStyle(style) {
    this.voiceLeadingStyle.set(style);
    this.recomputeVoiceLeading();
  }

  // --- Inversiones por el mango (100 % editable para guitarra y bajo) ---

  /**
   * Selecciona el acorde a explorar en la herramienta de Inversiones por el mango.
   * @param {{ root?: string, quality?: string }} patch Campos a cambiar.
   */
  selectInversionChord(patch = {}) {
    if (patch.root !== undefined) this.inversionRoot.set(patch.root);
    if (patch.quality !== undefined) this.inversionQuality.set(patch.quality);
  }

  /**
   * Elige un acorde aleatorio (raíz + tríada/séptima) para estudiar inversiones por todo el mango.
   */
  randomizeInversionChord() {
    const root = ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const qualities = ['', 'm', 'maj7', '7', 'm7', 'dim'];
    const quality = qualities[Math.floor(Math.random() * qualities.length)];
    this.selectInversionChord({ root, quality });
  }

  /**
   * Calcula todas las inversiones y posiciones ejecutables del acorde elegido subiendo por el diapasón,
   * adaptándose tanto a juegos de cuerdas de guitarra como a voicings idiomáticos de bajo (4 y 5 cuerdas).
   * @returns {import('../models/Voicing.js').Voicing[]} Lista ordenada ascendiendo por el mango.
   */
  getInversionWalkVoicings() {
    const chordObj = this.inversionChord.value;
    const symbol = chordObj.americanSymbol;
    const tuning = this.activeTuning.value;
    const isBass = tuning.instrument === 'bass';
    const pad = isBass ? Math.max(0, tuning.stringCount - 4) : 0;
    const mode = this.inversionStringSet.value;

    const candidates = [];
    const seen = new Set();
    const pushUnique = (v) => {
      if (!v) return;
      const sig = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
      if (seen.has(sig)) return;
      seen.add(sig);
      candidates.push(v);
    };

    if (isBass) {
      const curated = getCuratedVoicingsForChord(symbol, 'bass', tuning);
      const setsByMode = {
        'bass-triadas': {
          filter: (v) => v.tags.includes('triada') || v.tags.includes('inversion'),
          genSets: [[pad + 1, pad + 2, pad + 3]],
          minFret: 4,
          allowRootless: false
        },
        'bass-shells': {
          filter: (v) => v.tags.includes('shell') || v.tags.includes('guias'),
          genSets: [[pad + 0, pad + 2, pad + 3], [pad + 1, pad + 2, pad + 3]],
          minFret: 3,
          allowRootless: false
        },
        'bass-decimas': {
          filter: (v) => v.tags.includes('decima') || v.tags.includes('diada') || v.tags.includes('inversion'),
          genSets: [[pad + 0, pad + 3], [pad + 1, pad + 3], [pad + 0, pad + 1, pad + 3]],
          minFret: 0,
          allowRootless: false
        },
        'bass-4c': {
          filter: (v) => v.frets.filter((f) => f !== null).length >= 3,
          genSets: [[pad + 0, pad + 1, pad + 2, pad + 3], [pad + 1, pad + 2, pad + 3]],
          minFret: 4,
          allowRootless: false
        }
      };
      const cfg = setsByMode[mode] || setsByMode['bass-triadas'];
      curated.filter(cfg.filter).forEach(pushUnique);

      for (const sSet of cfg.genSets) {
        try {
          const gen = this._voicingGen.generate(symbol, {
            tuning,
            stringSet: sSet,
            allowSkippedStrings: true,
            allowRootless: cfg.allowRootless,
            minFret: cfg.minFret,
            maxFret: 17,
            maxSpan: 4,
            limit: 12
          });
          gen.forEach(pushUnique);
        } catch {
          // Ignora juego inválido
        }
      }
      if (candidates.length === 0) curated.forEach(pushUnique);
    } else {
      const setMap = {
        '321': [3, 4, 5],
        '432': [2, 3, 4],
        '543': [1, 2, 3],
        '4321': [2, 3, 4, 5],
        '5432': [1, 2, 3, 4]
      };
      const stringSet = setMap[mode] || [2, 3, 4];

      // Incluye curados que coincidan exactamente con ese juego de cuerdas
      const curated = getCuratedVoicingsForChord(symbol, 'guitar', tuning);
      for (const v of curated) {
        const activeStrings = [];
        v.frets.forEach((f, idx) => {
          if (f !== null) activeStrings.push(idx);
        });
        if (activeStrings.length === stringSet.length && activeStrings.every((s, i) => s === stringSet[i])) {
          pushUnique(v);
        }
      }

      try {
        const gen = this._voicingGen.generate(symbol, {
          tuning,
          stringSet,
          maxSpan: 4,
          maxFret: 15,
          limit: 16
        });
        gen.forEach(pushUnique);
      } catch {
        // Sin resultados
      }
    }

    // Conserva la forma más cómoda por (inversión + zona) y ordena ascendiendo por el diapasón
    const byInv = new Map();
    for (const v of candidates) {
      const inv = v.computeInversion(tuning);
      const bucket = `${inv}-${Math.floor(v.baseFret / 5)}`;
      if (!byInv.has(bucket)) byInv.set(bucket, v);
    }

    return [...byInv.values()]
      .sort((a, b) => {
        const minA = Math.min(...a.frets.filter((f) => f !== null));
        const minB = Math.min(...b.frets.filter((f) => f !== null));
        return minA - minB || a.computeInversion(tuning) - b.computeInversion(tuning);
      })
      .slice(0, 6);
  }

  /**
   * Reproduce en secuencia ascendente todas las inversiones visibles por el diapasón.
   */
  playInversionWalk() {
    const tuning = this.activeTuning.value;
    const isBass = tuning.instrument === 'bass';
    const synthInst = isBass
      ? 'electric-bass'
      : this.instrument.value === 'guitarra-clasica'
        ? 'nylon-guitar'
        : 'acoustic-guitar';
    const list = this.getInversionWalkVoicings();
    if (list.length === 0) return;
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(
      list.map((v) => v.getMidiNotes(tuning)),
      { stepMs: 950, mode: isBass ? 'block' : 'strum-down', instrument: synthInst }
    );
  }

  // --- Ejecución del Entrenador de Cambios (CPM) ---

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
      if (pos === 1 && this.trainerAudioCue.value) {
        const curV = this.getActiveTrainerVoicing(this.trainerStepIndex.value % this.trainerChords.value.length);
        if (curV) this.playVoicing(curV);
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
   * Lista todas las calidades de acorde disponibles para los selectores del módulo.
   * @returns {ChordQuality[]} Lista de calidades.
   */
  getAvailableQualities() {
    return ChordQuality.listAll();
  }
}
