import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENT_PITCH_POLICY,
  PIANO_REFERENCE_TONES,
  expectedMidi,
  writtenMidiToSoundingMidi
} from '../src/core/PitchPolicy.js';
import { INSTRUMENT_LABELS, SYNTH_INSTRUMENT_LABELS } from '../src/core/i18n.js';
import { Practice, VALID_INSTRUMENTS, validatePracticeSchema } from '../src/models/Practice.js';
import { Settings } from '../src/models/Settings.js';
import { AbcService, validateAbcInstrumentRange, validateAbcMeasures } from '../src/services/AbcService.js';
import { loadBuiltinCatalog } from '../src/data/catalog.js';
import { EventBus } from '../src/core/EventBus.js';
import { Router } from '../src/core/Router.js';
import { AppViewModel } from '../src/viewmodels/AppViewModel.js';
import { HomeViewModel } from '../src/viewmodels/HomeViewModel.js';
import { PracticeListViewModel } from '../src/viewmodels/PracticeListViewModel.js';
import { PracticePlayerViewModel } from '../src/viewmodels/PracticePlayerViewModel.js';
import { SettingsViewModel } from '../src/viewmodels/SettingsViewModel.js';
import { ChordsHubViewModel } from '../src/viewmodels/ChordsHubViewModel.js';
import { ScalesHubViewModel } from '../src/viewmodels/ScalesHubViewModel.js';
import { VoicingGenerator } from '../src/services/VoicingGenerator.js';
import { HarmonyService } from '../src/services/HarmonyService.js';
import { ScaleCatalogService, SCALE_CATALOG } from '../src/services/ScaleCatalogService.js';
import {
  computePianoScaleFingers,
  computePianoVoiceLeading,
  generatePianoVoicings,
  groupPianoVoicingsByFamily
} from '../src/services/PianoVoicingService.js';

function createMemoryStorage() {
  let settings = null;
  let progress = null;
  let mixes = {};
  let sessions = [];
  return {
    async getUserPractices() { return []; },
    async saveUserPractice() {},
    async deleteUserPractice() {},
    async loadProgress() { return progress; },
    async saveProgress(p) { progress = p; },
    async loadSettings() { return settings; },
    async saveSettings(s) { settings = s; },
    async loadPracticeMixes() { return mixes; },
    async savePracticeMixes(m) { mixes = m; },
    async loadStudySessions() { return sessions; },
    async saveStudySessions(s) { sessions = s; }
  };
}

test('Piano PitchPolicy: altura real (0 st) en clave de Sol y clave de Fa, rango 88 teclas (A0–C8)', () => {
  const policy = INSTRUMENT_PITCH_POLICY.piano;
  assert.ok(policy, 'Debe existir política de registro para piano');
  assert.equal(policy.writtenToSoundingSemitones, 0);
  assert.equal(policy.minSoundingMidi, 21);
  assert.equal(policy.maxSoundingMidi, 108);
  assert.equal(expectedMidi('piano', 'C4'), 60, 'Do central en piano suena MIDI 60');
  assert.equal(expectedMidi('piano', 'C,'), 48, 'Do3 en clave de fa de piano suena MIDI 48 (sin -12 de bajo)');
  assert.equal(writtenMidiToSoundingMidi(48, 'piano', 'real'), 48);
  assert.equal(writtenMidiToSoundingMidi(48, 'bass-concert', 'real'), 48);
  assert.equal(PIANO_REFERENCE_TONES.length, 2);
  assert.equal(INSTRUMENT_LABELS.piano, 'Piano');
  assert.ok(VALID_INSTRUMENTS.includes('piano'));
  assert.ok(SYNTH_INSTRUMENT_LABELS['acoustic-piano']);
  assert.ok(SYNTH_INSTRUMENT_LABELS['electric-piano']);
});

test('Piano AbcService: gran pentagrama conserva %%staves, altura real en clave de fa y capas MD/MI separadas', () => {
  const abc = new AbcService();
  const sample = [
    'X:1',
    'T:Prueba Piano',
    'M:4/4',
    'L:1/4',
    'K:C',
    '%%staves {1 2}',
    'V:1 clef=treble',
    '"C""^1"C "^2"D "^3"E "^5"G |]',
    'V:2 clef=bass',
    '"_5"C,2 "_1"G,2 |]'
  ].join('\n');

  // 1) Timeline: nunca se clasifica como bajo eléctrico ni transpone -12 st
  const tl = abc.extractTimeline(null, sample, { instrument: 'piano', isPiano: true, timeSignature: '4/4' });
  assert.equal(tl.isPianoPiece, true);
  assert.equal(tl.isBassPiece, false);
  const firstNote = tl.notes.find((n) => !n.isRest);
  assert.equal(firstNote.midis[0], 60, 'Do central (C) suena MIDI 60 exacto');

  // 2) Rango físico con clave de fa incluida
  const rangeRes = validateAbcInstrumentRange(sample, 'piano');
  assert.equal(rangeRes.valid, true, rangeRes.errors.join(' | '));
  assert.equal(rangeRes.minMidi, 48, 'C, en mano izquierda suena MIDI 48 (C3)');
  assert.equal(rangeRes.maxMidi, 67, 'G en mano derecha suena MIDI 67 (G4)');

  // 3) Preparación visual: preserva %%staves {1 2}, no inyecta funciones de bajo y separa capas MD vs MI
  const onlyRh = abc.prepareAbcForRender(sample, {
    isPiano: true,
    isBass: false,
    showBassFunctions: true,
    showRightHand: true,
    showLeftHand: false,
    showChords: true
  });
  assert.match(onlyRh, /%%staves \{1 2\}/);
  assert.doesNotMatch(onlyRh, /"_R"/);
  const [v1Part, v2Part] = onlyRh.split('V:2 clef=bass');
  assert.match(v1Part, /"\^1"/, 'Mano derecha conserva digitación 1–5 en V:1');
  assert.doesNotMatch(v2Part, /"_5"/, 'Mano izquierda oculta digitación en V:2 cuando showLeftHand=false');
});

test('Catálogo de Piano: 20 prácticas graduadas (N1–N5), 6 piezas de dominio público y 18 standards jazz', async () => {
  const catalog = await loadBuiltinCatalog();
  const pianoAll = catalog.filter((p) => p.instruments.includes('piano'));
  const pianoCurriculum = pianoAll.filter((p) => !p.isRepertoire);
  const pianoRepertoire = pianoAll.filter((p) => p.isRepertoire);

  assert.ok(pianoCurriculum.length >= 20, `Se esperan al menos 20 prácticas de ruta para piano (hay ${pianoCurriculum.length})`);
  assert.ok(pianoRepertoire.length >= 24, `Se esperan 6 clásicas + 18 jazz para piano (hay ${pianoRepertoire.length})`);

  for (let lvl = 1; lvl <= 5; lvl++) {
    const count = pianoCurriculum.filter((p) => p.level === lvl).length;
    assert.ok(count >= 4, `Nivel ${lvl} de piano debe tener al menos 4 prácticas (tiene ${count})`);
  }

  for (const pr of pianoAll) {
    const schema = validatePracticeSchema(pr.toJSON());
    assert.equal(schema.valid, true, `${pr.id}: ${schema.errors.join(' | ')}`);
    if (pr.abc) {
      assert.doesNotMatch(pr.abc, /tablature|tab\b/i, `${pr.id} no debe contener tablatura`);
      const mRes = validateAbcMeasures(pr.abc);
      assert.equal(mRes.valid, true, `${pr.id} compases inválidos: ${mRes.errors.join(' | ')}`);
      const rRes = validateAbcInstrumentRange(pr.abc, 'piano');
      assert.equal(rRes.valid, true, `${pr.id} rango inválido: ${rRes.errors.join(' | ')}`);
    }
    if (pr.isRepertoire) {
      assert.equal(pr.verified, false, `${pr.id} debe iniciar con verified:false`);
      assert.ok(pr.sourceRef, `${pr.id} debe declarar sourceRef`);
    }
  }
});

test('ViewModels con Piano: Settings, Home, PracticeList y PracticePlayer cargan timbre piano y manos separadas', async () => {
  const settings = new Settings({ defaultInstrument: 'piano' });
  assert.equal(settings.defaultInstrument, 'piano');

  const appVm = new AppViewModel({
    storageService: createMemoryStorage(),
    router: new Router(),
    eventBus: new EventBus(),
    themeService: { apply() {} },
    wakeLockService: { request() {}, release() {}, setEnabled() {} },
    loadCatalogFn: loadBuiltinCatalog
  });
  await appVm.init();
  await appVm.updateSettings({ defaultInstrument: 'piano' });

  const homeVm = new HomeViewModel(appVm);
  assert.equal(homeVm.instrument.value, 'piano');
  assert.ok(homeVm.continueCard.value?.practice?.instruments.includes('piano'));
  assert.ok(homeVm.todayRoutine.value.items.length >= 3);

  const listVm = new PracticeListViewModel(appVm);
  assert.equal(listVm.instrumentFilter.value, 'piano');
  assert.ok(listVm.repertoirePractices.value.length >= 24);

  const mockAudio = {
    isPlaying: false,
    configure() {},
    loadTimeline() {},
    play() {},
    stop() {},
    playReferenceTone(midi, voice) { this._lastRef = { midi, voice }; }
  };
  const playerVm = new PracticePlayerViewModel({
    appVm,
    audioService: mockAudio,
    abcService: new AbcService(),
    wakeLockService: { request() {}, release() {} },
    importExportService: {}
  });

  const bachPiano = appVm.findPracticeById('rep-piano-bach-minueto-sol');
  assert.ok(bachPiano, 'Debe existir Bach Minueto para piano');
  assert.equal(bachPiano.getDefaultSynthInstrument(), 'acoustic-piano');
  playerVm.loadPractice(bachPiano);
  assert.equal(playerVm.synthInstrument.value, 'acoustic-piano');
  assert.equal(playerVm.hasMultipleVoices.value, true);

  const settingsVm = new SettingsViewModel(appVm, mockAudio);
  settingsVm.playTuningString('piano', 69);
  assert.deepEqual(mockAudio._lastRef, { midi: 69, voice: 'acoustic-piano' });

  homeVm.dispose();
  listVm.dispose();
  playerVm.dispose();
  settingsVm.dispose();
});

test('Fase 2 PianoVoicingService: voicings (fundamental, inversiones, shell, rootless, drop 2), conducción y ABC gran pentagrama', () => {
  const cmaj7 = generatePianoVoicings('Cmaj7');
  const families = new Set(cmaj7.map((v) => v.family));
  assert.ok(families.has('fundamental'), 'Debe generar posición fundamental');
  assert.ok(families.has('inversion'), 'Debe generar inversiones cerradas');
  assert.ok(families.has('shell'), 'Debe generar Shell (MI + MD)');
  assert.ok(families.has('rootless'), 'Debe generar Rootless A y B para acordes de séptima');
  assert.ok(families.has('drop2'), 'Debe generar Drop 2 abierto');

  const groups = groupPianoVoicingsByFamily(cmaj7);
  assert.ok(groups.length >= 4);

  // Valida que cada voicing genera un Gran Pentagrama ABC sintácticamente válido y dentro del rango de 88 teclas
  for (const v of cmaj7) {
    assert.ok(v.getMidiNotes().length >= 3, `${v.id} debe tener al menos 3 notas MIDI`);
    const abcStaff = v.toAbcStaff('americano');
    assert.match(abcStaff, /%%staves \{1 2\}/);
    const rRes = validateAbcInstrumentRange(abcStaff, 'piano');
    assert.equal(rRes.valid, true, `${v.id} fuera de rango: ${rRes.errors.join(' | ')}`);
  }

  // Conducción de voces ii-V-I en piano
  const vl = computePianoVoiceLeading(['Dm7', 'G7', 'Cmaj7'], { style: 'rootless' });
  assert.equal(vl.length, 3);
  assert.ok(vl[1].voiceLeadingCost <= 6, `Enlace Dm7->G7 rootless debe ser suave (costo=${vl[1].voiceLeadingCost})`);
  assert.ok(vl[2].voiceLeadingCost <= 6, `Enlace G7->Cmaj7 rootless debe ser suave (costo=${vl[2].voiceLeadingCost})`);
});

test('Fase 2 Escalas y Acordes Hub con Piano: las 22 escalas generan digitación 1–5 válida y ViewModels operan en piano', async () => {
  const scalesSvc = new ScaleCatalogService();

  // Verifica digitaciones canónicas 1–5 en Do mayor MD y MI
  const majorDef = scalesSvc.getScaleById('mayor');
  assert.deepEqual(computePianoScaleFingers('C', majorDef, 'rh', 1), [1, 2, 3, 1, 2, 3, 4, 5]);
  assert.deepEqual(computePianoScaleFingers('C', majorDef, 'lh', 1), [5, 4, 3, 2, 1, 3, 2, 1]);
  assert.deepEqual(computePianoScaleFingers('F', majorDef, 'rh', 1), [1, 2, 3, 4, 1, 2, 3, 4]);

  // Verifica las 22 escalas del catálogo en Piano (layout + ABC válido + rango)
  for (const sc of SCALE_CATALOG) {
    const layout = scalesSvc.computeFretboardLayout({
      root: 'C',
      scaleId: sc.id,
      voicingInstrument: 'piano',
      systemId: 'md-1oct'
    });
    assert.equal(layout.isPiano, true);
    assert.ok(layout.dots.length >= sc.intervals.length, `${sc.id} debe poblar teclas en piano`);
    assert.ok(layout.dots.every((d) => !d.finger || (d.finger >= 1 && d.finger <= 5)));

    const abc = scalesSvc.buildScalePracticeAbc({
      root: 'C',
      scaleId: sc.id,
      voicingInstrument: 'piano',
      pattern: 'asc-desc',
      octaves: 1
    });
    assert.equal(validateAbcMeasures(abc).valid, true, `ABC escala piano ${sc.id} compases inválidos`);
    assert.equal(validateAbcInstrumentRange(abc, 'piano').valid, true, `ABC escala piano ${sc.id} rango inválido`);
  }

  // Verifica ChordsHubViewModel y ScalesHubViewModel en modo Piano
  const appVm = new AppViewModel({
    storageService: createMemoryStorage(),
    router: new Router(),
    eventBus: new EventBus(),
    themeService: { apply() {} },
    wakeLockService: { request() {}, release() {}, setEnabled() {} },
    loadCatalogFn: loadBuiltinCatalog
  });
  await appVm.init();
  await appVm.updateSettings({ defaultInstrument: 'piano' });

  const played = [];
  const mockAudio = {
    configure() {},
    playVoicing(m, opts) { played.push({ m, opts }); },
    playChordSequence(seq, opts) { played.push({ seq, opts }); },
    playScaleSequence(midis, opts) { played.push({ midis, opts }); },
    stopScaleSequence() {},
    startDrone() {},
    stopDrone() {}
  };
  const mockMetronome = { start() {}, stop() {}, configure() {}, onBeat: null };

  const chordsVm = new ChordsHubViewModel({
    appVm,
    voicingGenerator: new VoicingGenerator(),
    harmonyService: new HarmonyService(),
    audioService: mockAudio,
    metronomeService: mockMetronome
  });
  assert.equal(chordsVm.instrument.value, 'piano');
  assert.ok(chordsVm.voicingsList.value.length >= 4);
  assert.equal(chordsVm.voicingsList.value[0].isPianoVoicing, true);
  chordsVm.playVoicing(chordsVm.voicingsList.value[0]);
  assert.equal(played.at(-1).opts.instrument, 'acoustic-piano');

  const scalesVm = new ScalesHubViewModel({
    appVm,
    scaleCatalogService: scalesSvc,
    audioService: mockAudio
  });
  assert.equal(scalesVm.voicingInstrument.value, 'piano');
  assert.equal(scalesVm.fingeringSystemId.value, 'md-1oct');
  assert.equal(scalesVm.fretboardLayout.value.isPiano, true);
  scalesVm.playSingleNote(60);
  assert.equal(played.at(-1).opts.instrument, 'acoustic-piano');

  chordsVm.dispose();
  scalesVm.dispose();
});
