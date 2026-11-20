import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Voicing } from '../models/Voicing.js';

/**
 * Servicio puro de dominio para la Biblioteca de Acordes, filtrado/agrupación de voicings
 * y cálculo de recorridos de inversiones en guitarra y bajo (4 y 5 cuerdas).
 */
export class ChordLibraryService {
  /**
   * Genera digitaciones adicionales mediante `VoicingGenerator` sobre juegos de cuerdas idiomáticos.
   * @param {import('./VoicingGenerator.js').VoicingGenerator} voicingGenerator Generador de voicings.
   * @param {string} symbol Símbolo americano del acorde.
   * @param {import('../models/Tuning.js').Tuning} tuning Afinación activa.
   * @returns {Voicing[]} Lista de voicings únicos sugeridos.
   */
  generateSuggestedVoicings(voicingGenerator, symbol, tuning) {
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
        const list = voicingGenerator.generate(symbol, {
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
    return all;
  }

  /**
   * Combina "Mis acordes" + voicings curados + generados (con respaldo automático si no hay curados)
   * y aplica los filtros activos de tipo, inversión y rango de trastes.
   * @param {object} params Parámetros de búsqueda y filtrado.
   * @returns {Voicing[]} Lista final filtrada de voicings.
   */
  computeFilteredVoicings({
    symbol,
    tuning,
    customChords = [],
    generatedVoicings = [],
    voicingGenerator,
    typeFilter = 'todos',
    inversionFilter = 'todas',
    fretRangeFilter = 'todos'
  }) {
    const fam = tuning.instrument;
    const curated = getCuratedVoicingsForChord(symbol, fam, tuning);

    const userSaved = (customChords || [])
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
    (generatedVoicings || []).forEach(addIfUnique);

    if (combined.length === 0 && voicingGenerator) {
      try {
        const pad = fam === 'bass' ? Math.max(0, tuning.stringCount - 4) : 0;
        const autoSets = fam === 'bass'
          ? [[pad + 0, pad + 2, pad + 3], [pad + 1, pad + 2, pad + 3], [pad + 0, pad + 3]]
          : [[1, 2, 3, 4], [2, 3, 4]];
        for (const autoSet of autoSets) {
          const auto = voicingGenerator.generate(symbol, {
            tuning,
            stringSet: autoSet,
            allowSkippedStrings: fam === 'bass',
            maxFret: fam === 'bass' ? 17 : 12,
            limit: 6
          });
          auto.forEach(addIfUnique);
          if (combined.length >= 6) break;
        }
      } catch {
        // Sin resultados generados
      }
    }

    return combined.filter((v) => {
      if (typeFilter !== 'todos') {
        if (typeFilter === 'sugerido' && !v.suggested) return false;
        if (typeFilter !== 'sugerido' && !v.tags.includes(typeFilter)) return false;
      }
      if (inversionFilter !== 'todas' && v.computeInversion(tuning) !== Number(inversionFilter)) {
        return false;
      }
      if (fretRangeFilter === 'abierto' && v.baseFret > 2) return false;
      if (fretRangeFilter === 'medio' && (v.baseFret < 3 || v.baseFret > 7)) return false;
      if (fretRangeFilter === 'agudo' && v.baseFret < 8) return false;
      return true;
    });
  }

  /**
   * Agrupa una lista de voicings por familia pedagógica y ordena cada grupo ascendiendo por el mango.
   * @param {Voicing[]} voicingsList Lista plana de voicings filtrados.
   * @param {boolean} isBass True si corresponde al instrumento bajo.
   * @returns {Array<{ id: string, label: string, items: Array<{ voicing: Voicing, flatIndex: number }> }>} Grupos ordenados.
   */
  groupVoicingsByFamily(voicingsList, isBass) {
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
    (voicingsList || []).forEach((v, flatIndex) => {
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
   * Devuelve todos los voicings disponibles (curados + respaldo generado) para un slot del Entrenador de Cambios.
   * @param {object} params Parámetros de búsqueda.
   * @returns {Voicing[]} Voicings utilizables.
   */
  getTrainerSlotVoicings({ chordSymbol, tuning, voicingGenerator }) {
    const fam = tuning.instrument;
    const curated = getCuratedVoicingsForChord(chordSymbol, fam, tuning);
    if (curated.length > 0) return curated;
    try {
      const pad = fam === 'bass' ? Math.max(0, tuning.stringCount - 4) : 0;
      const set = fam === 'bass' ? [pad + 0, pad + 2, pad + 3] : [1, 2, 3, 4];
      return voicingGenerator.generate(chordSymbol, {
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
   * Calcula las inversiones y posiciones ejecutables de un acorde subiendo por el diapasón
   * para guitarra o bajo (4 y 5 cuerdas).
   * @param {object} params Parámetros del recorrido de inversiones.
   * @returns {Voicing[]} Hasta 6 posiciones ordenadas ascendiendo por el mango.
   */
  computeInversionWalkVoicings({ symbol, tuning, mode, voicingGenerator }) {
    const isBass = tuning.instrument === 'bass';
    const pad = isBass ? Math.max(0, tuning.stringCount - 4) : 0;

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
          voicingGenerator
            .generate(symbol, {
              tuning,
              stringSet: sSet,
              allowSkippedStrings: true,
              allowRootless: cfg.allowRootless,
              minFret: cfg.minFret,
              maxFret: 17,
              maxSpan: 4,
              limit: 12
            })
            .forEach(pushUnique);
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
        voicingGenerator
          .generate(symbol, {
            tuning,
            stringSet,
            maxSpan: 4,
            maxFret: 15,
            limit: 16
          })
          .forEach(pushUnique);
      } catch {
        // Sin resultados
      }
    }

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
}
