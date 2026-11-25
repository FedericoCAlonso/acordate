import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPING_FEEL_MODES,
  analyzeChordContext,
  buildVariedVoicing,
  createCompingMemory,
  describeLiveCompingChord,
  normalizeCompingFeel,
  planCompingEvents,
  planPlayAlongBass,
  resolveBassRootMidi
} from '../src/services/CompingEngineService.js';
import { PlayerMixerViewModel } from '../src/viewmodels/player/PlayerMixerViewModel.js';
import { PlayerTransportViewModel } from '../src/viewmodels/player/PlayerTransportViewModel.js';
import { Practice } from '../src/models/Practice.js';

/** Generador determinista LCG para pruebas reproducibles sin flakiness. */
function makeSeededRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('CompingEngineService: Blues 12c estocástico no periódico (A7 × 4 → D7), colores en vivo y aproximación cromática', () => {
  assert.deepEqual(COMPING_FEEL_MODES.map((m) => m.id), ['fijo', 'organico', 'vivo']);
  assert.equal(normalizeCompingFeel('desconocido'), 'organico');

  const a7Midis = [57, 61, 64, 67]; // A3, C#4, E4, G4
  const d7Midis = [62, 66, 69, 72]; // D4, F#4, A4, C5
  const chords = [
    { symbol: 'A7', beat: 0, durationBeats: 16, measureIndex: 1, voicingMidis: a7Midis },
    { symbol: 'D7', beat: 16, durationBeats: 8, measureIndex: 5, voicingMidis: d7Midis }
  ];
  const ctx0 = analyzeChordContext(chords, 0, 4, 0);
  assert.equal(ctx0.ownBars, 4);
  assert.equal(ctx0.changesAfterEvent, true);

  // 1) 3 coros consecutivos (12 compases de A7): no periódico y con alta variedad rítmica
  const mem = createCompingMemory();
  const rng = makeSeededRng(1337);
  const allBarSigs = [];
  const chorusSigs = [];
  for (let chorus = 0; chorus < 3; chorus++) {
    const evs = planCompingEvents({
      chordSymbol: 'A7',
      nextChordSymbol: 'D7',
      voicingMidis: a7Midis,
      nextVoicingMidis: d7Midis,
      durationBeats: 16,
      beatsPerMeasure: 4,
      pattern: 'shuffle',
      compingFeel: 'organico',
      context: analyzeChordContext(chords, 0, 4, chorus),
      isPiano: true,
      memory: mem,
      rng
    });
    const perBar = [0, 1, 2, 3].map((b) =>
      evs
        .filter((ev) => ev.beatOffset >= b * 4 && ev.beatOffset < (b + 1) * 4)
        .map((ev) => Number((ev.beatOffset - b * 4).toFixed(2)))
        .join(',')
    );
    allBarSigs.push(...perBar);
    chorusSigs.push(perBar.join('|'));
  }
  assert.equal(new Set(chorusSigs).size, 3, 'Los 3 coros deben sonar distintos entre sí (sin periodicidad fija)');
  assert.ok(new Set(allBarSigs).size >= 6, `Se espera alta variedad rítmica en 12 compases (distintos: ${new Set(allBarSigs).size})`);

  // 2) Bajo acompañante orgánico en shuffle: varía contornos y aproxima a D7 en tiempo 4 del c.4
  const bassNotes = planPlayAlongBass({
    chordSymbol: 'A7',
    nextChordSymbol: 'D7',
    durationBeats: 16,
    beatsPerMeasure: 4,
    pattern: 'shuffle',
    compingFeel: 'organico',
    context: ctx0,
    memory: createCompingMemory(),
    rng: makeSeededRng(77)
  });
  assert.equal(bassNotes.length, 16);
  const dRoot = resolveBassRootMidi('D7');
  const lastBass = bassNotes[bassNotes.length - 1];
  assert.equal(lastBass.tag, 'approach');
  assert.ok(Math.abs(lastBass.midi - dRoot) <= 2 && lastBass.midi !== dRoot);
  const bassBars = [0, 1, 2, 3].map((b) => bassNotes.slice(b * 4, (b + 1) * 4).map((n) => n.midi).join('-'));
  assert.ok(new Set(bassBars).size >= 3, 'La línea de bajo debe variar entre los 4 compases de A7');

  // 3) Modo Vivo expone displaySymbol y techniqueLabel en vivo y respeta LIL (>= 48)
  const vivoEvents = planCompingEvents({
    chordSymbol: 'A7',
    nextChordSymbol: 'D7',
    voicingMidis: a7Midis,
    nextVoicingMidis: d7Midis,
    durationBeats: 16,
    beatsPerMeasure: 4,
    pattern: 'shuffle',
    compingFeel: 'vivo',
    context: ctx0,
    isPiano: true,
    memory: createCompingMemory(),
    rng: makeSeededRng(2026)
  });
  assert.ok(vivoEvents.some((e) => e.isVariation && e.displaySymbol !== 'A7'), 'Modo Vivo debe producir acordes coloreados visibles (ej. A9, A13, D/A)');
  assert.ok(vivoEvents.every((e) => typeof e.displaySymbol === 'string' && typeof e.techniqueLabel === 'string'));
  assert.ok(vivoEvents.every((e) => e.midis.every((m) => m >= 48 && m <= 84)), 'Respeta LIL >= 48 y techo <= 84');
});

test('CompingEngineService: etiquetas en vivo (describeLiveCompingChord), estilos y despacho visual en PlayerTransportViewModel', () => {
  // Etiquetas en vivo precisas
  assert.equal(describeLiveCompingChord('A7', 'D7', 'color9', false).displaySymbol, 'A9');
  assert.equal(describeLiveCompingChord('A7', 'D7', 'color13', false).displaySymbol, 'A13');
  assert.equal(describeLiveCompingChord('A7', 'D7', 'bluesNeighbor', false).displaySymbol, 'D/A');
  assert.equal(describeLiveCompingChord('A7', 'D7', 'sideSlipDown', false).displaySymbol, 'Ab9');
  assert.equal(describeLiveCompingChord('A7', 'D7', 'base', true).displaySymbol, 'D7');
  assert.equal(describeLiveCompingChord('A7', 'D7', 'base', true).techniqueLabel, 'Anticipación');
  assert.equal(describeLiveCompingChord('Cmaj7', 'G7', 'color13', false).displaySymbol, 'C6/9');

  const cMaj7 = [60, 64, 67, 71];
  const g7 = [55, 59, 62, 65];
  const rng = makeSeededRng(99);

  // Cobertura de todos los estilos principales
  for (const pat of ['swing-negras', 'bossa', 'tango-marcato', 'balada-lenta', 'rasgueo-balada', 'funk-16', 'vals']) {
    const evs = planCompingEvents({
      chordSymbol: 'Cmaj7',
      nextChordSymbol: 'G7',
      voicingMidis: cMaj7,
      nextVoicingMidis: g7,
      durationBeats: pat === 'vals' ? 6 : 8,
      beatsPerMeasure: pat === 'vals' ? 3 : 4,
      pattern: pat,
      compingFeel: 'vivo',
      context: { barIndex: 0, chorusIndex: 0, prevSameBars: 0, changesAfterEvent: true },
      memory: createCompingMemory(),
      rng
    });
    assert.ok(evs.length >= 2, `Patrón ${pat} debe generar eventos en modo Vivo`);
    const bass = planPlayAlongBass({
      chordSymbol: 'Cmaj7',
      nextChordSymbol: 'G7',
      durationBeats: pat === 'vals' ? 6 : 8,
      beatsPerMeasure: pat === 'vals' ? 3 : 4,
      pattern: pat,
      compingFeel: 'organico',
      context: { barIndex: 0, chorusIndex: 0, prevSameBars: 0, changesAfterEvent: true },
      memory: createCompingMemory(),
      rng
    });
    assert.ok(bass.length >= 2, `Patrón ${pat} debe generar línea de bajo`);
  }

  // buildVariedVoicing
  const with9 = buildVariedVoicing({ baseMidis: cMaj7, chordSymbol: 'Cmaj7', variant: 'color9' });
  assert.ok(with9.some((m) => m % 12 === 2));

  // PlayerMixerViewModel + PlayerTransportViewModel liveCompingEvent
  const patches = [];
  const fakeAppVm = {
    settings: { value: { defaultInstrument: 'piano', countInMeasures: 1 } },
    getPracticeMix: () => ({ melody: 1, chords: 0.55, bass: 0.75, metronome: 0.65, chordsEnabled: true, metronomeEnabled: true })
  };
  const mixer = new PlayerMixerViewModel({
    appVm: fakeAppVm,
    getPractice: () => null,
    onConfigChanged: (p) => patches.push(p)
  });
  const bluesPr = new Practice({
    id: 'test-blues-live',
    version: 3,
    type: 'harmony',
    title: 'Blues test',
    instruments: ['piano'],
    category: 'repertorio',
    level: 2,
    key: 'A',
    timeSignature: '4/4',
    tempo: { start: 80, target: 120, step: 5 },
    style: 'blues',
    comping: 'shuffle',
    progression: [{ chord: 'A7', bars: 4 }, { chord: 'D7', bars: 2 }]
  });
  mixer.loadForPractice(bluesPr);
  assert.equal(mixer.compingFeel.value, 'organico');
  mixer.setCompingFeel('vivo');
  assert.equal(patches.at(-1).compingFeel, 'vivo');

  const fakeAudio = { play() {}, pause() {}, stop() {}, onVisualEvent: null, onPassComplete: null, onPlaybackEnd: null };
  const transport = new PlayerTransportViewModel({
    appVm: fakeAppVm,
    audioService: fakeAudio,
    wakeLockService: { request() {}, release() {} },
    sessionTracker: { markPlayStarted() {}, accumulateElapsedTime() {}, flushStudyTime() {}, handlePassComplete() {} },
    getPractice: () => bluesPr,
    onSyncConfig: () => {}
  });
  fakeAudio.onVisualEvent({
    isCompingHit: true,
    liveComping: { baseSymbol: 'A7', displaySymbol: 'A13', techniqueLabel: 'Color 13.ª / 6.ª', isVariation: true }
  });
  assert.equal(transport.liveCompingEvent.value?.displaySymbol, 'A13');
  assert.equal(transport.liveCompingEvent.value?.isVariation, true);
  transport.stop();
  assert.equal(transport.liveCompingEvent.value, null, 'stop() debe limpiar liveCompingEvent');
  transport.dispose();
});
