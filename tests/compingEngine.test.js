import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPING_FEEL_MODES,
  analyzeChordContext,
  buildVariedVoicing,
  normalizeCompingFeel,
  planCompingEvents,
  planPlayAlongBass,
  resolveBassRootMidi
} from '../src/services/CompingEngineService.js';
import { PlayerMixerViewModel } from '../src/viewmodels/player/PlayerMixerViewModel.js';
import { Practice } from '../src/models/Practice.js';

test('CompingEngineService: Blues 12c (4 compases de A7 → D7) varía rítmica, anticipa D7 y aproxima cromáticamente en bajo', () => {
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
  assert.equal(ctx0.nextChordSymbol, 'D7');

  // 1) Modo Orgánico sobre 4 compases de A7: cada compás debe tener un perfil rítmico distinto (sin martilleo monótono)
  const orgEvents = planCompingEvents({
    chordSymbol: 'A7',
    nextChordSymbol: 'D7',
    voicingMidis: a7Midis,
    nextVoicingMidis: d7Midis,
    durationBeats: 16,
    beatsPerMeasure: 4,
    pattern: 'shuffle',
    compingFeel: 'organico',
    context: ctx0,
    isPiano: true
  });

  const barFingerprints = [0, 1, 2, 3].map((b) =>
    orgEvents
      .filter((ev) => ev.beatOffset >= b * 4 && ev.beatOffset < (b + 1) * 4)
      .map((ev) => Number((ev.beatOffset - b * 4).toFixed(2)))
      .join(',')
  );
  assert.equal(new Set(barFingerprints).size, 4, `Los 4 compases de A7 deben tener patrones distintos: ${JSON.stringify(barFingerprints)}`);

  // Debe existir anticipación de D7 en el 4.º compás (beat 15.67)
  const ant = orgEvents.find((ev) => ev.tag === 'anticipation');
  assert.ok(ant, 'Debe anticipar el acorde siguiente D7 en el último compás antes del cambio');
  assert.deepEqual(ant.midis, d7Midis);

  // 2) Bajo acompañante orgánico en shuffle: los 4 compases no se repiten idénticos y el tiempo 4 del c.4 aproxima cromáticamente a D7
  const bassNotes = planPlayAlongBass({
    chordSymbol: 'A7',
    nextChordSymbol: 'D7',
    durationBeats: 16,
    beatsPerMeasure: 4,
    pattern: 'shuffle',
    compingFeel: 'organico',
    context: ctx0
  });
  assert.equal(bassNotes.length, 16, '4 compases × 4 negras = 16 notas de bajo');
  const dRoot = resolveBassRootMidi('D7');
  const lastBass = bassNotes[bassNotes.length - 1];
  assert.equal(lastBass.tag, 'approach');
  assert.ok(
    Math.abs(lastBass.midi - dRoot) <= 2 && lastBass.midi !== dRoot,
    `La nota final del compás 4 (${lastBass.midi}) debe aproximar a D (${dRoot}) por semitono o tono`
  );
  const bassBarLines = [0, 1, 2, 3].map((b) => bassNotes.slice(b * 4, (b + 1) * 4).map((n) => n.midi).join('-'));
  assert.ok(new Set(bassBarLines).size >= 3, `La línea de bajo en 4 compases de A7 debe variar: ${JSON.stringify(bassBarLines)}`);

  // 3) Modo Vivo añade variaciones armónicas válidas sin bajar del LIL (MIDI >= 48)
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
    isPiano: true
  });
  assert.ok(vivoEvents.some((e) => e.tag.startsWith('vivo-')), 'Modo Vivo debe incluir variaciones de color/voicing');
  assert.ok(
    vivoEvents.every((e) => e.midis.every((m) => m >= 48 && m <= 84)),
    'Todas las notas de voicing en modo Vivo deben respetar el LIL (>= 48) y rango agudo (<= 84)'
  );

  // 4) Coro 2 (chorusIndex = 1) varía la frase respecto al Coro 1
  const ctxChorus2 = analyzeChordContext(chords, 0, 4, 1);
  const chorus2Events = planCompingEvents({
    chordSymbol: 'A7',
    nextChordSymbol: 'D7',
    voicingMidis: a7Midis,
    nextVoicingMidis: d7Midis,
    durationBeats: 16,
    beatsPerMeasure: 4,
    pattern: 'shuffle',
    compingFeel: 'organico',
    context: ctxChorus2,
    isPiano: true
  });
  const sig1 = orgEvents.map((e) => `${e.beatOffset.toFixed(2)}:${e.tag}`).join('|');
  const sig2 = chorus2Events.map((e) => `${e.beatOffset.toFixed(2)}:${e.tag}`).join('|');
  assert.notEqual(sig1, sig2, 'El coro 2 debe variar la frase rítmica respecto al coro 1');
});

test('CompingEngineService: cobertura estilística (swing, bossa 2 compases, tango, balada), buildVariedVoicing y PlayerMixerViewModel', () => {
  const cMaj7 = [60, 64, 67, 71];
  const g7 = [55, 59, 62, 65];

  // Bossa nova alterna compás A y compás B de la clave real de 2 compases
  const bossa = planCompingEvents({
    chordSymbol: 'Cmaj7',
    nextChordSymbol: 'G7',
    voicingMidis: cMaj7,
    nextVoicingMidis: g7,
    durationBeats: 8,
    beatsPerMeasure: 4,
    pattern: 'bossa',
    compingFeel: 'organico',
    context: { barIndex: 0, chorusIndex: 0, prevSameBars: 0, changesAfterEvent: true },
    isPiano: false
  });
  const bossaBar1 = bossa.filter((e) => e.beatOffset < 4).map((e) => e.beatOffset);
  const bossaBar2 = bossa.filter((e) => e.beatOffset >= 4).map((e) => e.beatOffset - 4);
  assert.notDeepEqual(bossaBar1, bossaBar2, 'Bossa nova debe alternar los 2 compases de la clave');

  // Jazz swing, tango y balada generan eventos y líneas de bajo válidas
  for (const pat of ['swing-negras', 'tango-marcato', 'balada-lenta', 'vals']) {
    const evs = planCompingEvents({
      chordSymbol: 'Cmaj7',
      nextChordSymbol: 'G7',
      voicingMidis: cMaj7,
      nextVoicingMidis: g7,
      durationBeats: pat === 'vals' ? 6 : 8,
      beatsPerMeasure: pat === 'vals' ? 3 : 4,
      pattern: pat,
      compingFeel: 'vivo',
      context: { barIndex: 0, chorusIndex: 0, prevSameBars: 0, changesAfterEvent: true }
    });
    assert.ok(evs.length >= 2, `Patrón ${pat} debe generar eventos orgánicos`);
    const bass = planPlayAlongBass({
      chordSymbol: 'Cmaj7',
      nextChordSymbol: 'G7',
      durationBeats: pat === 'vals' ? 6 : 8,
      beatsPerMeasure: pat === 'vals' ? 3 : 4,
      pattern: pat,
      compingFeel: 'organico',
      context: { barIndex: 0, chorusIndex: 0, prevSameBars: 0, changesAfterEvent: true }
    });
    assert.ok(bass.length >= 2, `Patrón ${pat} debe generar línea de bajo`);
  }

  // buildVariedVoicing: color9 añade 9.ª (D = pc 2) sobre Cmaj7; bluesNeighbor en A7 mantiene raíz/7.ª
  const with9 = buildVariedVoicing({ baseMidis: cMaj7, chordSymbol: 'Cmaj7', variant: 'color9' });
  assert.ok(with9.some((m) => m % 12 === 2), 'color9 sobre Cmaj7 debe incluir la 9.ª (Re)');
  const neighbor = buildVariedVoicing({ baseMidis: [57, 61, 64, 67], chordSymbol: 'A7', variant: 'bluesNeighbor' });
  assert.ok(neighbor.some((m) => m % 12 === 2) && neighbor.some((m) => m % 12 === 6), 'bluesNeighbor en A7 debe mover 3M→4J (D) y 5J→6M (F#)');

  // PlayerMixerViewModel: defaults inteligentes por práctica y cambio en vivo
  const patches = [];
  const fakeAppVm = {
    settings: { value: { defaultInstrument: 'piano' } },
    getPracticeMix: () => ({ melody: 1, chords: 0.55, bass: 0.75, metronome: 0.65, chordsEnabled: true, metronomeEnabled: true })
  };
  const mixer = new PlayerMixerViewModel({
    appVm: fakeAppVm,
    getPractice: () => null,
    onConfigChanged: (p) => patches.push(p)
  });

  const bluesPr = new Practice({
    id: 'test-blues',
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
  assert.equal(mixer.compingFeel.value, 'organico', 'Un blues play-along debe arrancar en modo Orgánico');

  mixer.setCompingFeel('vivo');
  assert.equal(mixer.compingFeel.value, 'vivo');
  assert.equal(patches.at(-1).compingFeel, 'vivo');
  assert.equal(mixer.getAudioConfigPatch().compingFeel, 'vivo');
});
