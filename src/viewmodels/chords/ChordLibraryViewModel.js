import { FLAT_NOTES, SHARP_NOTES } from '../../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../../core/Observable.js';
import { Chord } from '../../models/Chord.js';
import { createChordStudyPractice } from '../../services/PracticeFactoryService.js';

/**
 * Sub-ViewModel de la pestaña Biblioteca de Acordes (#/acordes/biblioteca).
 * Gestiona raíz, calidad, slash bass, filtros de digitación, agrupación por familia,
 * favoritos y creación de prácticas rápidas de un acorde.
 */
export class ChordLibraryViewModel {
  /**
   * Construye el sub-ViewModel de la Biblioteca inyectando los observables compartidos del hub.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({
    appVm,
    instrument,
    activeTuning,
    voicingGenerator,
    chordLibraryService,
    audioService,
    onOpenScaleForChord = null
  }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Observable compartido de instrumento activo. */
    this._instrument = instrument;
    /** ComputedObservable compartido con el Tuning activo. */
    this._activeTuning = activeTuning;
    /** Generador de voicings. */
    this._voicingGen = voicingGenerator;
    /** Servicio puro de búsqueda, filtrado y agrupación de voicings. */
    this._libraryService = chordLibraryService;
    /** Sintetizador de audio. */
    this._audio = audioService;
    /** Callback para saltar al módulo Escalas con la escala sugerida. */
    this._onOpenScaleForChord = onOpenScaleForChord;

    /** Raíz seleccionada en cifrado americano ('C'..'B'). */
    this.selectedRoot = new Observable('C');
    /** Preferencia de enarmonía en la botonera de raíces (true = sostenidos, false = bemoles). */
    this.preferSharps = new Observable(true);
    /** Calidad seleccionada ('', 'm', '7', 'maj7', 'm7', etc.). */
    this.selectedQuality = new Observable('');
    /** Bajo alternativo opcional (slash chord) o ''. */
    this.selectedBass = new Observable('');
    /** Filtro de tipo de voicing. */
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
    this.playMode = new Observable(instrument.value === 'bajo' ? 'block' : 'strum-down');
    /** Voicings adicionales generados por VoicingGenerator para el acorde actual. */
    this.generatedVoicings = new Observable([]);
    /** Índice del voicing seleccionado en el carrusel/grilla. */
    this.activeVoicingIndex = new Observable(0);

    /** Instancia Chord correspondiente a raíz + calidad + bajo seleccionados. */
    this.activeChord = new ComputedObservable(
      [this.selectedRoot, this.selectedQuality, this.selectedBass],
      () =>
        new Chord({
          root: this.selectedRoot.value,
          quality: this.selectedQuality.value,
          bass: this.selectedBass.value || null
        })
    );

    /** Lista combinada y filtrada de voicings (Mis acordes + curados + generados). */
    this.voicingsList = new ComputedObservable(
      [
        this.activeChord,
        this._instrument,
        this._activeTuning,
        this.voicingTypeFilter,
        this.inversionFilter,
        this.fretRangeFilter,
        this.generatedVoicings,
        appVm.progress
      ],
      () =>
        this._libraryService.computeFilteredVoicings({
          symbol: this.activeChord.value.americanSymbol,
          tuning: this._activeTuning.value,
          customChords: this._appVm.progress.value.customChords || [],
          generatedVoicings: this.generatedVoicings.value,
          voicingGenerator: this._voicingGen,
          typeFilter: this.voicingTypeFilter.value,
          inversionFilter: this.inversionFilter.value,
          fretRangeFilter: this.fretRangeFilter.value
        })
    );
  }

  /**
   * Restablece filtros y sugerencias generadas cuando cambia el instrumento o la afinación.
   * @param {{ resetFilters?: boolean, defaultPlayMode?: string }} [opts={}] Opciones de reseteo.
   */
  resetForInstrumentChange({ resetFilters = false, defaultPlayMode = null } = {}) {
    if (defaultPlayMode) this.playMode.set(defaultPlayMode);
    if (resetFilters) this.voicingTypeFilter.set('todos');
    this.generatedVoicings.set([]);
    this.activeVoicingIndex.set(0);
  }

  /**
   * Selecciona raíz, calidad o bajo del acorde activo.
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
   * Parsea un símbolo americano completo (ej. "Dm7", "C/E") y lo carga en la Biblioteca.
   * @param {string} chordSymbol Símbolo americano.
   */
  selectChordBySymbol(chordSymbol) {
    try {
      const parsed = Chord.parse(chordSymbol);
      this.selectChord({
        root: parsed.root,
        quality: parsed.quality.id,
        bass: parsed.bass || ''
      });
    } catch {
      // Mantiene selección previa ante símbolo inválido
    }
  }

  /**
   * Abre el módulo Escalas precargado con la escala más compatible para el acorde activo.
   */
  openCompatibleScale() {
    const sym = this.activeChord.value?.americanSymbol || 'C';
    if (typeof this._onOpenScaleForChord === 'function') {
      this._onOpenScaleForChord(sym);
    } else {
      this._appVm.navigate('#/escalas/explorador');
    }
  }

  /**
   * Genera digitaciones adicionales mediante `ChordLibraryService`.
   */
  generateSuggestedVoicings() {
    const symbol = this.activeChord.value.americanSymbol;
    const all = this._libraryService.generateSuggestedVoicings(
      this._voicingGen,
      symbol,
      this._activeTuning.value
    );
    this.generatedVoicings.set(all);
    this._appVm.showSnackbar(
      all.length > 0
        ? `Se generaron ${all.length} digitaciones sugeridas para ${symbol}.`
        : 'No se encontraron digitaciones adicionales para ese filtro.'
    );
  }

  /**
   * Devuelve las 12 raíces cromáticas según la preferencia de enarmonía activa.
   * @returns {string[]} Raíces cromáticas.
   */
  getRootChoices() {
    return this.preferSharps.value ? [...SHARP_NOTES] : [...FLAT_NOTES];
  }

  /**
   * Alterna la preferencia de enarmonía (♯/♭) convirtiendo la raíz activa si es alterada.
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
   * Agrupa los voicings filtrados por familia pedagógica y posición en el diapasón.
   * @returns {Array<{ id: string, label: string, items: Array<{ voicing: object, flatIndex: number }> }>} Grupos.
   */
  getGroupedVoicings() {
    return this._libraryService.groupVoicingsByFamily(
      this.voicingsList.value,
      this._instrument.value === 'bajo'
    );
  }

  /**
   * Reproduce un voicing exacto respetando PitchPolicy y el modo elegido.
   * @param {import('../../models/Voicing.js').Voicing} voicing Voicing a sonar.
   * @param {string} [overrideMode] Modo de ejecución opcional.
   */
  playVoicing(voicing, overrideMode) {
    if (!voicing) return;
    const tuning = this._activeTuning.value;
    const isBass = this._instrument.value === 'bajo';
    const synthInst = isBass
      ? 'electric-bass'
      : this._instrument.value === 'guitarra-clasica'
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
   * Reproduce un arpegio con las notas del acorde indicado.
   * @param {string} [chordSymbol] Acorde opcional.
   */
  playChordArpeggio(chordSymbol = this.activeChord.value.americanSymbol) {
    const c = Chord.parse(chordSymbol);
    const isBass = this._instrument.value === 'bajo';
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
   * Marca o desmarca el acorde actual como favorito delegando en `ProgressStore`.
   * @returns {Promise<void>}
   */
  async toggleFavoriteActiveChord() {
    const symbol = this.activeChord.value.americanSymbol;
    const isFav = await this._appVm.toggleFavoriteChord(symbol);
    this._appVm.showSnackbar(isFav ? `${symbol} guardado en favoritos.` : `${symbol} quitado de favoritos.`);
  }

  /**
   * Crea una práctica rápida de armonía con el acorde/voicing activo y la abre en el Reproductor.
   * @param {import('../../models/Voicing.js').Voicing|null} voicing Voicing elegido.
   */
  async practiceActiveChord(voicing) {
    const pr = createChordStudyPractice({
      chord: this.activeChord.value,
      instrument: this._instrument.value,
      voicing,
      tuning: this._activeTuning.value
    });
    await this._appVm.upsertUserPractice(pr);
    this._appVm.navigate(`#/practica/${encodeURIComponent(pr.id)}`);
  }

  /**
   * Libera los `ComputedObservable` de la Biblioteca.
   */
  dispose() {
    this.voicingsList.dispose();
    this.activeChord.dispose();
  }
}
