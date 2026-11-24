import { el, openModalDialog } from './uiHelpers.js';

/**
 * Construye una fila visual de la guía de referencias con símbolo destacado y explicación concisa.
 * @param {string} symbol Símbolo o código musical (ej. "1", "③", "p", "V").
 * @param {string} title Nombre corto del símbolo.
 * @param {string} description Explicación práctica.
 * @param {string} [variant='default'] Estilo visual del badge (`lh`, `rh`, `string`, `pos`, `other`).
 * @returns {HTMLElement} Fila visual.
 */
function refRow(symbol, title, description, variant = 'default') {
  return el('div', { className: 'ref-guide__row' }, [
    el('span', { className: `ref-guide__symbol ref-guide__symbol--${variant}` }, [symbol]),
    el('div', { className: 'ref-guide__text' }, [
      el('strong', {}, [title]),
      el('span', { className: 'm3-body-md' }, [description])
    ])
  ]);
}

/**
 * Abre la Guía de Referencias y Símbolos de Partitura y Diapasón.
 * Explica claramente dedos de mano izquierda, cuerdas, trastes/posiciones/cejillas,
 * mano derecha (p-i-m-a / rasgueos) y otras marcas de estudio (sin saturar con teoría de acordes).
 */
export function openNotationGuideModal() {
  const body = el('div', { className: 'ref-guide' }, [
    el('p', { className: 'm3-body-md' }, [
      'Todas las referencias sobre la partitura se pueden prender o apagar por separado desde el botón ',
      el('strong', {}, ['Anotaciones']),
      ' del reproductor o en ',
      el('strong', {}, ['Ajustes']),
      '.'
    ]),

    // 1) Mano izquierda (dedos en el mástil)
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Mano izquierda (dedos sobre los trastes)']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('0', 'Cuerda al aire', 'Se toca sin pisar ningún traste (en diagramas también aparece como ○).', 'lh'),
        refRow('1', 'Dedo índice', 'Marca la referencia base de la posición en el mástil.', 'lh'),
        refRow('2', 'Dedo medio', 'En bajo grave (trastes 1–4, técnica Simandl) cubre el semitono siguiente al 1.', 'lh'),
        refRow('3', 'Dedo anular', 'Usado en guitarra y en bajo a partir del traste 5 (1 dedo por traste).', 'lh'),
        refRow('4', 'Dedo meñique', 'Cubre el extremo agudo de la posición; en bajo Simandl (trastes 1–4) trabaja apoyado con el 3.', 'lh')
      ])
    ]),

    // 2) Cuerdas y anotaciones combinadas
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Cuerdas (números encerrados en círculo)']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('① – ⑥', 'Guitarra (6 cuerdas)', '① Mi agudo (1.ª) · ② Si · ③ Sol · ④ Re · ⑤ La · ⑥ Mi grave (6.ª).', 'string'),
        refRow('① – ④ / ⑤', 'Bajo (4 y 5 cuerdas)', '① Sol (1.ª) · ② Re · ③ La · ④ Mi · ⑤ Si grave (solo en bajo de 5 cuerdas).', 'string'),
        refRow('2③', 'Dedo + cuerda juntos', 'Ejemplo: dedo 2 de mano izquierda pisando sobre la 3.ª cuerda. "0⑥" indica 6.ª cuerda al aire.', 'string')
      ])
    ]),

    // 3) Trastes, posiciones y cejillas
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Trastes, posiciones y cejillas']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('I, II, V, VII', 'Posición (número romano)', 'Indica el traste donde se ubica el dedo 1 (ej. V = 5.ª posición, dedos 1–4 en trastes 5–8).', 'pos'),
        refRow('tr. 5', 'Traste inicial en diagramas', 'Muestra desde qué traste arranca el diagrama cuando no empieza en la cejuela.', 'pos'),
        refRow('C.V / ½C.II', 'Cejilla o media cejilla', 'El dedo 1 pisa varias cuerdas a la vez en el traste indicado (barra continua en diagramas).', 'pos'),
        refRow('× / ○', 'Muteada / Al aire', 'En diagramas de acordes: × no se toca esa cuerda; ○ suena al aire sin pisar.', 'pos')
      ])
    ]),

    // 4) Mano derecha
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Mano derecha (pulsación y ritmo)']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('p', 'Pulgar', 'Pulsa normalmente los bajos (cuerdas 6.ª, 5.ª y 4.ª) en arpegios y guitarra clásica.', 'rh'),
        refRow('i · m · a', 'Índice · Medio · Anular', 'Pulsan melodía y cuerdas agudas; en escalas y bajo se alternan (i–m o m–a) para ganar fluidez.', 'rh'),
        refRow('↓ · ↑', 'Rasgueo / Púa', 'Flecha hacia abajo (↓) rasgueo o púa descendente; hacia arriba (↑) ascendente.', 'rh')
      ])
    ]),

    // 5) Piano (Gran pentagrama y digitación 1–5)
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Piano (gran pentagrama y dedos 1–5)']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('1 – 5', 'Mano derecha (MD · encima de clave de Sol)', 'Números en cursiva sobre cada nota del pentagrama superior (siempre debajo del cifrado de acordes): 1 = Pulgar, 2 = Índice, 3 = Medio, 4 = Anular, 5 = Meñique.', 'rh'),
        refRow('1 – 5', 'Mano izquierda (MI · debajo de clave de Fa)', 'Números en negrita centrados debajo de cada nota del pentagrama inferior (simétricos: 1 = Pulgar .. 5 = Meñique).', 'lh'),
        refRow('1–3–5', 'Acordes en bloque', 'Dedos ordenados de izquierda a derecha en el teclado (nota grave a aguda, ej. MD 1–3–5 o 1–2–5; MI 5–3–1).', 'pos'),
        refRow('𝄞 / 𝄢', 'Gran pentagrama y estudio por manos', 'Pentagrama superior en Sol (MD) e inferior en Fa (MI) a altura real. Podés silenciar una mano desde la barra (Ambas / Mano der. / Mano izq.).', 'pos')
      ])
    ]),

    // 6) Otras anotaciones de estudio
    el('section', { className: 'ref-guide__section' }, [
      el('h3', { className: 'm3-title-md' }, ['Análisis y expresión en partitura']),
      el('div', { className: 'ref-guide__list' }, [
        refRow('R · 3 · 5 · 7', 'Funciones de bajo', 'Debajo del pentagrama: Raíz (R), 3.ª, 5.ª, 7.ª y aproximación cromática (Crom) en walking bass.', 'other'),
        refRow('I · ii · V7', 'Grados romanos (abajo)', 'Función armónica del compás dentro de la tonalidad (análisis armónico).', 'other'),
        refRow('·  /  >', 'Staccato y acento', 'Punto sobre/bajo la nota = corta y separada (staccato); ">" = ataque más marcado (acento).', 'other')
      ])
    ])
  ]);

  return openModalDialog({
    title: 'Guía de referencias y símbolos',
    body,
    actions: [{ label: 'Entendido', variant: 'filled' }]
  });
}
