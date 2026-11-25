import { mod12 } from '../core/MusicTheory.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';
import { Voicing } from '../models/Voicing.js';

/**
 * Formas abiertas y de primera posición curadas a mano con digitación recomendada
 * para guitarra y guitarra clásica (frets de 6.ª a 1.ª cuerda).
 */
export const CURATED_OPEN_VOICINGS = [
  // Tríadas mayores abiertas
  { id: 'c-major-open', chord: 'C', instrument: 'guitar', frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, 0, 1, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'C', tags: ['abierto', 'clásica', 'CAGED'], movable: false },
  { id: 'a-major-open', chord: 'A', instrument: 'guitar', frets: [null, 0, 2, 2, 2, 0], fingers: [null, 0, 1, 2, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto', 'clásica', 'CAGED'], movable: false },
  { id: 'g-major-open', chord: 'G', instrument: 'guitar', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1, barres: [], inversion: 0, bassNote: 'G', tags: ['abierto', 'clásica', 'CAGED'], movable: false },
  { id: 'e-major-open', chord: 'E', instrument: 'guitar', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto', 'clásica', 'CAGED'], movable: false },
  { id: 'd-major-open', chord: 'D', instrument: 'guitar', frets: [null, null, 0, 2, 3, 2], fingers: [null, null, 0, 1, 3, 2], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto', 'clásica', 'CAGED'], movable: false },

  // Tríadas menores abiertas
  { id: 'a-minor-open', chord: 'Am', instrument: 'guitar', frets: [null, 0, 2, 2, 1, 0], fingers: [null, 0, 2, 3, 1, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto', 'clásica'], movable: false },
  { id: 'e-minor-open', chord: 'Em', instrument: 'guitar', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto', 'clásica'], movable: false },
  { id: 'd-minor-open', chord: 'Dm', instrument: 'guitar', frets: [null, null, 0, 2, 3, 1], fingers: [null, null, 0, 2, 3, 1], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto', 'clásica'], movable: false },

  // Inversiones abiertas con bajo (clásica y guitarra)
  { id: 'c-over-e-open', chord: 'C/E', instrument: 'guitar', frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, barres: [], inversion: 1, bassNote: 'E', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'c-over-g-open', chord: 'C/G', instrument: 'guitar', frets: [3, 3, 2, 0, 1, 0], fingers: [3, 4, 2, 0, 1, 0], baseFret: 1, barres: [], inversion: 2, bassNote: 'G', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'g-over-b-open', chord: 'G/B', instrument: 'guitar', frets: [null, 2, 0, 0, 0, 3], fingers: [null, 1, 0, 0, 0, 3], baseFret: 1, barres: [], inversion: 1, bassNote: 'B', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'd-over-fsharp-open', chord: 'D/F#', instrument: 'guitar', frets: [2, null, 0, 2, 3, 2], fingers: [1, null, 0, 2, 4, 3], baseFret: 1, barres: [], inversion: 1, bassNote: 'F#', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'f-over-a-open', chord: 'F/A', instrument: 'guitar', frets: [null, 0, 3, 2, 1, 1], fingers: [null, 0, 3, 2, 1, 1], baseFret: 1, barres: [{ fret: 1, fromString: 4, toString: 5, finger: 1 }], inversion: 1, bassNote: 'A', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'em-over-b-open', chord: 'Em/B', instrument: 'guitar', frets: [null, 2, 2, 0, 0, 0], fingers: [null, 2, 3, 0, 0, 0], baseFret: 1, barres: [], inversion: 2, bassNote: 'B', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'am-over-c-open', chord: 'Am/C', instrument: 'guitar', frets: [null, 3, 2, 2, 1, 0], fingers: [null, 4, 2, 3, 1, 0], baseFret: 1, barres: [], inversion: 1, bassNote: 'C', tags: ['abierto', 'clásica', 'inversion'], movable: false },
  { id: 'am-over-g-open', chord: 'Am/G', instrument: 'guitar', frets: [3, null, 2, 2, 1, 0], fingers: [3, null, 2, 4, 1, 0], baseFret: 1, barres: [], inversion: 3, bassNote: 'G', tags: ['abierto', 'clásica', 'inversion'], movable: false },

  // Primeras cejillas
  { id: 'f-major-barre', chord: 'F', instrument: 'guitar', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [{ fret: 1, fromString: 0, toString: 5, finger: 1 }], inversion: 0, bassNote: 'F', tags: ['cejilla', 'clásica', 'CAGED'], movable: true },
  { id: 'f-major-easy', chord: 'F', instrument: 'guitar', frets: [null, null, 3, 2, 1, 1], fingers: [null, null, 3, 2, 1, 1], baseFret: 1, barres: [{ fret: 1, fromString: 4, toString: 5, finger: 1 }], inversion: 0, bassNote: 'F', tags: ['abierto', 'clásica'], movable: false },
  { id: 'bm-barre-2', chord: 'Bm', instrument: 'guitar', frets: [null, 2, 4, 4, 3, 2], fingers: [null, 1, 3, 4, 2, 1], baseFret: 2, barres: [{ fret: 2, fromString: 1, toString: 5, finger: 1 }], inversion: 0, bassNote: 'B', tags: ['cejilla', 'clásica'], movable: true },

  // Séptimas abiertas
  { id: 'a7-open', chord: 'A7', instrument: 'guitar', frets: [null, 0, 2, 0, 2, 0], fingers: [null, 0, 2, 0, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto', 'clásica'], movable: false },
  { id: 'd7-open', chord: 'D7', instrument: 'guitar', frets: [null, null, 0, 2, 1, 2], fingers: [null, null, 0, 2, 1, 3], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto', 'clásica'], movable: false },
  { id: 'e7-open', chord: 'E7', instrument: 'guitar', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto', 'clásica'], movable: false },
  { id: 'g7-open', chord: 'G7', instrument: 'guitar', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1, barres: [], inversion: 0, bassNote: 'G', tags: ['abierto', 'clásica'], movable: false },
  { id: 'b7-open', chord: 'B7', instrument: 'guitar', frets: [null, 2, 1, 2, 0, 2], fingers: [null, 2, 1, 3, 0, 4], baseFret: 1, barres: [], inversion: 0, bassNote: 'B', tags: ['abierto', 'clásica'], movable: false },
  { id: 'c7-open', chord: 'C7', instrument: 'guitar', frets: [null, 3, 2, 3, 1, 0], fingers: [null, 3, 2, 4, 1, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'C', tags: ['abierto'], movable: false },
  { id: 'cmaj7-open', chord: 'Cmaj7', instrument: 'guitar', frets: [null, 3, 2, 0, 0, 0], fingers: [null, 3, 2, 0, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'C', tags: ['abierto', 'clásica'], movable: false },
  { id: 'fmaj7-open', chord: 'Fmaj7', instrument: 'guitar', frets: [null, null, 3, 2, 1, 0], fingers: [null, null, 3, 2, 1, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'F', tags: ['abierto', 'clásica'], movable: false },
  { id: 'gmaj7-open', chord: 'Gmaj7', instrument: 'guitar', frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2], baseFret: 1, barres: [], inversion: 0, bassNote: 'G', tags: ['abierto'], movable: false },
  { id: 'dmaj7-open', chord: 'Dmaj7', instrument: 'guitar', frets: [null, null, 0, 2, 2, 2], fingers: [null, null, 0, 1, 1, 1], baseFret: 1, barres: [{ fret: 2, fromString: 3, toString: 5, finger: 1 }], inversion: 0, bassNote: 'D', tags: ['abierto', 'clásica'], movable: false },
  { id: 'amaj7-open', chord: 'Amaj7', instrument: 'guitar', frets: [null, 0, 2, 1, 2, 0], fingers: [null, 0, 2, 1, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto'], movable: false },
  { id: 'am7-open', chord: 'Am7', instrument: 'guitar', frets: [null, 0, 2, 0, 1, 0], fingers: [null, 0, 2, 0, 1, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto', 'clásica'], movable: false },
  { id: 'em7-open', chord: 'Em7', instrument: 'guitar', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto', 'clásica'], movable: false },
  { id: 'dm7-open', chord: 'Dm7', instrument: 'guitar', frets: [null, null, 0, 2, 1, 1], fingers: [null, null, 0, 2, 1, 1], baseFret: 1, barres: [{ fret: 1, fromString: 4, toString: 5, finger: 1 }], inversion: 0, bassNote: 'D', tags: ['abierto', 'clásica'], movable: false },

  // Sus2 / Sus4 / Add9 / 6
  { id: 'asus2-open', chord: 'Asus2', instrument: 'guitar', frets: [null, 0, 2, 2, 0, 0], fingers: [null, 0, 1, 2, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto'], movable: false },
  { id: 'asus4-open', chord: 'Asus4', instrument: 'guitar', frets: [null, 0, 2, 2, 3, 0], fingers: [null, 0, 1, 2, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto'], movable: false },
  { id: 'dsus2-open', chord: 'Dsus2', instrument: 'guitar', frets: [null, null, 0, 2, 3, 0], fingers: [null, null, 0, 1, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto'], movable: false },
  { id: 'dsus4-open', chord: 'Dsus4', instrument: 'guitar', frets: [null, null, 0, 2, 3, 3], fingers: [null, null, 0, 1, 2, 3], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto'], movable: false },
  { id: 'esus4-open', chord: 'Esus4', instrument: 'guitar', frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto'], movable: false },
  { id: 'cadd9-open', chord: 'Cadd9', instrument: 'guitar', frets: [null, 3, 2, 0, 3, 0], fingers: [null, 2, 1, 0, 3, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'C', tags: ['abierto'], movable: false },
  { id: 'g6-open', chord: 'G6', instrument: 'guitar', frets: [3, 2, 0, 0, 0, 0], fingers: [2, 1, 0, 0, 0, 0], baseFret: 1, barres: [], inversion: 0, bassNote: 'G', tags: ['abierto'], movable: false },

  // Power chords abiertos y clásicos
  { id: 'e5-open', chord: 'E5', instrument: 'guitar', frets: [0, 2, 2, null, null, null], fingers: [0, 1, 2, null, null, null], baseFret: 1, barres: [], inversion: 0, bassNote: 'E', tags: ['abierto', 'power'], movable: false },
  { id: 'a5-open', chord: 'A5', instrument: 'guitar', frets: [null, 0, 2, 2, null, null], fingers: [null, 0, 1, 2, null, null], baseFret: 1, barres: [], inversion: 0, bassNote: 'A', tags: ['abierto', 'power'], movable: false },
  { id: 'd5-open', chord: 'D5', instrument: 'guitar', frets: [null, null, 0, 2, 3, null], fingers: [null, null, 0, 1, 3, null], baseFret: 1, barres: [], inversion: 0, bassNote: 'D', tags: ['abierto', 'power'], movable: false }
];

/**
 * Plantillas móviles curadas y verificadas matemáticamente para guitarra estándar (E2 A2 D3 G3 B3 E4).
 * Incluye cejillas E/A, CAGED, tríadas con las 3 inversiones en juegos 3-2-1 y 4-3-2,
 * Shell voicings, Drop 2, Drop 3 y extensiones/alteraciones jazz.
 */
export const MOVABLE_GUITAR_TEMPLATES = [
  // Cejillas forma E (raíz en cuerda 6, índice 0) y forma A (raíz en cuerda 5, índice 1)
  { key: 'e-shape-maj', quality: '', rootString: 0, offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: { from: 0, to: 5, finger: 1, offset: 0 }, tags: ['cejilla', 'CAGED'] },
  { key: 'a-shape-maj', quality: '', rootString: 1, offsets: [null, 0, 2, 2, 2, 0], fingers: [null, 1, 3, 3, 3, 1], barre: { from: 1, to: 5, finger: 1, offset: 0 }, tags: ['cejilla', 'CAGED'] },
  { key: 'e-shape-min', quality: 'm', rootString: 0, offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: { from: 0, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },
  { key: 'a-shape-min', quality: 'm', rootString: 1, offsets: [null, 0, 2, 2, 1, 0], fingers: [null, 1, 3, 4, 2, 1], barre: { from: 1, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },

  // Power chords móviles
  { key: 'p5-s6', quality: '5', rootString: 0, offsets: [0, 2, 2, null, null, null], fingers: [1, 3, 4, null, null, null], tags: ['power'] },
  { key: 'p5-s5', quality: '5', rootString: 1, offsets: [null, 0, 2, 2, null, null], fingers: [null, 1, 3, 4, null, null], tags: ['power'] },

  // Tríadas mayores en juegos de cuerdas 3-2-1 (índices 3,4,5) y 4-3-2 (índices 2,3,4) — fundamental, 1ª y 2ª inversión
  { key: 'triad-maj-321-root', quality: '', rootString: 3, offsets: [null, null, null, 0, 0, -2], fingers: [null, null, null, 2, 3, 1], tags: ['triada', 'inversion'] },
  { key: 'triad-maj-321-inv1', quality: '', rootString: 5, offsets: [null, null, null, 1, 0, 0], fingers: [null, null, null, 2, 1, 1], barre: { from: 4, to: 5, finger: 1, offset: 0 }, tags: ['triada', 'inversion'] },
  { key: 'triad-maj-321-inv2', quality: '', rootString: 4, offsets: [null, null, null, -1, 0, -1], fingers: [null, null, null, 1, 3, 2], tags: ['triada', 'inversion'] },
  { key: 'triad-maj-432-root', quality: '', rootString: 2, offsets: [null, null, 0, -1, -2, null], fingers: [null, null, 3, 2, 1, null], tags: ['triada', 'inversion'] },
  { key: 'triad-maj-432-inv1', quality: '', rootString: 4, offsets: [null, null, 1, -1, 0, null], fingers: [null, null, 3, 1, 2, null], tags: ['triada', 'inversion'] },
  { key: 'triad-maj-432-inv2', quality: '', rootString: 3, offsets: [null, null, 0, 0, 0, null], fingers: [null, null, 1, 2, 3, null], tags: ['triada', 'inversion'] },

  // Tríadas menores en juegos 3-2-1 y 4-3-2 — fundamental, 1ª y 2ª inversión
  { key: 'triad-min-321-root', quality: 'm', rootString: 3, offsets: [null, null, null, 0, -1, -2], fingers: [null, null, null, 3, 2, 1], tags: ['triada', 'inversion'] },
  { key: 'triad-min-321-inv1', quality: 'm', rootString: 5, offsets: [null, null, null, 0, 0, 0], fingers: [null, null, null, 1, 1, 1], barre: { from: 3, to: 5, finger: 1, offset: 0 }, tags: ['triada', 'inversion'] },
  { key: 'triad-min-321-inv2', quality: 'm', rootString: 4, offsets: [null, null, null, -1, 0, -2], fingers: [null, null, null, 2, 3, 1], tags: ['triada', 'inversion'] },
  { key: 'triad-min-432-root', quality: 'm', rootString: 2, offsets: [null, null, 0, -2, -2, null], fingers: [null, null, 3, 1, 1, null], barre: { from: 3, to: 4, finger: 1, offset: -2 }, tags: ['triada', 'inversion'] },
  { key: 'triad-min-432-inv1', quality: 'm', rootString: 4, offsets: [null, null, 0, -1, 0, null], fingers: [null, null, 2, 1, 3, null], tags: ['triada', 'inversion'] },
  { key: 'triad-min-432-inv2', quality: 'm', rootString: 3, offsets: [null, null, 0, 0, -1, null], fingers: [null, null, 2, 3, 1, null], tags: ['triada', 'inversion'] },

  // Disminuidas, aumentadas y suspendidas
  { key: 'triad-dim-432-root', quality: 'dim', rootString: 2, offsets: [null, null, 0, -2, -3, null], fingers: [null, null, 4, 2, 1, null], tags: ['triada'] },
  { key: 'triad-dim-432-inv2', quality: 'dim', rootString: 3, offsets: [null, null, -1, 0, -1, null], fingers: [null, null, 1, 3, 2, null], tags: ['triada', 'inversion'] },
  { key: 'triad-aug-432', quality: 'aug', rootString: 2, offsets: [null, null, 0, -1, -1, null], fingers: [null, null, 3, 1, 2, null], tags: ['triada'] },
  { key: 'sus2-a', quality: 'sus2', rootString: 1, offsets: [null, 0, 2, 2, 0, 0], fingers: [null, 1, 3, 4, 1, 1], barre: { from: 1, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },
  { key: 'sus4-a', quality: 'sus4', rootString: 1, offsets: [null, 0, 2, 2, 3, 0], fingers: [null, 1, 2, 3, 4, 1], barre: { from: 1, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },

  // Séptimas: Shell voicings (R-3-7 / R-7-3), Drop 2 y Drop 3
  { key: 'maj7-shell-s6', quality: 'maj7', rootString: 0, offsets: [0, null, 1, 1, null, null], fingers: [1, null, 2, 3, null, null], tags: ['shell'] },
  { key: 'maj7-shell-s5', quality: 'maj7', rootString: 1, offsets: [null, 0, -1, 1, null, null], fingers: [null, 2, 1, 3, null, null], tags: ['shell'] },
  { key: 'maj7-drop2-s5', quality: 'maj7', rootString: 1, offsets: [null, 0, 2, 1, 2, null], fingers: [null, 1, 3, 2, 4, null], tags: ['drop2'] },
  { key: 'maj7-drop2-s4', quality: 'maj7', rootString: 2, offsets: [null, null, 0, 2, 2, 2], fingers: [null, null, 1, 2, 3, 4], tags: ['drop2'] },
  { key: 'maj7-drop3-s6', quality: 'maj7', rootString: 0, offsets: [0, null, 1, 1, 0, null], fingers: [2, null, 3, 4, 1, null], tags: ['drop3', 'cejilla'] },

  { key: 'dom7-shell-s6', quality: '7', rootString: 0, offsets: [0, null, 0, 1, null, null], fingers: [1, null, 2, 3, null, null], tags: ['shell'] },
  { key: 'dom7-shell-s5', quality: '7', rootString: 1, offsets: [null, 0, -1, 0, null, null], fingers: [null, 2, 1, 3, null, null], tags: ['shell'] },
  { key: 'dom7-barre-e', quality: '7', rootString: 0, offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barre: { from: 0, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },
  { key: 'dom7-drop2-s5', quality: '7', rootString: 1, offsets: [null, 0, 2, 0, 2, null], fingers: [null, 1, 3, 1, 4, null], barre: { from: 1, to: 3, finger: 1, offset: 0 }, tags: ['drop2'] },
  { key: 'dom7-drop2-s4', quality: '7', rootString: 2, offsets: [null, null, 0, 2, 1, 2], fingers: [null, null, 1, 3, 2, 4], tags: ['drop2'] },
  { key: 'dom7-drop3-s6', quality: '7', rootString: 0, offsets: [0, null, 0, 1, 0, null], fingers: [1, null, 2, 3, 1, null], tags: ['drop3'] },

  { key: 'm7-shell-s6', quality: 'm7', rootString: 0, offsets: [0, null, 0, 0, null, null], fingers: [1, null, 2, 3, null, null], tags: ['shell'] },
  { key: 'm7-shell-s5', quality: 'm7', rootString: 1, offsets: [null, 0, -2, 0, null, null], fingers: [null, 2, 1, 3, null, null], tags: ['shell'] },
  { key: 'm7-barre-e', quality: 'm7', rootString: 0, offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: { from: 0, to: 5, finger: 1, offset: 0 }, tags: ['cejilla'] },
  { key: 'm7-drop2-s5', quality: 'm7', rootString: 1, offsets: [null, 0, 2, 0, 1, null], fingers: [null, 1, 3, 1, 2, null], barre: { from: 1, to: 3, finger: 1, offset: 0 }, tags: ['drop2'] },
  { key: 'm7-drop2-s4', quality: 'm7', rootString: 2, offsets: [null, null, 0, 2, 1, 1], fingers: [null, null, 1, 4, 2, 3], tags: ['drop2'] },
  { key: 'm7-drop3-s6', quality: 'm7', rootString: 0, offsets: [0, null, 0, 0, 0, null], fingers: [1, null, 2, 3, 4, null], tags: ['drop3'] },

  { key: 'm7b5-s5', quality: 'm7b5', rootString: 1, offsets: [null, 0, 1, 0, 1, null], fingers: [null, 1, 3, 2, 4, null], tags: ['drop2'] },
  { key: 'm7b5-s6', quality: 'm7b5', rootString: 0, offsets: [0, null, 0, 0, -1, null], fingers: [2, null, 3, 4, 1, null], tags: ['drop3'] },
  { key: 'dim7-s5', quality: 'dim7', rootString: 1, offsets: [null, 0, 1, -1, 1, null], fingers: [null, 2, 3, 1, 4, null], tags: ['drop2'] },
  { key: 'dim7-s6', quality: 'dim7', rootString: 0, offsets: [0, null, -1, 0, -1, null], fingers: [2, null, 1, 3, 1, null], tags: ['drop3'] },
  { key: 'mMaj7-s5', quality: 'mMaj7', rootString: 1, offsets: [null, 0, 2, 1, 1, null], fingers: [null, 1, 4, 2, 3, null], tags: ['drop2'] },

  // Extensiones y alteradas (6, m6, add9, 9, m9, maj9, 11, m11, 13, 7b9, 7#9, 7#11, 7alt)
  { key: 'maj6-s6', quality: '6', rootString: 0, offsets: [0, null, -1, 1, 0, null], fingers: [2, null, 1, 4, 3, null], tags: ['drop3'] },
  { key: 'm6-s6', quality: 'm6', rootString: 0, offsets: [0, null, -1, 0, 0, null], fingers: [2, null, 1, 3, 4, null], tags: ['drop3'] },
  { key: 'add9-s4', quality: 'add9', rootString: 2, offsets: [null, null, 0, -1, -2, 0], fingers: [null, null, 3, 2, 1, 4], tags: ['extension'] },
  { key: 'dom9-s5', quality: '9', rootString: 1, offsets: [null, 0, -1, 0, 0, null], fingers: [null, 2, 1, 3, 3, null], tags: ['extension'] },
  { key: 'm9-s5', quality: 'm9', rootString: 1, offsets: [null, 0, -2, 0, 0, null], fingers: [null, 2, 1, 3, 4, null], tags: ['extension'] },
  { key: 'maj9-s5', quality: 'maj9', rootString: 1, offsets: [null, 0, -1, 1, 0, null], fingers: [null, 2, 1, 4, 3, null], tags: ['extension'] },
  { key: 'dom11-s5', quality: '11', rootString: 1, offsets: [null, 0, 0, 0, 0, null], fingers: [null, 1, 1, 1, 1, null], barre: { from: 1, to: 4, finger: 1, offset: 0 }, tags: ['extension'] },
  { key: 'm11-s6', quality: 'm11', rootString: 0, offsets: [0, null, 0, 0, -2, null], fingers: [2, null, 3, 4, 1, null], tags: ['extension'] },
  { key: 'dom13-s6', quality: '13', rootString: 0, offsets: [0, null, 0, 1, 2, null], fingers: [1, null, 2, 3, 4, null], tags: ['extension'] },
  { key: '7b9-s5', quality: '7b9', rootString: 1, offsets: [null, 0, -1, 0, -1, null], fingers: [null, 2, 1, 3, 1, null], barre: { from: 2, to: 4, finger: 1, offset: -1 }, tags: ['alterado'] },
  { key: '7b9-s6', quality: '7b9', rootString: 0, offsets: [0, null, 0, 1, 0, 1], fingers: [1, null, 1, 2, 1, 3], barre: { from: 0, to: 4, finger: 1, offset: 0 }, tags: ['alterado'] },
  { key: '7sharp9-s5', quality: '7#9', rootString: 1, offsets: [null, 0, -1, 0, 1, null], fingers: [null, 2, 1, 3, 4, null], tags: ['alterado'] },
  { key: '7sharp11-s6', quality: '7#11', rootString: 0, offsets: [0, null, 0, 1, -1, null], fingers: [2, null, 3, 4, 1, null], tags: ['alterado'] },
  { key: '7alt-s6', quality: '7alt', rootString: 0, offsets: [0, null, 0, 1, 1, null], fingers: [1, null, 2, 3, 4, null], tags: ['alterado'] }
];

/**
 * Plantillas idiomáticas de acordes para bajo eléctrico (4 cuerdas E1 A1 D2 G2, adaptables a 5 cuerdas B0 E1 A1 D2 G2).
 * Respetan el Low Interval Limit (minRootMidi): décimas (R-10 / R-b10), tríadas abiertas (R-5-10),
 * shells (R-7-10 / R-3-7), tríadas e inversiones en registro agudo, díadas de notas guía (3-7) y extensiones.
 */
export const MOVABLE_BASS_TEMPLATES = [
  // Décimas (el acorde más clásico y claro del bajo: raíz en E + 10ª en G)
  { key: 'bass-10th-maj', quality: '', rootString: 0, offsets: [0, null, null, 1], fingers: [1, null, null, 2], minRootMidi: 28, tags: ['decima', 'diada'] },
  { key: 'bass-10th-min', quality: 'm', rootString: 0, offsets: [0, null, null, 0], fingers: [1, null, null, 2], minRootMidi: 28, tags: ['decima', 'diada'] },

  // Power chords y octavas limpias
  { key: 'bass-5-dyad', quality: '5', rootString: 1, offsets: [null, 0, 2, null], fingers: [null, 1, 3, null], minRootMidi: 33, tags: ['power', 'diada'] },
  { key: 'bass-5-oct', quality: '5', rootString: 1, offsets: [null, 0, 2, 2], fingers: [null, 1, 3, 4], minRootMidi: 35, tags: ['power'] },

  // Tríadas abiertas (R - 5 - 10)
  { key: 'bass-triad-open-maj', quality: '', rootString: 0, offsets: [0, 2, null, 1], fingers: [1, 3, null, 2], minRootMidi: 33, tags: ['triada', 'decima'] },
  { key: 'bass-triad-open-min', quality: 'm', rootString: 0, offsets: [0, 2, null, 0], fingers: [1, 3, null, 2], minRootMidi: 33, tags: ['triada', 'decima'] },

  // Tríadas en registro agudo e inversiones (cuerdas A-D-G, evitando barro grave)
  { key: 'bass-triad-hi-maj-root', quality: '', rootString: 1, offsets: [null, 0, -1, -3], fingers: [null, 4, 3, 1], minRootMidi: 41, tags: ['triada', 'inversion'] },
  { key: 'bass-triad-hi-maj-inv1', quality: '', rootString: 3, offsets: [null, 2, 0, 0], fingers: [null, 3, 1, 1], barre: { from: 2, to: 3, finger: 1, offset: 0 }, minRootMidi: 46, tags: ['triada', 'inversion'] },
  { key: 'bass-triad-hi-maj-inv2', quality: '', rootString: 2, offsets: [null, 0, 0, -1], fingers: [null, 2, 3, 1], minRootMidi: 44, tags: ['triada', 'inversion'] },
  { key: 'bass-triad-hi-min-inv1', quality: 'm', rootString: 3, offsets: [null, 1, 0, 0], fingers: [null, 2, 1, 1], barre: { from: 2, to: 3, finger: 1, offset: 0 }, minRootMidi: 46, tags: ['triada', 'inversion'] },
  { key: 'bass-triad-hi-min-inv2', quality: 'm', rootString: 2, offsets: [null, 0, 0, -2], fingers: [null, 3, 4, 1], minRootMidi: 44, tags: ['triada', 'inversion'] },

  // Díadas y tríadas de inversión / slash chords en bajo (bajo en 3ª, 5ª o b7)
  { key: 'bass-inv1-maj-dyad', quality: '', rootString: 3, offsets: [null, 2, null, 0], fingers: [null, 3, null, 1], minRootMidi: 46, tags: ['diada', 'inversion'] },
  { key: 'bass-inv1-min-dyad', quality: 'm', rootString: 2, offsets: [1, null, 0, null], fingers: [2, null, 1, null], minRootMidi: 43, tags: ['diada', 'inversion'] },
  { key: 'bass-inv3-min-slash', quality: 'm', rootString: 3, offsets: [1, 1, null, 0], fingers: [2, 3, null, 1], minRootMidi: 48, tags: ['triada', 'inversion'], allowSlashSeven: true },

  // Disminuidas, aumentadas y suspendidas
  { key: 'bass-dim-triad', quality: 'dim', rootString: 0, offsets: [0, 1, null, 0], fingers: [1, 2, null, 1], minRootMidi: 36, tags: ['triada', 'decima'] },
  { key: 'bass-aug-triad', quality: 'aug', rootString: 0, offsets: [0, 3, null, 1], fingers: [1, 4, null, 2], minRootMidi: 33, tags: ['triada', 'decima'] },
  { key: 'bass-sus4-e', quality: 'sus4', rootString: 0, offsets: [0, 2, null, 2], fingers: [1, 3, null, 4], minRootMidi: 33, tags: ['triada'] },
  { key: 'bass-sus2-a', quality: 'sus2', rootString: 1, offsets: [null, 0, 2, 4], fingers: [null, 1, 2, 4], minRootMidi: 38, tags: ['triada'] },

  // Shell voicings de séptima (R-7-10 en cuerda E y R-3-7 en cuerda A)
  { key: 'bass-shell-maj7-e', quality: 'maj7', rootString: 0, offsets: [0, null, 1, 1], fingers: [1, null, 2, 3], minRootMidi: 33, tags: ['shell'] },
  { key: 'bass-shell-maj7-a', quality: 'maj7', rootString: 1, offsets: [null, 0, -1, 1], fingers: [null, 2, 1, 4], minRootMidi: 38, tags: ['shell'] },
  { key: 'bass-guide-maj7', quality: 'maj7', rootString: 1, offsets: [null, null, -1, 1], fingers: [null, null, 1, 3], minRootMidi: 38, tags: ['guias', 'diada'] },

  { key: 'bass-shell-7-e', quality: '7', rootString: 0, offsets: [0, null, 0, 1], fingers: [1, null, 2, 3], minRootMidi: 33, tags: ['shell'] },
  { key: 'bass-shell-7-a', quality: '7', rootString: 1, offsets: [null, 0, -1, 0], fingers: [null, 2, 1, 3], minRootMidi: 38, tags: ['shell'] },
  { key: 'bass-guide-7', quality: '7', rootString: 1, offsets: [null, null, -1, 0], fingers: [null, null, 1, 2], minRootMidi: 38, tags: ['guias', 'diada'] },

  { key: 'bass-shell-m7-e', quality: 'm7', rootString: 0, offsets: [0, null, 0, 0], fingers: [1, null, 2, 3], minRootMidi: 33, tags: ['shell'] },
  { key: 'bass-shell-m7-a', quality: 'm7', rootString: 1, offsets: [null, 0, -2, 0], fingers: [null, 3, 1, 4], minRootMidi: 40, tags: ['shell'] },
  { key: 'bass-guide-m7', quality: 'm7', rootString: 1, offsets: [null, null, -2, 0], fingers: [null, null, 1, 3], minRootMidi: 40, tags: ['guias', 'diada'] },

  { key: 'bass-shell-m7b5-a', quality: 'm7b5', rootString: 1, offsets: [null, 0, 1, 0], fingers: [null, 1, 3, 2], minRootMidi: 38, tags: ['shell'] },
  { key: 'bass-full-m7b5-e', quality: 'm7b5', rootString: 0, offsets: [0, 1, 0, 0], fingers: [1, 2, 1, 1], barre: { from: 0, to: 3, finger: 1, offset: 0 }, minRootMidi: 36, tags: ['shell'] },
  { key: 'bass-shell-dim7-e', quality: 'dim7', rootString: 0, offsets: [0, null, -1, 0], fingers: [2, null, 1, 3], minRootMidi: 33, tags: ['shell'] },
  { key: 'bass-shell-mMaj7-e', quality: 'mMaj7', rootString: 0, offsets: [0, null, 1, 0], fingers: [1, null, 3, 2], minRootMidi: 33, tags: ['shell'] },

  // Extensiones y acordes de color en bajo (6, m6, add9, 9, m9, maj9, 13)
  { key: 'bass-6-e', quality: '6', rootString: 0, offsets: [0, null, -1, 1], fingers: [2, null, 1, 3], minRootMidi: 33, tags: ['extension', 'shell'] },
  { key: 'bass-m6-e', quality: 'm6', rootString: 0, offsets: [0, null, -1, 0], fingers: [2, null, 1, 3], minRootMidi: 33, tags: ['extension', 'shell'] },
  { key: 'bass-add9-a', quality: 'add9', rootString: 1, offsets: [null, 0, 2, 4], fingers: [null, 1, 2, 4], minRootMidi: 38, tags: ['extension'] },
  { key: 'bass-9-shell-e', quality: '9', rootString: 0, offsets: [0, null, 0, -1], fingers: [2, null, 3, 1], minRootMidi: 33, tags: ['extension', 'shell'] },
  { key: 'bass-m9-shell-e', quality: 'm9', rootString: 0, offsets: [0, null, 0, -1], fingers: [2, null, 3, 1], minRootMidi: 33, tags: ['extension', 'shell'] },
  { key: 'bass-maj9-shell-e', quality: 'maj9', rootString: 0, offsets: [0, null, 1, -1], fingers: [2, null, 3, 1], minRootMidi: 33, tags: ['extension', 'shell'] },
  { key: 'bass-9-full-e', quality: '9', rootString: 0, offsets: [0, -1, 0, -1], fingers: [2, 1, 4, 3], minRootMidi: 41, tags: ['extension'] },
  { key: 'bass-m9-full-e', quality: 'm9', rootString: 0, offsets: [0, -2, 0, -1], fingers: [3, 1, 4, 2], minRootMidi: 41, tags: ['extension'] },
  { key: 'bass-maj9-full-e', quality: 'maj9', rootString: 0, offsets: [0, -1, 1, -1], fingers: [3, 1, 4, 2], minRootMidi: 41, tags: ['extension'] },
  { key: 'bass-13-rootless-a', quality: '13', rootString: 1, offsets: [null, -2, -1, -1], fingers: [null, 1, 2, 3], minRootMidi: 40, tags: ['extension', 'guias'] }
];

/**
 * Instancia una plantilla móvil en la posición correcta del mango para la raíz y afinación dadas.
 * Soporta bajo de 4 y 5 cuerdas (mapeando plantillas de 4 cuerdas sobre las 4 agudas E-A-D-G),
 * respeta el Low Interval Limit (`minRootMidi`) y valida que cada nota resultante pertenezca al acorde.
 * @param {object} tpl Plantilla móvil.
 * @param {Chord} chordObj Acorde destino.
 * @param {Tuning} tuning Afinación destino.
 * @returns {Voicing|null} Voicing válido o null si no cabe o no coincide con la afinación.
 */
function instantiateMovableTemplate(tpl, chordObj, tuning) {
  const isBass = tuning.instrument === 'bass';
  // En bajo de 5 cuerdas (B E A D G), desplaza las plantillas de 4 cuerdas hacia las 4 cuerdas agudas (E A D G)
  const stringPad = isBass && tuning.stringCount > tpl.offsets.length
    ? tuning.stringCount - tpl.offsets.length
    : 0;

  const targetRootString = tpl.rootString + stringPad;
  const openMidi = tuning.strings[targetRootString];
  if (openMidi === undefined) return null;

  const nonNullOffsets = tpl.offsets.filter((o) => o !== null);
  const minOffset = Math.min(...nonNullOffsets);
  const maxOffset = Math.max(...nonNullOffsets);

  let rootFret = mod12(chordObj.rootPc - mod12(openMidi));
  const minAllowedFret = isBass ? 0 : 1;
  while (rootFret + minOffset < minAllowedFret) rootFret += 12;

  // Respeta el Low Interval Limit en bajo subiendo una octava si la raíz queda demasiado grave
  if (isBass && tpl.minRootMidi) {
    while (openMidi + rootFret < tpl.minRootMidi) {
      rootFret += 12;
    }
  }

  const maxRootFret = isBass ? 17 : 15;
  const maxAbsoluteFret = isBass ? 19 : 17;
  if (rootFret > maxRootFret || rootFret + maxOffset > maxAbsoluteFret) return null;

  const frets = Array(tuning.stringCount).fill(null);
  const fingers = Array(tuning.stringCount).fill(null);
  tpl.offsets.forEach((o, i) => {
    const destIdx = i + stringPad;
    if (destIdx >= tuning.stringCount) return;
    frets[destIdx] = o === null ? null : rootFret + o;
    fingers[destIdx] = tpl.fingers[i] ?? null;
  });

  if (frets.some((f) => f !== null && (f < 0 || f > maxAbsoluteFret))) return null;

  // Verifica que todas las notas sonantes pertenezcan realmente al acorde (protege contra afinaciones alternativas)
  const allowedPcs = new Set(chordObj.getPitchClasses());
  if (chordObj.bassPc !== null) allowedPcs.add(chordObj.bassPc);
  if (tpl.allowSlashSeven) allowedPcs.add(mod12(chordObj.rootPc + 10));

  for (let s = 0; s < tuning.stringCount; s++) {
    const midi = tuning.getMidiAt(s, frets[s]);
    if (midi !== null && !allowedPcs.has(mod12(midi))) {
      return null;
    }
  }

  const fretted = frets.filter((f) => f !== null && f > 0);
  const baseFret = fretted.length > 0 && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
  const barreFret = tpl.barre ? rootFret + (tpl.barre.offset || 0) : null;
  const barres = tpl.barre && barreFret > 0
    ? [{
        fret: barreFret,
        fromString: tpl.barre.from + stringPad,
        toString: tpl.barre.to + stringPad,
        finger: tpl.barre.finger
      }]
    : [];

  const v = new Voicing({
    id: `${chordObj.americanSymbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${tpl.key}-f${rootFret}`,
    chord: chordObj.americanSymbol,
    instrument: tuning.instrument,
    frets,
    fingers,
    baseFret,
    barres,
    tags: [...tpl.tags],
    movable: true
  });
  v.inversion = v.computeInversion(tuning);
  v.bassNote = v.computeBassNote(tuning, 'americano');
  return v;
}

/**
 * Devuelve todos los voicings curados (abiertos + formas móviles transportadas) para un acorde y afinación.
 * @param {string} chordSymbol Símbolo americano (ej. "C", "Am7", "F#m7b5", "C/E").
 * @param {'guitar'|'bass'|'guitarra'|'guitarra-clasica'|'bajo'} [instrument='guitar'] Instrumento.
 * @param {Tuning} [tuning] Afinación opcional.
 * @returns {Voicing[]} Lista curada sin duplicados de trastes.
 */
export function getCuratedVoicingsForChord(chordSymbol, instrument = 'guitar', tuning = null) {
  const isBass = instrument === 'bass' || instrument === 'bajo';
  const activeTuning = tuning || Tuning.defaultForInstrument(isBass ? 'bass' : 'guitar');
  const chordObj = Chord.parse(chordSymbol);
  const results = [];
  const seenKeys = new Set();

  const pushUnique = (v) => {
    const key = v.frets.map((f) => (f === null ? 'x' : f)).join('-');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push(v);
  };

  // 1) Formas abiertas curadas exactas (para afinación estándar de guitarra)
  if (!isBass && activeTuning.id === 'guitar-standard') {
    for (const raw of CURATED_OPEN_VOICINGS) {
      if (raw.chord === chordObj.americanSymbol) {
        const v = new Voicing(raw);
        v.inversion = v.computeInversion(activeTuning);
        v.bassNote = v.computeBassNote(activeTuning, 'americano');
        pushUnique(v);
      }
    }
  }

  // 2) Formas móviles curadas para esa calidad (validando bajo slash y compatibilidad con afinación)
  const templates = isBass ? MOVABLE_BASS_TEMPLATES : MOVABLE_GUITAR_TEMPLATES;
  for (const tpl of templates) {
    if (tpl.quality !== chordObj.quality.id) continue;
    if (tpl.allowSlashSeven && chordObj.bassPc !== mod12(chordObj.rootPc + 10)) continue;
    const v = instantiateMovableTemplate(tpl, chordObj, activeTuning);
    if (!v) continue;
    if (chordObj.bassPc !== null) {
      const midis = v.getMidiNotes(activeTuning);
      if (midis.length === 0 || mod12(Math.min(...midis)) !== chordObj.bassPc) {
        continue;
      }
    }
    pushUnique(v);
  }

  return results;
}

/**
 * Busca un voicing por su ID entre los curados, los personalizados de una práctica o los móviles generables.
 * @param {string} voicingId Identificador del voicing.
 * @param {Voicing[]} [customVoicings=[]] Voicings incrustados en la práctica.
 * @param {string} [fallbackChord='C'] Acorde de respaldo si el ID no existe.
 * @param {string} [instrument='guitar'] Instrumento de respaldo.
 * @param {Tuning|null} [tuning=null] Afinación opcional.
 * @returns {Voicing|null} Voicing encontrado o mejor coincidencia curada.
 */
export function findVoicingById(voicingId, customVoicings = [], fallbackChord = null, instrument = 'guitar', tuning = null) {
  if (voicingId) {
    const custom = (customVoicings || []).find((v) => v.id === voicingId);
    if (custom) return custom instanceof Voicing ? custom : new Voicing(custom);

    const open = CURATED_OPEN_VOICINGS.find((v) => v.id === voicingId);
    if (open) return new Voicing(open);
  }

  if (fallbackChord) {
    const list = getCuratedVoicingsForChord(fallbackChord, instrument, tuning);
    if (voicingId) {
      const exact = list.find((v) => v.id === voicingId);
      if (exact) return exact;
    }
    if (list.length > 0) return list[0];
  }

  return null;
}
