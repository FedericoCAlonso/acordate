import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAbcChordsForDisplay, formatChordSymbol } from '../src/core/i18n.js';
import {
  analyzeBassFunction,
  extractMeasuresFromAbc,
  getChordVoicingMidi,
  parseChord,
  transposeAbc,
  transposeChordSymbol
} from '../src/core/MusicTheory.js';
import { ComputedObservable, Observable } from '../src/core/Observable.js';
import { parseHashRoute } from '../src/core/Router.js';

test('i18n convierte acordes de cifrado americano a latino respetando bajos invertidos y anotaciones ABC', () => {
  assert.equal(formatChordSymbol('Dm7', 'americano'), 'Dm7');
  assert.equal(formatChordSymbol('Dm7', 'latino'), 'Rem7');
  assert.equal(formatChordSymbol('G7/B', 'latino'), 'Sol7/Si');
  assert.equal(formatChordSymbol('F#m7b5', 'latino'), 'Fa#m7b5');
  assert.equal(formatChordSymbol('Bbmaj7', 'latino'), 'Sibmaj7');

  const abc = '"Cmaj7""^1"C E G B | "G7"G B d f | "_R"C4 |]';
  const latinAbc = formatAbcChordsForDisplay(abc, 'latino');
  assert.ok(latinAbc.includes('"Domaj7"'));
  assert.ok(latinAbc.includes('"Sol7"'));
  assert.ok(latinAbc.includes('"^1"'));
  assert.ok(latinAbc.includes('"_R"'));
});

test('MusicTheory parsea acordes complejos y genera voicings MIDI consistentes', () => {
  const c = parseChord('F#m7b5/C');
  assert.equal(c.root, 'F#');
  assert.equal(c.rootPc, 6);
  assert.deepEqual(c.intervals, [0, 3, 6, 10]);
  assert.equal(c.bass, 'C');
  assert.equal(c.bassPc, 0);

  const voicing = getChordVoicingMidi('Dm7');
  assert.ok(voicing.chordMidis.length === 4);
  assert.ok(voicing.bassMidi >= 40 && voicing.bassMidi <= 55);
});

test('transposeAbc transpone tonalidad K:, cifrados y melodía juntos', () => {
  const abc = 'X:1\nT:Prueba\nM:4/4\nL:1/4\nK:C clef=treble-8\n"C"C E G c | "G7"G B d f |]';
  const transposed = transposeAbc(abc, 2); // C -> D (+2 semitonos)
  assert.match(transposed, /^K:D clef=treble-8$/m);
  assert.ok(transposed.includes('"D"'));
  assert.ok(transposed.includes('"A7"'));
  assert.ok(transposed.includes('D F A d'));
  assert.equal(transposeChordSymbol('Dm7/A', 5, true), 'Gm7/D');
});

test('extractMeasuresFromAbc y analyzeBassFunction detectan compases y funciones armónicas de bajo', () => {
  const measures = extractMeasuresFromAbc('X:1\nM:4/4\nK:F clef=bass\n"F7"F, A, C _E | "Bb7"B,, D, F, A, |]');
  assert.equal(measures.length, 2);
  assert.deepEqual(measures[0].chords, ['F7']);
  assert.deepEqual(measures[1].chords, ['Bb7']);

  // En F7 (raíz F = 41): F -> R, A -> 3, C -> 5, Eb -> b7, B (47) aproximando a Bb (46) -> Crom
  assert.equal(analyzeBassFunction(41, 'F7', 'Bb7', false), 'R');
  assert.equal(analyzeBassFunction(45, 'F7', 'Bb7', false), '3');
  assert.equal(analyzeBassFunction(48, 'F7', 'Bb7', false), '5');
  assert.equal(analyzeBassFunction(51, 'F7', 'Bb7', false), 'b7');
  assert.equal(analyzeBassFunction(47, 'F7', 'Bb7', true), 'Crom');
});

test('Observable, ComputedObservable y Router funcionan de forma reactiva sin navegador', () => {
  const a = new Observable(2);
  const b = new Observable(3);
  const sum = new ComputedObservable([a, b], () => a.value + b.value);

  const history = [];
  sum.subscribe((val) => history.push(val), true);
  a.set(10);
  b.set(5);
  assert.deepEqual(history, [5, 13, 15]);
  sum.dispose();

  assert.deepEqual(parseHashRoute('#/practica/bajo-01'), {
    name: 'practica',
    params: { id: 'bajo-01' },
    hash: '#/practica/bajo-01'
  });
  assert.equal(parseHashRoute('#/editor/nueva').name, 'editor');
  assert.equal(parseHashRoute('#/progreso').name, 'progreso');
  assert.equal(parseHashRoute('#/ajustes').name, 'ajustes');
});
