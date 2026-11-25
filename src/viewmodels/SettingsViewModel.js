import { DEFAULT_SETTINGS } from '../models/Settings.js';
import { PIANO_REFERENCE_TONES, getTuningStrings } from '../core/PitchPolicy.js';
import { APP_VERSION } from '../core/version.js';

/**
 * ViewModel de la pantalla de Ajustes (#/ajustes).
 * Gestiona tema claro/oscuro/automático, color semilla dinámico Material 3,
 * cifrado americano/latino, registro de escucha (real / +1 octava), referencia de afinación,
 * instrumento inicial, Wake Lock y valores por defecto.
 */
export class SettingsViewModel {
  /**
   * Construye el SettingsViewModel inyectando el AppViewModel y opcionalmente AudioSynthService.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   * @param {import('../services/AudioSynthService.js').AudioSynthService|null} [audioService=null] Sintetizador para la referencia de afinación.
   */
  constructor(appVm, audioService = null) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Referencia opcional al sintetizador para sonar cuerdas al aire. */
    this._audio = audioService;
    /** Observable compartido con el objeto Settings activo. */
    this.settings = appVm.settings;
  }

  /**
   * Cambia el modo de tema visual ('auto' | 'light' | 'dark').
   * @param {'auto'|'light'|'dark'} theme Modo de tema.
   */
  setTheme(theme) {
    this._appVm.updateSettings({ theme });
  }

  /**
   * Cambia el color semilla dinámico Material 3 y regenera toda la paleta.
   * @param {string} seedColor Color hexadecimal "#RRGGBB".
   */
  setSeedColor(seedColor) {
    this._appVm.updateSettings({ seedColor });
  }

  /**
   * Cambia el sistema de cifrado de acordes ('americano' o 'latino').
   * @param {'americano'|'latino'} chordNotation Sistema de cifrado.
   */
  setChordNotation(chordNotation) {
    this._appVm.updateSettings({ chordNotation });
    this._appVm.showSnackbar(
      chordNotation === 'latino'
        ? 'Cifrado latino activado (Do, Rem7, Sol7).'
        : 'Cifrado americano activado (C, Dm7, G7).'
    );
  }

  /**
   * Cambia el registro de escucha del sintetizador ('real' por defecto o '+1oct').
   * @param {'real'|'+1oct'} listeningRegister Registro elegido.
   */
  setListeningRegister(listeningRegister) {
    const safe = listeningRegister === '+1oct' ? '+1oct' : 'real';
    this._appVm.updateSettings({ listeningRegister: safe });
    this._appVm.showSnackbar(
      safe === '+1oct'
        ? 'Registro de escucha +1 octava activado (más audible en parlantes chicos).'
        : 'Registro de escucha real restaurado.'
    );
  }

  /**
   * Reproduce la nota real de una cuerda al aire para comparar de oído con el instrumento.
   * @param {'guitarra'|'guitarra-clasica'|'bajo'} instrument Instrumento de referencia.
   * @param {number} midi Altura MIDI real de la cuerda al aire.
   */
  playTuningString(instrument, midi) {
    if (!this._audio) return;
    this._audio.configure({ listeningRegister: this.settings.value.listeningRegister });
    const synthVoice =
      instrument === 'piano'
        ? 'acoustic-piano'
        : instrument === 'bajo'
          ? 'electric-bass'
          : instrument === 'guitarra-clasica'
            ? 'nylon-guitar'
            : 'acoustic-guitar';
    this._audio.playReferenceTone(midi, synthVoice);
  }

  /**
   * Devuelve las cuerdas al aire de referencia de afinación para guitarra y bajo, y notas de referencia para piano.
   * @returns {{ guitar: Array<object>, bass: Array<object>, piano: Array<object> }} Referencias sonoras.
   */
  getTuningReferenceStrings() {
    return {
      guitar: getTuningStrings('guitarra'),
      bass: getTuningStrings('bajo'),
      piano: [...PIANO_REFERENCE_TONES]
    };
  }

  /**
   * Configura el instrumento inicial al abrir la app.
   * @param {string} defaultInstrument Instrumento predeterminado.
   */
  setDefaultInstrument(defaultInstrument) {
    this._appVm.updateSettings({ defaultInstrument });
  }

  /**
   * Activa o desactiva la solicitud de pantalla siempre encendida (Wake Lock).
   * @param {boolean} wakeLockEnabled Nuevo estado.
   */
  setWakeLockEnabled(wakeLockEnabled) {
    this._appVm.updateSettings({ wakeLockEnabled: Boolean(wakeLockEnabled) });
  }

  /**
   * Configura si se muestran digitaciones anotadas por defecto (ambas manos).
   * @param {boolean} showFingerings Nuevo estado.
   */
  setShowFingerings(showFingerings) {
    const val = Boolean(showFingerings);
    this._appVm.updateSettings({ showFingerings: val, showLeftHand: val, showRightHand: val });
  }

  /** Configura visibilidad por defecto de mano izquierda (dedos 0–4, cuerdas, posiciones). */
  setShowLeftHand(showLeftHand) {
    const val = Boolean(showLeftHand);
    const right = this.settings.value.showRightHand;
    this._appVm.updateSettings({ showLeftHand: val, showFingerings: val || right });
  }

  /** Configura visibilidad por defecto de mano derecha (p, i, m, a). */
  setShowRightHand(showRightHand) {
    const val = Boolean(showRightHand);
    const left = this.settings.value.showLeftHand;
    this._appVm.updateSettings({ showRightHand: val, showFingerings: left || val });
  }

  /** Configura visibilidad por defecto del cifrado de acordes sobre la partitura. */
  setShowChordsOnScore(showChordsOnScore) {
    this._appVm.updateSettings({ showChordsOnScore: Boolean(showChordsOnScore) });
  }

  /** Configura visibilidad por defecto de otras anotaciones (grados romanos, texto). */
  setShowOtherAnnotations(showOtherAnnotations) {
    this._appVm.updateSettings({ showOtherAnnotations: Boolean(showOtherAnnotations) });
  }

  /**
   * Configura si se muestran funciones armónicas sobre bajo por defecto.
   * @param {boolean} showBassFunctions Nuevo estado.
   */
  setShowBassFunctions(showBassFunctions) {
    this._appVm.updateSettings({ showBassFunctions: Boolean(showBassFunctions) });
  }

  /**
   * Configura el sonido predeterminado del metrónomo.
   * @param {'woodblock'|'click'|'rimshot'|'beep'} metronomeSound Sonido elegido.
   */
  setMetronomeSound(metronomeSound) {
    this._appVm.updateSettings({ metronomeSound });
  }

  /**
   * Configura la cantidad predeterminada de compases de conteo previo.
   * @param {number} countInMeasures 0, 1 o 2 compases.
   */
  setCountInMeasures(countInMeasures) {
    this._appVm.updateSettings({ countInMeasures: Number(countInMeasures) });
  }

  /**
   * Ajusta la calibración manual de sincronización visual respecto al audio (-250 a +250 ms).
   * Útil especialmente para compensar latencia extra de auriculares Bluetooth.
   * @param {number} ms Desfase en milisegundos (positivo retrasa el resaltado visual).
   */
  setAudioVisualOffsetMs(ms) {
    const safe = Math.max(-250, Math.min(250, Math.round(Number(ms) || 0)));
    this._appVm.updateSettings({ audioVisualOffsetMs: safe });
    if (this._audio) {
      this._audio.configure({ audioVisualOffsetMs: safe });
    }
  }

  /**
   * Restaura todos los ajustes a sus valores de fábrica.
   */
  resetDefaults() {
    this._appVm.updateSettings({ ...DEFAULT_SETTINGS });
    this._appVm.showSnackbar('Ajustes restablecidos a los valores predeterminados.');
  }

  /**
   * Comprueba manualmente si existe una versión nueva del Service Worker de la PWA
   * y coordina la actualización limpia (SKIP_WAITING + recarga) o informa estado actual.
   * @returns {Promise<{ status: string }>} Resultado de la comprobación.
   */
  async checkForUpdates() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      this._appVm.showSnackbar('Las actualizaciones automáticas requieren un navegador con Service Worker.');
      return { status: 'unsupported' };
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        this._appVm.showSnackbar(`No hay caché PWA activa en este entorno (v${APP_VERSION}). Recargá para ver cambios.`);
        return { status: 'no-sw' };
      }

      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        this._appVm.showSnackbar('Aplicando nueva versión de Acordate…');
        return { status: 'applying' };
      }

      await reg.update();

      if (reg.waiting) {
        this._appVm.showSnackbar('Nueva versión de Acordate lista para instalar.', {
          actionLabel: 'Actualizar',
          durationMs: 18000,
          onAction: () => reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        });
        return { status: 'update-ready' };
      }

      if (reg.installing) {
        const worker = reg.installing;
        this._appVm.showSnackbar('Descargando nueva versión de Acordate…');
        worker.addEventListener?.('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            this._appVm.showSnackbar('Nueva versión descargada.', {
              actionLabel: 'Actualizar',
              durationMs: 18000,
              onAction: () => worker.postMessage({ type: 'SKIP_WAITING' })
            });
          }
        });
        return { status: 'downloading' };
      }

      this._appVm.showSnackbar(`Ya tenés la última versión instalada (v${APP_VERSION}).`);
      return { status: 'up-to-date' };
    } catch {
      this._appVm.showSnackbar('Sin conexión para buscar actualizaciones. Seguís en modo offline.');
      return { status: 'offline' };
    }
  }

  /**
   * Contrato uniforme de ciclo de vida del ViewModel.
   */
  dispose() {
    // Sin suscripciones ni temporizadores propios
  }
}
