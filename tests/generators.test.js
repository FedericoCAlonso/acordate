import test from 'node:test';
import assert from 'node:assert/strict';
import { ScaleGenerator } from '../src/services/ScaleGenerator.js';
import { ProgressionGenerator } from '../src/services/ProgressionGenerator.js';
import { WalkingBassGenerator } from '../src/services/WalkingBassGenerator.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { mod12, parseChord } from '../src/core/MusicTheory.js';
import { UserProgress } from '../src/models/UserProgress.js';

test('ScaleGenerator genera escalas, modos y arpegios válidos para guitarra y bajo', () => {
  const gen = new ScaleGenerator();

  const majorG = gen.generate({
    key: 'G',
    type: 'mayor',
    octaves: 2,
    rhythm: 'corcheas',
    direction: 'asc-desc',
    instrument: 'guitarra'
  });
  assert.match(majorG.abc, /K:G clef=treble-8/);
  assert.equal(majorG.midiNotes.length, 29); // 15 asc + 14 desc

  const dorianBass = gen.generate({
    key: 'D',
    type: 'dorico',
    octaves: 1,
    rhythm: 'tresillos',
    direction: 'asc',
    instrument: 'bajo'
  });
  assert.match(dorianBass.abc, /clef=bass/);
  assert.ok(dorianBass.abc.includes('(3'));
  assert.equal(dorianBass.midiNotes.length, 8);
});

test('ProgressionGenerator resuelve grados romanos y produce cifrado + melodía de notas guía', () => {
  const gen = new ProgressionGenerator();

  const chords = gen.resolveDegreesToChords(['ii7', 'V7', 'Imaj7'], 'Bb');
  assert.deepEqual(chords, ['Cm7', 'F7', 'Bbmaj7']);

  const res = gen.generate({
    templateId: 'blues-12',
    key: 'F',
    instrument: 'guitarra',
    pattern: 'blancas'
  });
  assert.equal(res.chords.length, 12);
  assert.equal(res.chords[0], 'F7');
  assert.equal(res.chords[1], 'Bb7');
  assert.equal(res.chords[8], 'C7');
  assert.ok(res.abc.includes('"F7"'));
  assert.ok(res.abc.includes('"Bb7"'));
  assert.ok(res.abc.includes('"C7"'));
});

test('WalkingBassGenerator cumple todas las reglas musicales: raíz en 1, notas del acorde en 2-3, aproximación en 4, salto <= 6ª y sin repeticiones', () => {
  const gen = new WalkingBassGenerator();
  const chords = ['F7', 'Bb7', 'F7', 'Cm7', 'F7', 'Bb7', 'Bdim7', 'F7', 'D7', 'Gm7', 'C7', 'F7'];

  const res = gen.generate({
    chords,
    key: 'F',
    variant: 'clasico',
    approach: 'cromatica'
  });

  assert.match(res.abc, /K:F clef=bass/);
  assert.equal(res.measures.length, chords.length);

  for (let i = 0; i < res.measures.length; i++) {
    const m = res.measures[i];
    const parsed = parseChord(m.chord);
    const nextParsed = parseChord(m.nextChord);
    const [b1, b2, b3, b4] = m.notes;

    // Regla 1: raíz en el tiempo 1
    assert.equal(mod12(b1), parsed.rootPc, `Compás ${i + 1}: tiempo 1 debe ser la raíz de ${m.chord}`);

    // Regla 2: tiempos 2 y 3 son notas del acorde
    const chordPcs = new Set(parsed.intervals.map((iv) => mod12(parsed.rootPc + iv)));
    assert.ok(chordPcs.has(mod12(b2)), `Compás ${i + 1}: tiempo 2 debe pertenecer al acorde ${m.chord}`);
    assert.ok(chordPcs.has(mod12(b3)), `Compás ${i + 1}: tiempo 3 debe pertenecer al acorde ${m.chord}`);

    // Regla 3: tiempo 4 aproxima cromáticamente (1 semitono) a la raíz del compás siguiente
    const distToNext = mod12(nextParsed.rootPc - mod12(b4));
    assert.ok(distToNext === 1 || distToNext === 11, `Compás ${i + 1}: tiempo 4 debe aproximar cromáticamente a ${m.nextChord}`);

    // Regla 4: no repite la misma nota consecutiva ni salta más de una sexta mayor (9 semitonos)
    for (let k = 1; k < m.notes.length; k++) {
      const diff = Math.abs(m.notes[k] - m.notes[k - 1]);
      assert.ok(diff > 0, `Compás ${i + 1}: nota repetida consecutivamente`);
      assert.ok(diff <= 9, `Compás ${i + 1}: salto mayor a sexta (${diff} semitonos)`);
    }
  }

  // Verifica variante con tresillos
  const tripletRes = gen.generate({ chords: ['Gm7', 'C7', 'Fmaj7', 'D7'], key: 'F', variant: 'tresillos' });
  assert.ok(tripletRes.abc.includes('(3'));
});

test('ImportExportService exporta e importa prácticas JSON, colecciones, .abc y progreso', () => {
  const io = new ImportExportService();
  const abcText = 'X:1\nT:Estudio Importado\nM:4/4\nL:1/4\nK:G clef=treble-8\n"G"G B d g | "D7"f d c A | "G"G4 |]';

  const importedAbc = io.importPracticeFromAbc(abcText, 'estudio.abc');
  assert.equal(importedAbc.errors.length, 0);
  assert.equal(importedAbc.practice.title, 'Estudio Importado');
  assert.equal(importedAbc.practice.origin, 'user');

  const collectionJson = io.exportCollectionJson([importedAbc.practice], 'Mi Set');
  const reimported = io.importPracticesFromJson(collectionJson);
  assert.equal(reimported.errors.length, 0);
  assert.equal(reimported.practices.length, 1);
  assert.equal(reimported.practices[0].title, 'Estudio Importado');

  const prog = new UserProgress();
  prog.recordSession({ practiceId: 'p1', bpm: 112, targetBpm: 110, repetitions: 4, studySeconds: 200 });
  const progJson = io.exportProgressJson(prog);
  const restoredProg = io.importProgressJson(progJson);
  assert.equal(restoredProg.errors.length, 0);
  assert.equal(restoredProg.progress.getPracticeStats('p1').bestBpm, 112);
});
