import { DEFAULT_SETTINGS } from '../models/Settings.js';

/**
 * ViewModel de la pantalla de Ajustes (#/ajustes).
 * Gestiona tema claro/oscuro/automático, color semilla dinámico Material 3,
 * cifrado americano/latino, instrumento inicial, Wake Lock y valores por defecto.
 */
export class SettingsViewModel {
  /**
   * Construye el SettingsViewModel inyectando el AppViewModel.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   */
  constructor(appVm) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
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
   * Configura el filtro de instrumento inicial al abrir la app.
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
   * Configura si se muestran digitaciones anotadas por defecto.
   * @param {boolean} showFingerings Nuevo estado.
   */
  setShowFingerings(showFingerings) {
    this._appVm.updateSettings({ showFingerings: Boolean(showFingerings) });
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
   * Restaura todos los ajustes a sus valores de fábrica.
   */
  resetDefaults() {
    this._appVm.updateSettings({ ...DEFAULT_SETTINGS });
    this._appVm.showSnackbar('Ajustes restablecidos a los valores predeterminados.');
  }
}
