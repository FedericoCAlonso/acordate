import { createChordDiagramElement, getFunctionDotColors } from '../ChordDiagramView.js';
import { createPianoChordElement } from '../PianoKeyboardView.js';

export { getFunctionDotColors };

/**
 * Fachada visual única para renderizar cualquier voicing (Guitarra, Guitarra clásica, Bajo 4c/5c o Piano)
 * aplicando de forma uniforme notación (americano/latino), modo de etiquetas (`fingers | functions | notes`),
 * soporte zurdo (`leftHanded`), tamaño y callbacks de reproducción.
 *
 * @param {object} voicing Instancia de `Voicing` o `PianoVoicing`.
 * @param {object} [options={}] Opciones de visualización e interacción.
 * @param {import('../../models/Tuning.js').Tuning|null} [options.tuning=null] Afinación activa (para cuerdas).
 * @param {'americano'|'latino'} [options.notation='americano'] Sistema de cifrado.
 * @param {'fingers'|'functions'|'notes'} [options.labelMode='fingers'] Modo de etiquetas dentro de los puntos/teclas.
 * @param {boolean} [options.leftHanded=false] Invierte orden horizontal de cuerdas para guitarristas/bajistas zurdos.
 * @param {'sm'|'md'|'lg'} [options.size='md'] Tamaño visual.
 * @param {boolean} [options.showTitle=false] Muestra el título del acorde encima del diagrama.
 * @param {boolean} [options.isPiano=false] Fuerza renderizado como teclado de piano.
 * @param {Function|null} [options.onPlay=null] Callback al tocar el diagrama/teclado.
 * @param {Function|null} [options.onNoteClick=null] Callback al tocar una tecla individual (Piano).
 * @returns {HTMLElement} Componente DOM del diagrama o teclado.
 */
export function renderVoicingDiagram(voicing, options = {}) {
  const isPiano = Boolean(options.isPiano || voicing?.isPianoVoicing || voicing?.instrument === 'piano');
  const notation = options.notation || 'americano';
  const labelMode = options.labelMode || 'fingers';
  const size = options.size || 'md';

  if (isPiano) {
    return createPianoChordElement(voicing, {
      notation,
      labelMode,
      size,
      onPlay: options.onPlay,
      onNoteClick: options.onNoteClick
    });
  }

  return createChordDiagramElement(voicing, {
    tuning: options.tuning,
    notation,
    labelMode,
    leftHanded: Boolean(options.leftHanded),
    size,
    showTitle: options.showTitle === true,
    onPlay: options.onPlay
  });
}
