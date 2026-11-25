import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  INSTRUMENT_PITCH_POLICY,
  applyListeningRegister,
  expectedMidi,
  getPitchPolicy,
  getTuningStrings
} from '../src/core/PitchPolicy.js';
import { getKeySignatureMap } from '../src/core/MusicTheory.js';
import { AbcService } from '../src/services/AbcService.js';
import { loadBuiltinCatalog } from '../src/data/catalog.js';

/**
 * Carga la librería vendored abcjs@6.4.4 en un contexto aislado para parsear partituras reales en Node.js.
 * @returns {object} Instancia ABCJS.
 */
function loadVendoredAbcjs() {
  const code = fs.readFileSync(new URL('../vendor/abcjs/abcjs-basic-min.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {},
    self: {},
    navigator: { userAgent: '' },
    document: { createElement: () => ({}) }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.ABCJS;
}

/**
 * Extrae el primer token de nota escrita (sin acordes ni anotaciones) de la primera voz de un ABC.
 * @param {string} abcText Partitura ABC.
 * @returns {string|null} Token ABC de la primera nota (ej. "C", "E,", "E,,").
 */
function extractFirstWrittenNoteToken(abcText) {
  const lines = String(abcText || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%') || /^[A-Za-z]:/.test(trimmed)) continue;
    const cleaned = trimmed
      .replace(/"[^"]*"/g, '')
      .replace(/![^!]*!/g, '')
      .replace(/\[[A-Za-z]:[^\]]+\]/g, '');
    const match = cleaned.match(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/);
    if (match) return match[0];
  }
  return null;
}

test('expectedMidi devuelve las alturas MIDI reales exactas para referencias de guitarra y bajo', () => {
  // Referencias reales del protocolo de verificación:
  assert.equal(expectedMidi('guitarra', 'C4'), 48, 'Do de 5.ª cuerda traste 3 debe ser MIDI 48');
  assert.equal(expectedMidi('guitarra-clasica', 'C'), 48, 'Do escrito C en treble-8 debe ser MIDI 48');
  assert.equal(expectedMidi('guitarra', 'E3'), 40, 'Mi grave al aire 6.ª cuerda debe ser MIDI 40');
  assert.equal(expectedMidi('guitarra', 'E,'), 40, 'Mi grave escrito E, en treble-8 debe ser MIDI 40');
  assert.equal(expectedMidi('bajo', 'E2'), 28, 'Mi grave al aire 4.ª cuerda del bajo debe ser MIDI 28');
  assert.equal(expectedMidi('bajo', 'E,,'), 28, 'Mi grave escrito E,, en clave de fa debe ser MIDI 28');

  // Registro de escucha +1 octava (útil para parlantes chicos de celular)
  assert.equal(expectedMidi('bajo', 'E2', '+1oct'), 40);
  assert.equal(applyListeningRegister(28, 'real'), 28);
  assert.equal(applyListeningRegister(28, '+1oct'), 40);
});

test('getTuningStrings devuelve las cuerdas al aire reales para guitarra (E A D G B E) y bajo (E A D G)', () => {
  const guitar = getTuningStrings('guitarra');
  assert.deepEqual(
    guitar.map((s) => s.midi),
    [40, 45, 50, 55, 59, 64]
  );
  const bass = getTuningStrings('bajo');
  assert.deepEqual(
    bass.map((s) => s.midi),
    [28, 33, 38, 43]
  );
});

test('Todas las prácticas con partitura ABC del catálogo producen la primera nota MIDI esperada con abcjs y están en rango físico real', async () => {
  const ABCJS = loadVendoredAbcjs();
  const catalog = await loadBuiltinCatalog();
  const abcPractices = catalog.filter((p) => Boolean(p.abc));
  const abcSvc = new AbcService();

  for (const practice of abcPractices) {
    const instrument = practice.instruments[0];
    const policy = getPitchPolicy(instrument, practice.tuning);
    const tunes = ABCJS.parseOnly(practice.abc);
    const timeline = abcSvc.extractTimeline(tunes[0], practice.abc, {
      instrument,
      isBass: instrument === 'bajo',
      timeSignature: practice.timeSignature
    });

    // En obras polifónicas (V:1 / V:2) comparamos la primera nota de la voz principal (V:1)
    const firstNote =
      timeline.notes.find((n) => !n.isRest && n.midis.length > 0 && (n.voiceIndex ?? 0) === 0) ||
      timeline.notes.find((n) => !n.isRest && n.midis.length > 0);
    assert.ok(firstNote, `La práctica ${practice.id} debe tener al menos una nota reproducible`);

    const keyMatch = practice.abc.match(/^K:\s*([A-G][#b]?m?)/m);
    const keyMap = getKeySignatureMap(keyMatch ? keyMatch[1] : 'C');
    const firstToken = extractFirstWrittenNoteToken(practice.abc);
    const expected = expectedMidi(instrument, firstToken, 'real', keyMap);

    assert.equal(
      firstNote.midis[0],
      expected,
      `${practice.id} (${instrument}): primera nota "${firstToken}" produjo MIDI ${firstNote.midis[0]}, esperado ${expected}`
    );

    // Ninguna nota de la práctica puede caer por debajo de la cuerda más grave real del instrumento
    for (const ev of timeline.notes) {
      for (const m of ev.midis) {
        assert.ok(
          m >= policy.minSoundingMidi && m <= policy.maxSoundingMidi,
          `${practice.id} (${instrument}): nota MIDI ${m} fuera del rango físico [${policy.minSoundingMidi}..${policy.maxSoundingMidi}]`
        );
      }
    }
  }
});

test('AbcService quita el título T: al preparar la partitura y adapta compases por línea según ancho', () => {
  const abcSvc = new AbcService();
  const rendered = abcSvc.prepareAbcForRender('X:1\nT:Título gigante\nM:4/4\nK:C clef=treble-8\nC D E F |]', {
    viewMode: 'mixto',
    stripTitle: true
  });
  assert.equal(/^T:/m.test(rendered), false, 'No debe incluir cabecera T: en el ABC renderizado');

  assert.equal(abcSvc.computeMeasuresPerLine(320), 2);
  assert.equal(abcSvc.computeMeasuresPerLine(440), 3);
  assert.equal(abcSvc.computeMeasuresPerLine(820), 6);
  assert.equal(abcSvc.computeMeasuresPerLine(1100), 8);
});
