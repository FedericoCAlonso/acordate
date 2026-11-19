import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice, validatePracticeSchema } from '../src/models/Practice.js';
import { LEVELS, getLevelByNumber } from '../src/models/Level.js';
import { Exercise } from '../src/models/Exercise.js';
import { UserProgress } from '../src/models/UserProgress.js';
import { Settings } from '../src/models/Settings.js';
import { loadBuiltinCatalog } from '../src/data/catalog.js';

/**
 * Construye un objeto de práctica válido de ejemplo para reutilizar en tests de modelos.
 * @param {object} [overrides={}] Campos a sobrescribir.
 * @returns {object} Práctica válida.
 */
function samplePracticeData(overrides = {}) {
  return {
    id: 'test-practice-01',
    version: 1,
    title: 'Blues en F de prueba',
    instruments: ['bajo'],
    category: 'walking',
    level: 4,
    tags: ['blues', 'jazz'],
    key: 'F',
    timeSignature: '4/4',
    tempo: { start: 60, target: 120, step: 5 },
    abc: 'X:1\nT:Blues en F\nM:4/4\nL:1/4\nK:F clef=bass\n"F7"F, A, C _E | "Bb7"B,, D, F, A, |]',
    fingerings: { '1': '1' },
    goals: ['Mantener pulso estable'],
    notes: 'Tocá la raíz en el primer tiempo.',
    origin: 'builtin',
    createdAt: '2026-11-19T00:00:00Z',
    ...overrides
  };
}

test('validatePracticeSchema acepta una práctica válida y rechaza campos inválidos', () => {
  const valid = validatePracticeSchema(samplePracticeData());
  assert.equal(valid.valid, true);
  assert.equal(valid.errors.length, 0);

  const invalid = validatePracticeSchema(
    samplePracticeData({
      title: 'A',
      instruments: ['bateria'],
      level: 8,
      tempo: { start: 140, target: 90, step: 5 },
      abc: 'sin cabecera'
    })
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length >= 4);
});

test('Practice protege prácticas builtin y permite duplicar como editable de usuario', () => {
  const p = new Practice(samplePracticeData({ origin: 'builtin' }));
  assert.equal(p.isReadOnly, true);
  assert.equal(p.getDefaultSynthInstrument(), 'acoustic-bass');

  const copy = p.duplicateAsUser();
  assert.equal(copy.isReadOnly, false);
  assert.equal(copy.origin, 'user');
  assert.notEqual(copy.id, p.id);
  assert.match(copy.title, /\(copia\)/);
});

test('El catálogo incluido cumple el esquema, cubre 5 niveles x 3 instrumentos x 4 categorías y no contiene tablatura', async () => {
  const catalog = await loadBuiltinCatalog();
  assert.ok(catalog.length >= 60, `Se esperaban >= 60 prácticas, hay ${catalog.length}`);

  const instruments = ['guitarra-clasica', 'guitarra', 'bajo'];
  const categories = ['escala', 'acordes', 'lectura', 'ritmo'];

  for (const pr of catalog) {
    const check = validatePracticeSchema(pr.toJSON());
    assert.equal(check.valid, true, `Práctica inválida ${pr.id}: ${check.errors.join(', ')}`);
    assert.equal(/tablature|tablatura/i.test(pr.abc), false, `No debe haber tablatura en ${pr.id}`);
  }

  for (let lvl = 1; lvl <= 5; lvl++) {
    for (const inst of instruments) {
      for (const cat of categories) {
        const matches = catalog.filter(
          (p) => p.level === lvl && p.instruments.includes(inst) && p.category === cat
        );
        assert.ok(
          matches.length >= 1,
          `Falta práctica para nivel ${lvl}, instrumento ${inst}, categoría ${cat}`
        );
      }
    }
  }
});

test('Exercise extrae compases, acordes y compás desde ABC', () => {
  const ex = new Exercise({
    practiceId: 'ex-1',
    abc: 'X:1\nT:Test\nM:3/4\nL:1/4\nK:G\n"G"G B d | "C"c e g | "D7"d f a | "G"g3 |]',
    key: 'G',
    timeSignature: '3/4'
  });
  assert.equal(ex.timeSignature, '3/4');
  assert.equal(ex.measureCount, 4);
  assert.equal(ex.hasChords, true);
  assert.deepEqual(ex.getUniqueChords(), ['G', 'C', 'D7']);
});

test('UserProgress registra sesiones, racha, resumen semanal y desbloqueo/salto de niveles', () => {
  const progress = new UserProgress();
  const practices = [
    new Practice(samplePracticeData({ id: 'l1-a', level: 1, tempo: { start: 60, target: 80, step: 5 } })),
    new Practice(samplePracticeData({ id: 'l1-b', level: 1, tempo: { start: 60, target: 80, step: 5 } })),
    new Practice(samplePracticeData({ id: 'l2-a', level: 2, tempo: { start: 80, target: 100, step: 5 } }))
  ];

  // Inicialmente solo Nivel 1 está desbloqueado
  let status = progress.getLevelsStatus(practices);
  assert.equal(status[1].unlocked, true);
  assert.equal(status[2].unlocked, false);

  const day1 = new Date(2026, 10, 18, 15, 0, 0);
  const day2 = new Date(2026, 10, 19, 15, 0, 0);

  progress.recordSession({ practiceId: 'l1-a', bpm: 80, targetBpm: 80, repetitions: 3, studySeconds: 120, date: day1 });
  progress.recordSession({ practiceId: 'l1-b', bpm: 84, targetBpm: 80, repetitions: 2, studySeconds: 180, date: day2 });

  // Al alcanzar el objetivo en las 2 prácticas clave de nivel 1, desbloquea nivel 2
  status = progress.getLevelsStatus(practices);
  assert.equal(status[2].unlocked, true);
  assert.equal(status[3].unlocked, false);

  // Saltar manualmente al nivel 4 desbloquea 2, 3 y 4
  progress.skipToLevel(4);
  status = progress.getLevelsStatus(practices);
  assert.equal(status[4].unlocked, true);
  assert.equal(status[4].skipped, true);

  assert.equal(progress.getCurrentStreak(day2), 2);
  const weekly = progress.getWeeklySummary(day2);
  assert.equal(weekly.length, 7);
  assert.equal(weekly[6].studySeconds, 180);

  const restored = new UserProgress(progress.toJSON());
  assert.equal(restored.getPracticeStats('l1-b').bestBpm, 84);
  assert.equal(restored.getTotals().targetsReached, 2);
});

test('Settings aplica defaults válidos y withPatch devuelve nueva instancia inmutable', () => {
  const s = new Settings({ theme: 'invalido', chordNotation: 'latino', seedColor: '#2E6F5E' });
  assert.equal(s.theme, 'auto');
  assert.equal(s.chordNotation, 'latino');
  assert.equal(s.seedColor, '#2E6F5E');

  const s2 = s.withPatch({ theme: 'dark', wakeLockEnabled: false });
  assert.equal(s.theme, 'auto');
  assert.equal(s2.theme, 'dark');
  assert.equal(s2.wakeLockEnabled, false);
  assert.equal(LEVELS.length, 5);
  assert.equal(getLevelByNumber(3).name, 'Desarrollo');
});
