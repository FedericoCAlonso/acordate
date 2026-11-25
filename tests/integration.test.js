import test from 'node:test';
import assert from 'node:assert/strict';

import { isAbcChordSymbol, midiToAbcPitch, mod12, parseChord } from '../src/core/MusicTheory.js';
import { formatAbcChordsForDisplay, formatChordSymbol, splitChordTypography } from '../src/core/i18n.js';
import { Observable } from '../src/core/Observable.js';
import { Chord, prefersFlatsForChord } from '../src/models/Chord.js';
import { ChordQuality } from '../src/models/ChordQuality.js';
import { Practice } from '../src/models/Practice.js';
import { Settings } from '../src/models/Settings.js';
import { Tuning } from '../src/models/Tuning.js';
import { UserProgress } from '../src/models/UserProgress.js';
import { Voicing } from '../src/models/Voicing.js';
import { AbcService, validateAbcMeasures } from '../src/services/AbcService.js';
import { AudioSynthService } from '../src/services/AudioSynthService.js';
import {
  bindChorusVisualNodes,
  buildChorusAbcScore,
  buildVariedVoicing,
  describeLiveCompingChord,
  planChorusComping,
  planPlayAlongBass
} from '../src/services/CompingEngineService.js';
import { buildHarmonicChartBars } from '../src/services/HarmonicChartService.js';
import { generatePianoVoicings } from '../src/services/PianoVoicingService.js';
import { createFingeringDesignPractice, generateWalkingAbcForPractice } from '../src/services/PracticeFactoryService.js';
import { WalkingBassGenerator } from '../src/services/WalkingBassGenerator.js';
import { EditorProgressionViewModel } from '../src/viewmodels/editor/EditorProgressionViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';

function makeSeededRng(seed = 1234) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeFakeAppVm(defaultInstrument = 'piano') {
  const settings = new Observable(new Settings({ defaultInstrument }));
  const progress = new Observable(new UserProgress());
  const allPractices = new Observable([]);
  const saved = [];
  const snackbars = [];
  const navigations = [];
  return {
    settings,
    progress,
    allPractices,
    saved,
    snackbars,
    navigations,
    activePracticeId: new Observable(''),
    getPracticeMix: () => ({ melody: 1, chords: 0.55, bass: 0.75, metronome: 0.65, chordsEnabled: true, metronomeEnabled: true }),
    savePracticeMix() {},
    updateSettings(patch) { settings.set(settings.value.withPatch(patch)); },
    async upsertUserPractice(pr) { saved.push(pr); },
    showSnackbar(msg, opts) { snackbars.push({ msg, opts }); },
    navigate(hash) { navigations.push(hash); }
  };
}

test('Fase 1: Piano en Editor (playVoicingPreview con tuning=null) y Guardar diseño con Piano sin crash', () => {
  const appVm = makeFakeAppVm('piano');
  const played = [];
  const fakeAudio = {
    configure() {},
    playVoicing(v, opts) { played.push({ v, opts }); }
  };
  const form = new Observable({ instruments: ['piano'], progression: [{ bars: 1, chord: 'Cmaj7' }] });
  const progVm = new EditorProgressionViewModel({
    appVm,
    form,
    progressionGenerator: {},
    audioService: fakeAudio,
    onUpdateField() {},
    onCommitForm() {}
  });

  const pianoVoicing = generatePianoVoicings('Cmaj7')[0];
  assert.equal(typeof pianoVoicing.toJSON, 'function', 'PianoVoicing debe implementar toJSON()');
  assert.equal(pianoVoicing.toJSON().isPianoVoicing, true);

  // Antes lanzaba TypeError: Cannot read properties of null (reading 'instrument')
  assert.doesNotThrow(() => progVm.playVoicingPreview(pianoVoicing, null));
  assert.equal(played.length, 1);
  assert.equal(played[0].opts.instrument, 'acoustic-piano');

  // Guardar diseño con Piano debe etiquetar (Piano) y no fallar en Practice constructor
  const pr = new Practice({
    id: 'test-piano-design',
    version: 3,
    type: 'harmony',
    title: 'Estudio II-V-I',
    instruments: ['piano'],
    category: 'campo-armonico',
    level: 2,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 80, target: 110, step: 5 },
    progression: [{ bars: 1, chord: 'Dm7' }, { bars: 1, chord: 'G7' }, { bars: 2, chord: 'Cmaj7' }]
  });
  const savedPr = createFingeringDesignPractice({
    practice: pr,
    plan: {
      criterion: { label: 'Piano Shell', shortLabel: 'Shell', description: 'Shell dos manos' },
      metrics: { summaryLabel: 'Enlace suave' },
      steps: [
        { chord: 'Dm7', bars: 1, voicing: generatePianoVoicings('Dm7')[0] },
        { chord: 'G7', bars: 1, voicing: generatePianoVoicings('G7')[0] },
        { chord: 'Cmaj7', bars: 2, voicing: pianoVoicing }
      ]
    },
    voicingInstrument: 'piano',
    transposedKey: 'C',
    compingPattern: 'swing-negras'
  });
  assert.ok(savedPr.title.includes('(Piano)'), `Título debe incluir (Piano), obtuvo: ${savedPr.title}`);
  assert.equal(savedPr.instruments[0], 'piano');

  // Shell m7b5 en piano no debe incluir la 9ª mayor (C# sobre Bm7b5)
  const bm7b5Shell = generatePianoVoicings('Bm7b5').find((v) => v.family === 'shell');
  assert.ok(bm7b5Shell);
  assert.equal(bm7b5Shell.rhMidis.some((m) => mod12(m) === 1), false, 'Bm7b5 shell no debe agregar C# (9ª mayor sobre locrio)');
});

test('Fase 1: fidelidad displaySymbol ↔ MIDI en CompingEngineService y planPlayAlongBass (slash y calidades)', () => {
  // 1) Cmaj7 + color13 => C6/9 con 6ª (A=9) y 9ª (D=2), sin 7M (B=11)
  const c69Desc = describeLiveCompingChord('Cmaj7', 'G7', 'color13', false);
  assert.equal(c69Desc.displaySymbol, 'C6/9');
  const c69Midis = buildVariedVoicing({ baseMidis: [60, 64, 67, 71], chordSymbol: 'Cmaj7', variant: 'color13' });
  const c69Pcs = new Set(c69Midis.map(mod12));
  assert.ok(c69Pcs.has(9), 'C6/9 debe sonar la 6ª (A)');
  assert.ok(c69Pcs.has(2), 'C6/9 debe sonar la 9ª (D)');

  // 2) A7 Drop-2 [E3(52), A3(57), C#4(61), G4(67)] + color13 debe preservar 3ª (C#=1) y b7 (G=7)
  const a13Midis = buildVariedVoicing({ baseMidis: [52, 57, 61, 67], chordSymbol: 'A7', variant: 'color13' });
  const a13Pcs = new Set(a13Midis.map(mod12));
  assert.ok(a13Pcs.has(1), 'A13 debe conservar 3ª (C#)');
  assert.ok(a13Pcs.has(7), 'A13 debe conservar b7 (G)');
  assert.ok(a13Pcs.has(6), 'A13 debe añadir 13ª (F#)');

  // 3) sideSlipDown sobre A7 abierto [45, 52, 55, 61, 64] => Ab7 preservando sus pitch classes (sin colapsar a C3=48)
  const slipDesc = describeLiveCompingChord('A7', 'D7', 'sideSlipDown', false);
  assert.equal(slipDesc.displaySymbol, 'Ab7');
  const slipMidis = buildVariedVoicing({ baseMidis: [45, 52, 55, 61, 64], chordSymbol: 'A7', variant: 'sideSlipDown' });
  const slipPcs = new Set(slipMidis.map(mod12));
  assert.ok(slipPcs.has(8), 'Ab7 debe conservar Ab (pc 8)');
  assert.ok(slipPcs.has(0), 'Ab7 debe conservar C (pc 0)');
  assert.ok(slipPcs.has(6), 'Ab7 debe conservar Gb (pc 6)');
  assert.ok(slipMidis.every((m) => m >= 48 && m <= 84));

  // 4) bluesNeighbor (D/A sobre A7) no debe dejar choque F#–G
  const bluesMidis = buildVariedVoicing({ baseMidis: [57, 61, 64, 67], chordSymbol: 'A7', variant: 'bluesNeighbor' });
  const bluesPcs = new Set(bluesMidis.map(mod12));
  assert.ok(bluesPcs.has(2) && bluesPcs.has(6), 'D/A debe contener D (2) y F# (6)');
  assert.equal(bluesPcs.has(7), false, 'D/A no debe conservar G (b7) chocando en 2ª menor con F#');

  // 5) planPlayAlongBass sobre C/E no debe arpegiar Mi mayor (G#=8, C#=1)
  const slashBass = planPlayAlongBass({
    chordSymbol: 'C/E',
    durationBeats: 4,
    pattern: 'swing-negras',
    compingFeel: 'fijo'
  });
  assert.equal(mod12(slashBass[0].midi), 4, 'Tiempo 1 de C/E debe ser E');
  const slashPcs = new Set(slashBass.map((n) => mod12(n.midi)));
  assert.equal(slashPcs.has(8), false, 'C/E no debe tocar G#');

  // 6) planPlayAlongBass sobre Cmaj7 en shuffle no debe tocar Bb (10)
  const maj7Bass = planPlayAlongBass({
    chordSymbol: 'Cmaj7',
    durationBeats: 4,
    pattern: 'shuffle',
    compingFeel: 'organico',
    rng: makeSeededRng(11)
  });
  assert.equal(maj7Bass.some((n) => mod12(n.midi) === 10), false, 'Cmaj7 no debe tocar Bb en bajo');

  // 7) Alteraciones por letra+octava en midiToAbcPitch
  const barAcc = {};
  const t1 = midiToAbcPitch(54, false, {}, barAcc); // F#3 => ^F,
  const t2 = midiToAbcPitch(66, false, {}, barAcc); // F#4 => ^F (otra octava, requiere ^ explícito!)
  assert.equal(t1, '^F,');
  assert.equal(t2, '^F');
});

test('Fase 2: dominio armónico único (6/9, madd9, 7sus4, isAbcChordSymbol, tipografía ♯/♭, enarmonía y HarmonicChartService)', () => {
  // 1) 6/9 y madd9 soportados de punta a punta
  assert.equal(parseChord('C6/9').quality, '6/9');
  assert.equal(parseChord('C6/9').bass, null);
  assert.equal(Chord.parse('C6/9').quality.id, '6/9');
  assert.equal(Chord.parse('Amadd9').quality.id, 'madd9');
  assert.equal(ChordQuality.fromSymbol('7sus4').id, '7sus4');
  assert.equal(ChordQuality.fromSymbol('m7b9').intervals.includes(3), true, 'Sufijo no catalogado no debe degradar a tríada Mayor');

  // 2) isAbcChordSymbol rechaza indicaciones de texto ("Fine", "D.C.") y acepta C6/9
  assert.equal(isAbcChordSymbol('C6/9'), true);
  assert.equal(isAbcChordSymbol('Bbmaj7/D'), true);
  assert.equal(isAbcChordSymbol('Fine'), false);
  assert.equal(isAbcChordSymbol('D.C.'), false);
  assert.equal(isAbcChordSymbol('Al Coda'), false);
  assert.equal(formatAbcChordsForDisplay('"Fine" "C6/9" C4', 'latino'), '"Fine" "Do6/9" C4');

  // 3) splitChordTypography con 6/9 y ♯/♭ en raíz y bajo
  assert.deepEqual(splitChordTypography('C6/9'), { base: 'C', ext: '6/9', bass: '' });
  assert.deepEqual(splitChordTypography('Bb7/F#'), { base: 'B♭', ext: '7', bass: 'F♯' });
  assert.equal(formatChordSymbol('C6/9', 'latino'), 'Do6/9');

  // 4) Enarmonía unificada (Cm muestra Eb, C7 muestra Bb, Cdim7 consistente en Voicing)
  assert.equal(prefersFlatsForChord(Chord.parse('Cm')), true);
  assert.equal(prefersFlatsForChord(Chord.parse('C7')), true);
  assert.equal(prefersFlatsForChord(Chord.parse('A7')), false);
  const cmVoicing = new Voicing({ chord: 'Cm', instrument: 'guitar', frets: [null, 3, 5, 5, 4, 3] });
  const cmNotes = cmVoicing.getDetailedNotes(Tuning.byId('guitar-standard'), 'americano').map((d) => d.noteName);
  assert.ok(cmNotes.includes('Eb'), `Cm en guitarra debe mostrar Eb, obtuvo ${cmNotes.join(',')}`);
  assert.equal(cmNotes.includes('D#'), false);

  // 5) HarmonicChartService unifica compases partidos y secciones
  const bars = buildHarmonicChartBars({
    harmonySteps: [
      { chord: 'Dm7', bars: 0.5, section: 'A' },
      { chord: 'G7', bars: 0.5 },
      { chord: 'Cmaj7', bars: 2 }
    ]
  });
  assert.equal(bars.length, 3);
  assert.equal(bars[0].slots.length, 2, 'Compás 1 debe contener Dm7 y G7 juntos');
  assert.equal(bars[0].section, 'A');
});

test('Fase 3: Walking Bass reproducible con compases partidos (0.5), 3/4, 5c y bindChorusVisualNodes en Piano/Coro', () => {
  // 1) WalkingBassGenerator soporta compases partidos (0.5), 3/4, bajo 5c y tresillos sin repetir n4
  const walkGen = new WalkingBassGenerator();
  const splitRes = walkGen.generate({
    steps: [
      { chord: 'Dm7', bars: 0.5 },
      { chord: 'G7', bars: 0.5 },
      { chord: 'Cmaj7', bars: 1 }
    ],
    timeSignature: '4/4',
    key: 'C',
    variant: 'tresillos',
    approach: 'diatonica'
  });
  assert.equal(splitRes.measures.length, 2, 'Dos pasos de 0.5 + 1 paso de 1 deben sumar exactamente 2 compases');
  assert.equal(validateAbcMeasures(splitRes.abc).valid, true, `Compases inválidos en walking partido: ${splitRes.abc}`);
  assert.equal(splitRes.abc.includes('/2') ? !/\(3([^\s/]+)\/2([^\s/]+)\/2\2\/2/.test(splitRes.abc) : true, true, 'Tresillos no deben repetir la misma nota al final');

  const waltzRes = walkGen.generate({
    steps: [{ chord: 'Cmaj7', bars: 1 }, { chord: 'Am7', bars: 1 }, { chord: 'Dm7', bars: 1 }, { chord: 'G7', bars: 1 }],
    timeSignature: '3/4',
    key: 'C',
    bassStrings: 5
  });
  assert.ok(waltzRes.abc.includes('M:3/4'));
  assert.equal(validateAbcMeasures(waltzRes.abc).valid, true, 'Walking 3/4 debe validar compases exactos');

  // 2) PracticePlayerViewModel activa Walking Bass en el pipeline de audio (ScoreLayer) y guarda sin expulsar al Editor
  const appVm = makeFakeAppVm('bajo');
  const fakeMetronome = { ensureAudioContext: () => null, configure() {} };
  const audio = new AudioSynthService(fakeMetronome);
  const abcSvc = new AbcService();
  const bluesPr = new Practice({
    id: 'test-walking-int',
    version: 3,
    type: 'harmony',
    title: 'ii-V-I integrado',
    instruments: ['bajo', 'guitarra', 'piano'],
    category: 'repertorio',
    level: 3,
    key: 'C',
    timeSignature: '4/4',
    tempo: { start: 100, target: 130, step: 5 },
    comping: 'swing-negras',
    progression: [
      { chord: 'Dm7', bars: 0.5, section: 'A' },
      { chord: 'G7', bars: 0.5 },
      { chord: 'Cmaj7', bars: 2 }
    ]
  });
  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService: audio,
    abcService: abcSvc,
    wakeLockService: { request() {}, release() {} }
  });
  playerVm.loadPractice(bluesPr);
  const walkAbc = playerVm.generateWalkingForCurrent({ variant: 'clasico', approach: 'cromatica', activate: true });
  assert.ok(walkAbc.includes('clef=bass'));
  assert.equal(playerVm.activeScoreLayer.value, 'walking');
  assert.ok(audio._timeline.notes.length >= 12, 'El walking bass generado debe cargarse inmediatamente como notas reales en AudioSynthService');
  assert.equal(audio._timeline.isBassPiece, true);
  assert.equal(audio._timeline.isHarmonyOnly, false);
  assert.equal(audio._timeline.measureCount, 3, 'El walking debe conservar exactamente 3 compases (0.5+0.5+2)');

  // 3) Piano en buildChorusAbcScore separa MD (<= 12 st) y MI (C2..Bb3) y bindChorusVisualNodes enlaza SVG
  playerVm.setScoreLayer('chorus');
  playerVm.setVoicingInstrument('piano');
  playerVm.setCompingFeel('vivo');
  const plan = playerVm.chorusPlan.value;
  assert.ok(plan && playerVm.chorusScoreAbc.value.includes('%%staves {1 2}'));
  assert.equal(validateAbcMeasures(playerVm.chorusScoreAbc.value).valid, true);

  const chorusVisualTl = abcSvc.extractTimeline(null, playerVm.chorusScoreAbc.value, {
    instrument: 'piano',
    isPiano: true,
    timeSignature: '4/4'
  });
  const bound = bindChorusVisualNodes(plan, chorusVisualTl);
  assert.ok(bound > 0, `bindChorusVisualNodes debe enlazar eventos del coro con la partitura (enlazados: ${bound})`);

  playerVm.dispose();
});
