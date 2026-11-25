import { Observable } from '../../core/Observable.js';
import { Tuning } from '../../models/Tuning.js';
import { buildEditorHarmonyTimeline } from '../../services/HarmonyTimelineService.js';

/**
 * Sub-ViewModel de vista previa de audio e importación/exportación de archivos del Editor.
 * Mantiene aislado el manejo de `_audio.onPlaybackEnd` para nunca interferir con `PracticePlayerViewModel`.
 */
export class EditorImportExportViewModel {
  /**
   * Construye el sub-ViewModel de vista previa e I/O del editor.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({
    appVm,
    form,
    validationErrors,
    abcService,
    audioService,
    importExportService,
    validateFormFn,
    buildCandidateFn,
    onReloadPractice
  }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Observable compartido del formulario del editor. */
    this._form = form;
    /** Observable compartido de errores de validación. */
    this._validationErrors = validationErrors;
    /** Servicio ABC para timeline de vista previa. */
    this._abc = abcService;
    /** Sintetizador Web Audio. */
    this._audio = audioService;
    /** Servicio de exportación/importación JSON y .abc. */
    this._io = importExportService;
    /** Callback para validar el formulario antes de exportar. */
    this._validateForm = validateFormFn;
    /** Callback para construir el candidato JSON. */
    this._buildCandidate = buildCandidateFn;
    /** Callback para cargar la práctica recién importada en el editor. */
    this._onReloadPractice = onReloadPractice;

    /** Indica si la vista previa está reproduciéndose. */
    this.isPreviewPlaying = new Observable(false);
    /** Referencia propia al callback `onPlaybackEnd` para liberarlo sin pisar al Reproductor. */
    this._previewEndHandler = null;
  }

  /** Exporta la práctica actual en formato JSON descargable. */
  exportCurrentJson() {
    const { valid, candidate } = this._validateForm();
    if (!valid) {
      this._appVm.showSnackbar('Corregí los errores antes de exportar.');
      return;
    }
    this._io.triggerBrowserDownload(`${candidate.id}.json`, this._io.exportPracticeJson(candidate), 'application/json');
    this._appVm.showSnackbar('Práctica exportada en JSON.');
  }

  /** Exporta únicamente la partitura ABC en un archivo .abc. */
  exportCurrentAbc() {
    const candidate = this._buildCandidate();
    this._io.triggerBrowserDownload(`${candidate.id}.abc`, this._io.exportPracticeAbc(candidate), 'text/vnd.abc');
    this._appVm.showSnackbar('Partitura exportada en formato .abc.');
  }

  /** Exporta todas las prácticas del usuario como colección JSON. */
  exportUserCollection() {
    const userPractices = this._appVm.allPractices.value.filter((p) => p.origin === 'user');
    if (userPractices.length === 0) {
      this._appVm.showSnackbar('Todavía no tenés prácticas propias para exportar.');
      return;
    }
    this._io.triggerBrowserDownload(
      'acordate-coleccion.json',
      this._io.exportCollectionJson(userPractices, 'Mis prácticas de Acordate'),
      'application/json'
    );
    this._appVm.showSnackbar(`Colección exportada (${userPractices.length} prácticas).`);
  }

  /** Importa una o varias prácticas desde contenido JSON o archivo .abc. */
  async importFileContent(text, filename = 'import.json') {
    if (filename.toLowerCase().endsWith('.abc')) {
      const { practice, errors, notice } = this._io.importPracticeFromAbc(text, filename);
      if (errors.length > 0 || !practice) {
        this._validationErrors.set(errors, true);
        this._appVm.showSnackbar('Error al importar archivo .abc.');
        return { importedCount: 0, errors };
      }
      await this._appVm.upsertUserPractice(practice);
      await this._onReloadPractice(practice.id);
      this._appVm.showSnackbar(`Importada "${practice.title}". ${notice}`);
      return { importedCount: 1, errors: [] };
    }

    const { practices, errors } = this._io.importPracticesFromJson(text);
    if (practices.length === 0) {
      this._validationErrors.set(errors, true);
      this._appVm.showSnackbar('No se pudo importar el JSON.');
      return { importedCount: 0, errors };
    }

    const count = await this._appVm.importUserPractices(practices);
    await this._onReloadPractice(practices[0].id);
    this._appVm.showSnackbar(
      count === 1 ? `Práctica "${practices[0].title}" importada.` : `${count} prácticas importadas correctamente.`
    );
    return { importedCount: count, errors };
  }

  /** Reproduce o detiene la vista previa inmediata del editor usando `HarmonyTimelineService`. */
  togglePreviewPlay(visualObj = null) {
    if (this.isPreviewPlaying.value) {
      this.stopPreview();
      return;
    }
    const f = this._form.value;
    const isPiano = f.instruments.includes('piano') && (f.instruments.length === 1 || f.instruments[0] === 'piano');
    const isBass = !isPiano && f.instruments.includes('bajo') && f.instruments.length === 1;
    const tuning = Tuning.defaultForInstrument(isBass ? 'bass' : 'guitar');

    const timeline = f.type === 'harmony'
      ? buildEditorHarmonyTimeline({
          timeSignature: f.timeSignature,
          progression: f.progression,
          customVoicings: f.customVoicings,
          tuning,
          isPiano
        })
      : this._abc.extractTimeline(visualObj, f.abc, {
          instrument: isPiano ? 'piano' : (f.instruments[0] || 'guitarra'),
          isBass,
          isPiano,
          timeSignature: f.timeSignature
        });

    this._audio.setChorusPlan?.(null);
    this._audio.loadTimeline(timeline);
    this._audio.configure({
      bpm: Number(f.tempoStart) || 85,
      instrument: isPiano
        ? 'acoustic-piano'
        : isBass
          ? 'electric-bass'
          : f.instruments.includes('guitarra-clasica')
            ? 'nylon-guitar'
            : 'acoustic-guitar',
      comping: f.comping || 'negras-abajo',
      compingFeel: 'fijo',
      countInMeasures: 0,
      loopEnabled: false,
      metronomeEnabled: true,
      chordsEnabled: true
    });
    this._previewEndHandler = () => {
      this.isPreviewPlaying.set(false);
      if (this._audio.onPlaybackEnd === this._previewEndHandler) {
        this._audio.onPlaybackEnd = null;
      }
      this._previewEndHandler = null;
    };
    this._audio.onPlaybackEnd = this._previewEndHandler;
    this._audio.play();
    this.isPreviewPlaying.set(true);
  }

  /** Detiene la vista previa y libera su callback sobre `_audio`. */
  stopPreview() {
    if (this._previewEndHandler && this._audio.onPlaybackEnd === this._previewEndHandler) {
      this._audio.onPlaybackEnd = null;
    }
    this._previewEndHandler = null;
    if (this.isPreviewPlaying.value) {
      this._audio.stop();
      this.isPreviewPlaying.set(false);
    }
  }

  /** Detiene la reproducción al destruir el editor. */
  dispose() {
    this.stopPreview();
  }
}
