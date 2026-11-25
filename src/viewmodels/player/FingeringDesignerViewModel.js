import { prefersFlats, transposeChordSymbol } from '../../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../../core/Observable.js';
import { findVoicingById } from '../../data/voicings.js';
import {
  FingeringDesignService,
  getTuningForVoicingInstrument,
  normalizeVoicingInstrument
} from '../../services/FingeringDesignService.js';
import { generatePianoVoicings } from '../../services/PianoVoicingService.js';
import { createFingeringDesignPractice } from '../../services/PracticeFactoryService.js';

/**
 * Sub-ViewModel especialista en diseño y personalización de digitaciones de acordes
 * dentro del Reproductor (instrumento de voicing, criterios multi-objetivo, overrides puntuales,
 * comparación lado a lado y guardado como práctica propia).
 */
export class FingeringDesignerViewModel {
  /**
   * Inicializa el diseñador de digitaciones inyectando los observables compartidos del reproductor.
   * @param {object} deps Dependencias inyectadas.
   * @param {import('../AppViewModel.js').AppViewModel} deps.appVm ViewModel global.
   * @param {import('../../services/AudioSynthService.js').AudioSynthService} deps.audioService Sintetizador.
   * @param {FingeringDesignService} [deps.fingeringDesignService] Servicio puro de diseño de digitaciones.
   * @param {Observable} deps.practice Observable con la práctica activa.
   * @param {Observable} deps.transposeSemitones Observable con semitonos de transposición.
   * @param {ComputedObservable} deps.transposedKey Observable ya declarado con la tonalidad transpuesta.
   * @param {import('./PlayerMixerViewModel.js').PlayerMixerViewModel} deps.mixer Sub-ViewModel del mezclador.
   * @param {Function} deps.onTimelineChanged Callback para refrescar la línea de tiempo armónica.
   */
  constructor({
    appVm,
    audioService,
    fingeringDesignService = null,
    practice,
    transposeSemitones,
    transposedKey,
    mixer,
    onTimelineChanged
  }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Servicio de audio para reproducir voicings individuales. */
    this._audio = audioService;
    /** Servicio especialista de diseño de digitaciones (inyectable). */
    this._designer = fingeringDesignService || new FingeringDesignService();
    /** Observable compartido con la práctica cargada. */
    this._practice = practice;
    /** Observable compartido con el desplazamiento de transposición. */
    this._transposeSemitones = transposeSemitones;
    /** Observable compartido con la tonalidad transpuesta (declarado previamente). */
    this._transposedKey = transposedKey;
    /** Referencia al mezclador para timbre y comping al sonar pasos. */
    this._mixer = mixer;
    /** Callback para refrescar la timeline armónica tras cambios de diseño. */
    this._onTimelineChanged = onTimelineChanged;

    /** Instrumento elegido para visualizar y diseñar digitaciones ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5'). */
    this.voicingInstrument = new Observable(
      normalizeVoicingInstrument(appVm.settings.value.defaultInstrument || 'guitarra')
    );
    /** Criterio activo de diseño ('original' o clave en FINGERING_DESIGN_CRITERIA). */
    this.fingeringDesignId = new Observable('conduccion-minima');
    /** Anulaciones manuales de voicing por índice de paso ({ [stepIndex]: Voicing }). */
    this.stepVoicingOverrides = new Observable({});

    /**
     * Plan completo de digitación resuelto (pasos, voicings, candidatos, justificación y métricas).
     * Incluye `this._transposedKey` explícitamente en sus dependencias para usar la enarmonía correcta al transponer.
     */
    this.fingeringDesignPlan = new ComputedObservable(
      [
        this._practice,
        this._transposeSemitones,
        this._transposedKey,
        this.voicingInstrument,
        this.fingeringDesignId,
        this.stepVoicingOverrides,
        this._appVm.progress
      ],
      () => this._computeDesignPlan()
    );

    /** Pasos armónicos resueltos con su acorde transpuesto y su Voicing exacto. */
    this.harmonySteps = new ComputedObservable(
      [this.fingeringDesignPlan],
      () => this.fingeringDesignPlan.value?.steps || []
    );
  }

  /**
   * Resuelve el instrumento de digitación inicial y el criterio recomendado al cargar una práctica.
   * @param {import('../../models/Practice.js').Practice|null} practice Práctica cargada.
   */
  loadForPractice(practice) {
    this.stepVoicingOverrides.set({});
    if (!practice) return;

    const preferredInst = normalizeVoicingInstrument(this._appVm.settings.value.defaultInstrument || 'guitarra');
    const resolvedVoicingInst = practice.instruments.includes(preferredInst)
      ? preferredInst
      : normalizeVoicingInstrument(practice.instruments[0] || 'guitarra');
    this.voicingInstrument.set(resolvedVoicingInst);

    const hasExplicitVoicings =
      Array.isArray(practice.progression) && practice.progression.some((s) => Boolean(s.voicingId));
    const recommendedDesign = this._designer.getRecommendedCriterion(resolvedVoicingInst, practice);
    this.fingeringDesignId.set(hasExplicitVoicings ? 'original' : recommendedDesign);
  }

  /**
   * Cambia el instrumento de digitación de acordes y recalcula diagramas, timbre y audio.
   * @param {'guitarra'|'guitarra-clasica'|'bajo'|'bajo-5'} inst Instrumento destino.
   */
  setVoicingInstrument(inst) {
    const norm = normalizeVoicingInstrument(inst);
    this.voicingInstrument.set(norm);
    this.stepVoicingOverrides.set({});

    const available = this.getAvailableFingeringCriteria();
    if (!available.some((c) => c.id === this.fingeringDesignId.value)) {
      this.fingeringDesignId.set(this._designer.getRecommendedCriterion(norm, this._practice.value));
    }

    this._mixer.applyTimbreForVoicingInstrument(norm);
    this._onTimelineChanged(true);
  }

  /**
   * Aplica un criterio de diseño de digitación distinto sobre la progresión activa.
   * @param {string} criterionId Identificador del criterio elegido.
   */
  setFingeringDesign(criterionId) {
    if (!criterionId) return;
    this.stepVoicingOverrides.set({});
    this.fingeringDesignId.set(criterionId);
    this._onTimelineChanged(false);
  }

  /**
   * Sustituye manualmente la digitación de un paso puntual dentro del diseño activo.
   * @param {number} stepIndex Índice del paso en `harmonySteps`.
   * @param {import('../../models/Voicing.js').Voicing} voicing Voicing elegido.
   */
  setStepVoicingOverride(stepIndex, voicing) {
    if (stepIndex < 0 || !voicing) return;
    this.stepVoicingOverrides.set({ ...(this.stepVoicingOverrides.value || {}), [stepIndex]: voicing });
    this._onTimelineChanged(false);
  }

  /**
   * Devuelve los criterios de diseño seleccionables para el instrumento activo.
   * @returns {Array<object>} Criterios disponibles.
   */
  getAvailableFingeringCriteria() {
    const pr = this._practice.value;
    const vInst = normalizeVoicingInstrument(this.voicingInstrument.value);
    const list = this._designer.getAvailableCriteria(vInst);
    const hasExplicit = Boolean(pr?.progression?.some((s) => Boolean(s.voicingId)));
    const isPiano = vInst === 'piano';
    const isBass = vInst === 'bajo' || vInst === 'bajo-5';
    const matchesOriginal =
      hasExplicit &&
      this._transposeSemitones.value === 0 &&
      ((isPiano && pr.instruments.includes('piano')) ||
        (isBass && pr.instruments.includes('bajo')) ||
        (!isPiano && !isBass && !pr.instruments.every((i) => i === 'bajo' || i === 'piano')));

    if (matchesOriginal) {
      return [
        {
          id: 'original',
          label: 'Original de la práctica',
          shortLabel: 'Original',
          description: 'Mantiene las digitaciones originales guardadas en la práctica.',
          pedagogicalTip: 'Probá otro criterio para explorar enlaces alternativos en el mango.'
        },
        ...list
      ];
    }
    return list;
  }

  /**
   * Compara todos los criterios aplicables a la progresión actual para el instrumento elegido.
   * @returns {Array<object>} Lista de planes diseñados con sus métricas comparativas.
   */
  compareFingeringDesigns() {
    const pr = this._practice.value;
    const steps = this.harmonySteps.value;
    if (!pr || steps.length === 0) return [];
    const customChords = [
      ...(pr.customVoicings || []),
      ...(this._appVm.progress.value?.customChords || [])
    ];
    return this._designer.compareDesigns({
      steps: steps.map((s) => ({
        chord: s.chord,
        bars: s.bars,
        section: s.section,
        startMeasure: s.startMeasure
      })),
      voicingInstrument: this.voicingInstrument.value,
      customChords
    });
  }

  /**
   * Guarda el diseño de digitación actual como una práctica editable del usuario.
   * @returns {Promise<import('../../models/Practice.js').Practice|null>} Práctica guardada o null.
   */
  async saveFingeringDesignAsPractice() {
    const pr = this._practice.value;
    const plan = this.fingeringDesignPlan.value;
    if (!pr || !plan || plan.steps.length === 0) return null;

    const nextPr = createFingeringDesignPractice({
      practice: pr,
      plan,
      voicingInstrument: this.voicingInstrument.value,
      transposedKey: this._transposedKey.value,
      compingPattern: this._mixer.compingPattern.value
    });

    await this._appVm.upsertUserPractice(nextPr);
    this._appVm.showSnackbar(`Diseño guardado en «Mis prácticas»: ${plan.criterion.shortLabel}.`, {
      actionLabel: 'Abrir en Editor',
      durationMs: 6500,
      onAction: () => this._appVm.navigate(`#/editor/${encodeURIComponent(nextPr.id)}`)
    });
    return nextPr;
  }

  /**
   * Reproduce un voicing puntual al tocar su diagrama dentro de la vista de práctica.
   * @param {object} step Paso de `harmonySteps`.
   */
  playStepVoicing(step) {
    if (!step?.voicing) return;
    const vInst = normalizeVoicingInstrument(this.voicingInstrument.value);
    const isPiano = vInst === 'piano' || Boolean(step.voicing.isPianoVoicing);
    const tuning = isPiano ? null : getTuningForVoicingInstrument(vInst);
    const isBass = !isPiano && tuning.instrument === 'bass';
    const rawComping = this._mixer.compingPattern.value || this._practice.value?.comping || 'negras-abajo';
    const comping = typeof rawComping === 'object' && rawComping !== null ? (rawComping.pattern || 'negras-abajo') : String(rawComping);
    const isArpComping = comping.startsWith('arpegio');
    const mode = isPiano
      ? (isArpComping ? 'arpeggio-asc' : 'block')
      : isBass
        ? (isArpComping ? 'arpeggio-asc' : 'block')
        : (comping === 'arpegio-pima' ? 'arpeggio-pima' : 'strum-down');

    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playVoicing(step.voicing, {
      mode,
      instrument: isPiano
        ? 'acoustic-piano'
        : isBass
          ? 'electric-bass'
          : vInst === 'guitarra-clasica'
            ? 'nylon-guitar'
            : this._mixer.synthInstrument.value,
      tuning,
      duration: 1.5
    });
  }

  /**
   * Calcula internamente el plan de digitaciones para la práctica, tonalidad e instrumento actuales.
   * @returns {object|null} Plan resuelto o null si la práctica no tiene progresión.
   */
  _computeDesignPlan() {
    const pr = this._practice.value;
    if (!pr || !Array.isArray(pr.progression) || pr.progression.length === 0) return null;

    const semi = this._transposeSemitones.value;
    const vInst = normalizeVoicingInstrument(this.voicingInstrument.value);
    const isPiano = vInst === 'piano';
    const tuning = getTuningForVoicingInstrument(vInst);
    const isBass = !isPiano && tuning.instrument === 'bass';
    const fam = isBass ? 'bass' : 'guitar';
    const useFlats = prefersFlats(this._transposedKey.value || pr.key);
    const customChords = [
      ...(pr.customVoicings || []),
      ...(this._appVm.progress.value?.customChords || [])
    ];
    const overrides = this.stepVoicingOverrides.value || {};
    const designId = this.fingeringDesignId.value || 'original';

    let barCursor = 1;
    const baseSteps = pr.progression.map((step, idx) => {
      const chordSymbol = semi ? transposeChordSymbol(step.chord, semi, useFlats) : step.chord;
      const startMeasure = Math.floor(barCursor);
      barCursor += Number(step.bars) || 1;
      return {
        index: idx,
        bars: step.bars,
        startMeasure,
        section: step.section || null,
        chord: chordSymbol,
        voicingId: step.voicingId || null,
        rhythm: step.rhythm || null
      };
    });

    const hasExplicitForInst =
      designId === 'original' &&
      !semi &&
      baseSteps.some((s) => Boolean(s.voicingId)) &&
      ((isPiano && pr.instruments.includes('piano')) ||
        (isBass && pr.instruments.includes('bajo')) ||
        (!isPiano && !isBass && !pr.instruments.every((i) => i === 'bajo' || i === 'piano')));

    if (hasExplicitForInst) {
      const explicitOverrides = { ...overrides };
      baseSteps.forEach((s, idx) => {
        if (!explicitOverrides[idx] && s.voicingId) {
          if (isPiano) {
            const pFound = generatePianoVoicings(s.chord).find((v) => v.id === s.voicingId);
            if (pFound) explicitOverrides[idx] = pFound;
          } else {
            const found = findVoicingById(s.voicingId, customChords, s.chord, fam);
            if (found && found.frets.length === tuning.stringCount) {
              explicitOverrides[idx] = found;
            }
          }
        }
      });
      const plan = this._designer.designProgression({
        steps: baseSteps,
        voicingInstrument: vInst,
        criterionId: this._designer.getRecommendedCriterion(vInst, pr),
        customChords,
        overrides: explicitOverrides
      });
      return {
        ...plan,
        criterion: {
          id: 'original',
          label: 'Digitación original de la práctica',
          shortLabel: 'Original',
          description: 'Respeta las digitaciones previstas originalmente por esta práctica.',
          pedagogicalTip: 'Probá cambiar de criterio para comparar posiciones alternativas sobre el mismo tema.'
        },
        steps: plan.steps.map((st, idx) => ({
          ...st,
          index: idx,
          midis: st.voicing ? st.voicing.getMidiNotes(tuning) : []
        }))
      };
    }

    const plan = this._designer.designProgression({
      steps: baseSteps,
      voicingInstrument: vInst,
      criterionId: designId === 'original' ? this._designer.getRecommendedCriterion(vInst, pr) : designId,
      customChords,
      overrides
    });

    return {
      ...plan,
      steps: plan.steps.map((st, idx) => ({
        ...st,
        index: idx,
        midis: st.voicing ? st.voicing.getMidiNotes(tuning) : []
      }))
    };
  }

  /**
   * Libera los `ComputedObservable` del diseñador de digitaciones.
   */
  dispose() {
    this.harmonySteps.dispose();
    this.fingeringDesignPlan.dispose();
  }
}
