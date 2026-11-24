---
name: repertoire-musicologist
description: >-
  Musicologist and transcription specialist for Acordate's repertoire (classical guitar,
  traditional/folk/ragtime/tango public-domain scores, jazz/blues/bossa harmonic charts,
  and Bach on electric bass). Audits and corrects ABC transcriptions note-by-note against
  canonical urtext/standard editions, verifying pitch accuracy, accidentals, voice-leading,
  measure sums, physical instrument range, idiomatic fingerings, and copyright compliance.
  Use whenever reviewing or editing repertoireClassical.json, repertoireTraditional.json,
  or repertoireJazz.json.
---

# Especialista en Repertorio Musical y Verificación de Transcripciones

Usá este rol y protocolo para auditar y corregir el repertorio de **Acordate** (`src/data/repertoireClassical.json`, `src/data/repertoireTraditional.json`, `src/data/repertoireJazz.json`) con rigor musicológico, armónico y técnico.

## 1. Estándar de fidelidad musicológica

### A. Guitarra clásica (`repertoireClassical.json`)
* **Fidelidad nota por nota**: revisar melodía, bajo, armonía implícita, alteraciones accidentales, síncopas, anacrusas y cadencias contra la obra canónica original (IMSLP / urtext).
  * No sustituir obras reales por "arpegios genéricos parecidos": si la obra es un fragmento (cc. 1–8 o sección A completa de 8–16 compases), las notas de esos compases deben corresponder fielmente a la partitura real.
  * Ejemplos críticos a verificar siempre:
    * **Bach — Minueto BWV Anh. 114** (Sol mayor): compás 1 `d2 G A B c | d2 G2 G2 | e2 c d e f | g2 G2 G2 |` con bajo real `G,4 A,2 | B,6 | C6 | B,6 |` (y compases 5–8 `c2 d c B A | B2 c B A G | F2 G A B G | A6 |`, compases 9–16 con cadencia final `A2 B A G F | G6`).
    * **Bach — Bourrée en Mi menor BWV 996** (cc. 1–8): anacrusa `e f | g2 f e ^d2 e f | B2 ^c ^d e2 d c | B2 A G F2 G A | G F E F B,2 e f |` con el célebre bajo cromático ascendente `E,2 G,2 B,2 A,2 | G,2 F,2 E,2 F,2 | G,2 A,2 B,2 B,2 | E,2 G,2 B,2` (o movimiento contrario fiel al original de laúd en Em).
    * **Bach — Preludio BWV 999** (en Dm para guitarra): patrón exacto de 3/4 `z A d f d A` / `z B d g d B` / `z G ^c e ^c G` con bajo en tiempos 1 y 3 (`D` pedal).
    * **Bach — Suite para cello n.º 1 BWV 1007** (en D para guitarra / en G para bajo): c.1 `I`, c.2 `IV6/4` (`D B g f g B g B`), c.3 `V7/4/2` (`D c g f g c g c`), c.4 `I` (`D d f e f d f d`), c.5 `vi` (`D B f e f d ^c d B d ^c d F A ^G F`), etc.
    * **Bach — Gavotte en Rondeau BWV 1006a** (en E): anacrusa de dos negras (`b2 g2 | e2 B2 g f e f | g2 B2 ...` o la célebre entrada `g2 e2 | b2 b2 c' b a g | a2 f2` con bajos barrocos reales).
    * **Tárrega — Lágrima** (en E, 3/4): c.1–2 `g B a | b B g` con bajos reales `E,3 | ^G,3` / `^D, -> B,` (respetando la línea original `g#–a–b | f#–e–d#` en 1.ª cuerda con cuerda al aire Si).
    * **Tárrega — Adelita** (mazurca en Em, 3/4): motivos originales con apoyatura / salto a la 1.ª cuerda (`b e' d' c' b | a c' b a f# | g b a g e | f# ^d f# e`).
    * **Tárrega — Recuerdos de la Alhambra** (Am, 3/4): trémolo `p-a-m-i` sobre la armonía real de los cc. 1–8 (`Am` → `Am/G` → `Fmaj7` → `E7` o `C` → `G7` → `C` según compases 1–8 reales: c.1 `e`, c.2 `e–f–e`, c.3 `e–d–c`, c.4 `c–B–c` sobre `Am | Am | Am | G7 | C | C | Dm | E7` — revisar bajos exactos `A, E A`, `A, E c`, etc.).
    * **Albéniz — Asturias (Leyenda)** (Em, 3/4): motivo ostinato real en el pulgar sobre pedal de Si (`E, B G, B B, B | C B B, B A, B | G, B F, B E, B ...` — el famoso tema real de Albéniz en Em es `G, B A, B B, B | C B B, B A, B | G, B F, B E, B | F, B G, B A, B | B, B ...` o `E, B B, B C B | B, B A, B G, B | ...` — verificar compases 1–16 reales!).
    * **Romance anónimo** (Em, 3/4): melodía real `b b b | b a g | g f e | e g b | e' e' e' | e' d' c' | c' b a | a b c' | b c' b | d' c' b | b a g | g f e | f f f | g f ^d | e e e | e` con bajos `E,6` (cc. 1–6), `A,6` (cc. 7–8), `B,6` (cc. 9–10), `E,6` (cc. 11–12), `B,6` (cc. 13–14), `E,6` (cc. 15–16).
    * **Sor Op. 31 n.º 1**, **Carulli Vals Op. 241**, **Giuliani Op. 1a**, **Carcassi Op. 60 n.º 3**, **Sor Op. 35 n.º 22**, **El noi de la mare**, **Sanz Españoletas**, **Narváez Canción del Emperador**, **Llobet El testament d'Amelia**, **Sor Op. 9**: verificar cada compás, armonía, alteraciones y digitación.
* **Polifonía limpia**:
  * `V:1` y `V:2` (y `V:3` si aplica) deben tener exactamente la misma cantidad de líneas y compases por línea, y exactamente la misma suma de tiempos por compás.
  * Los tresillos deben llevar las anotaciones fuera del prefijo: `"a"(3b"m"g"i"e` (nunca `(3"a"b...`).
* **Rango físico estándar (`PitchPolicy`)**:
  * Guitarra / guitarra clásica (`K:... clef=treble-8`): `C` = MIDI 48 (5.ª cuerda traste 3), cuerda más grave `E,` = MIDI 40 (6.ª al aire). Nunca bajar de `E,` en afinación estándar.
  * Bajo (`K:... clef=bass`): cuerda más grave `E,,` = MIDI 28 (4.ª al aire), `G,,` = MIDI 31, `A,,` = MIDI 33, `D,` = MIDI 38, `G,` = MIDI 43.
  * Piano (`%%staves {1 2}`, `V:1 clef=treble`, `V:2 clef=bass`): altura real (`0` st), Do central `C` = MIDI 60, `C,` = MIDI 48, `C,,` = MIDI 36, rango físico A0 (21) a C8 (108). Digitación MD arriba (`"^1"`..`"^5"`) y MI abajo (`"_1"`..`"_5"`).

### A2. Piano clásico y dominio público (`pianoCatalog.json`)
* Auditar nota por nota cada pieza en gran pentagrama contra ediciones Urtext (IMSLP / Henle / Bach-Gesellschaft): Bach (BWV Anh. 114, BWV Anh. 126, BWV 846, Invenciones), Beethoven (WoO 59), Satie (Gymnopédie n.º 1), Burgmüller (Op. 100), Schumann (Op. 68), Chopin (Preludios Op. 28).
* Confirmar igualdad exacta de compases y duración total entre `V:1` (MD) y `V:2` (MI), armonía fiel y `verified: false` + `sourceRef` explícito.

### B. Tradicionales, Ragtime, Tango y Bach en bajo (`repertoireTraditional.json`)
* Revisar fielmente las melodías tradicionales de dominio público:
  * **Amazing Grace** (G, 3/4): anacrusa `D | G2 B/G/ | B2 A | G2 E | D2 D | G2 B/G/ | B2 A | d3- | d2 B | d2 B/G/ | B2 A | G2 E | D2 D | G2 B/G/ | B2 A | G3- | G2 |]` (revisar concordancia exacta de los acordes de cada compás con la melodía!).
  * **When the Saints Go Marching In** (C, 4/4): verificar que las notas y la armonía de compases 10–14 correspondan a la melodía real (`C3 E | G2 G F | E4 | ... | G2 E2 | D2 D2 | C4` — ¡ojo! en la versión estándar es `E3 G | G2 F E | F4` o `C3 E | G2 G F | E4- | E z C E | G2 E2 | C2 D2 | C4` — revisar cada compás!).
  * **Greensleeves** (Am, 6/8): revisar melodía real (parte A y parte B) con alteraciones dóricas/menores melódicas exactas (`F#` ascendente y `G#` sensible).
  * **House of the Rising Sun** (Am, 6/8), **Scarborough Fair** (Em dórico, 3/4), **Danny Boy** (C, 4/4), **The Entertainer** (Joplin, C, 2/4), **Maple Leaf Rag** (Joplin, Ab, 2/4), **El choclo** (Villoldo, Dm, 4/4), **Julia Florida** (Barrios, D, 3/4), **Bach Coral BWV 269** y **Bach Suite Cello n.º 1 BWV 1007** (bajo).

### C. Repertorio de Jazz, Blues y Bossa (`repertoireJazz.json`)
* **Cumplimiento legal estricto**: mantener `rights: "harmony_only"`, `type: "harmony"`, `abc: null` (cero melodías ni letras).
* Auditar las progresiones reales compás por compás (forma exacta de 12, 16, 32, 36 o 40 compases), secciones (`A`, `A2`, `B`, `C`), turnarounds, calidad exacta de cada acorde (`m7b5`, `dim7`, `maj7`, `m6`, dominantes secundarios y sustitutos tritonales) y notas de estudio (`focus.guitarra` y `focus.bajo`).

## 2. Protocolo de verificación obligatoria tras corregir

1. Ejecutar `validatePracticeSchema`, `validateAbcMeasures` y `validateAbcInstrumentRange` sobre el 100 % del repertorio.
2. Confirmar que **todas las obras polifónicas** mantienen igual duración total entre `V:1` y `V:2` al pasar por `abcjs`.
3. Verificar que toda pieza del repertorio mantiene `verified: false` (hasta validación humana/docente), `sourceRef` explícito y **cero tablatura**.
4. Ejecutar `npm test` y entregar un informe conciso de cada corrección musical realizada.
