import { LEVELS } from '../models/Level.js';

/**
 * Orden pedagógico de áreas (melódicas y armónicas) dentro de cada nivel.
 */
export const AREA_ORDER = [
  'escala',
  'tecnica',
  'acordes',
  'formas',
  'cambios',
  'inversiones',
  'conduccion-de-voces',
  'campo-armonico',
  'acompanamiento',
  'arpegios-de-acorde',
  'lectura',
  'ritmo',
  'walking',
  'arpegio',
  'oido',
  'repertorio'
];

/**
 * Filtra una lista de prácticas por tipo, nivel, categoría, origen, etiqueta y búsqueda libre.
 * @param {import('../models/Practice.js').Practice[]} practices Lista base del instrumento.
 * @param {object} filters Criterios de filtrado.
 * @returns {import('../models/Practice.js').Practice[]} Lista ordenada por nivel y título.
 */
export function filterPractices(practices, filters = {}) {
  const typeF = filters.type || 'todos';
  const lvl = filters.level ?? 'todos';
  const cat = filters.category || 'todos';
  const origin = filters.origin || 'todos';
  const tag = String(filters.tag || '').trim().toLowerCase();
  const query = String(filters.query || '').trim().toLowerCase();

  return (practices || [])
    .filter((p) => {
      if (typeF !== 'todos' && p.type !== typeF) return false;
      if (lvl !== 'todos' && p.level !== Number(lvl)) return false;
      if (cat !== 'todos' && p.category !== cat) return false;
      if (origin !== 'todos' && p.origin !== origin) return false;
      if (tag && !p.tags.some((t) => t.toLowerCase() === tag)) return false;
      if (query) {
        const haystack = `${p.title} ${p.key} ${p.tags.join(' ')} ${p.notes}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'es-AR'));
}

/**
 * Selecciona la práctica para la tarjeta "Continuar" del instrumento activo.
 * @param {import('../models/Practice.js').Practice[]} list Prácticas del instrumento.
 * @param {import('../models/UserProgress.js').UserProgress} prog Progreso del usuario.
 * @param {string} instrument Instrumento seleccionado.
 * @returns {{ practice: object, stats: object, isFresh: boolean }|null} Tarjeta "Continuar".
 */
export function pickContinueCard(list, prog, instrument) {
  if (!list || list.length === 0) return null;
  const lastId = prog.lastPracticeByInstrument[instrument];
  let target = lastId ? list.find((p) => p.id === lastId) : null;

  if (!target) {
    let latest = null;
    let latestTime = '';
    for (const p of list) {
      const st = prog.getPracticeStats(p.id);
      if (st.lastSessionAt && st.lastSessionAt > latestTime) {
        latestTime = st.lastSessionAt;
        latest = p;
      }
    }
    target = latest || list[0];
  }

  return {
    practice: target,
    stats: prog.getPracticeStats(target.id),
    isFresh: prog.getPracticeStatus(target.id, target.tempo.target) === 'nueva'
  };
}

/**
 * Construye la rutina sugerida "Sesión de hoy" (~15 minutos) adaptada al nivel en curso.
 * @param {import('../models/Practice.js').Practice[]} list Prácticas del instrumento activo.
 * @param {Record<number, object>} statusMap Estado de desbloqueo por nivel.
 * @param {import('../models/UserProgress.js').UserProgress} prog Progreso del usuario.
 * @returns {{ title: string, totalMinutes: number, items: Array<object> }} Rutina sugerida.
 */
export function buildTodayRoutine(list, statusMap, prog) {
  if (!list || list.length === 0) return { title: 'Sesión de hoy', totalMinutes: 0, items: [] };

  let activeLevel = 1;
  for (const lvl of LEVELS) {
    const st = statusMap[lvl.number];
    if (st?.unlocked) {
      activeLevel = lvl.number;
      if (!st.completed) break;
    }
  }

  const levelPool = list.filter((p) => p.level === activeLevel);
  const pool = levelPool.length >= 4 ? levelPool : list;

  const pickByCategory = (cats) => {
    const candidates = pool.filter((p) => cats.includes(p.category));
    if (candidates.length === 0) return null;
    return candidates.find((p) => prog.getPracticeStatus(p.id, p.tempo.target) !== 'dominada') || candidates[0];
  };

  const plan = [
    { role: 'Calentamiento', cats: ['escala', 'arpegio'], minutes: 3 },
    { role: 'Acordes', cats: ['acordes'], minutes: 4 },
    { role: 'Lectura', cats: ['lectura'], minutes: 4 },
    { role: 'Ritmo / Groove', cats: ['ritmo', 'walking'], minutes: 4 }
  ];

  const items = [];
  const usedIds = new Set();
  for (const slot of plan) {
    const found = pickByCategory(slot.cats);
    if (found && !usedIds.has(found.id)) {
      usedIds.add(found.id);
      items.push({ role: slot.role, practice: found, practiceId: found.id, minutes: slot.minutes });
    }
  }

  return {
    title: `Sesión de hoy (Nivel ${activeLevel})`,
    totalMinutes: items.reduce((acc, it) => acc + it.minutes, 0),
    items
  };
}

/**
 * Agrupa prácticas filtradas en la ruta de 5 niveles con subgrupos por área pedagógica.
 * @param {import('../models/Practice.js').Practice[]} items Prácticas filtradas.
 * @param {Record<number, object>} statusMap Estado por nivel.
 * @returns {Array<object>} Niveles agrupados con áreas y estado.
 */
export function groupPracticesByLevel(items, statusMap) {
  return LEVELS.map((level) => {
    const levelPractices = items.filter((p) => p.level === level.number);
    const areas = AREA_ORDER.map((area) => ({
      area,
      practices: levelPractices.filter((p) => p.category === area)
    })).filter((g) => g.practices.length > 0);

    return {
      level,
      status: statusMap[level.number] || {
        unlocked: level.number === 1,
        completed: false,
        completedCount: 0,
        requiredCount: 2,
        remainingToUnlock: 2,
        totalPractices: levelPractices.length,
        skipped: false
      },
      practices: levelPractices,
      areas
    };
  });
}
