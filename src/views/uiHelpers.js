/**
 * Catálogo de íconos SVG vectoriales livianos (estilo Material Symbols) para funcionamiento 100% offline.
 */
const ICONS = {
  music: '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>',
  metronome: '<path d="M12 2L5 21h14L12 2zm0 5.5L15.8 18H8.2L12 7.5zM11 10h2v6h-2v-6z"/>',
  edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
  chart: '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>',
  settings: '<path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.14 7.14 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94 7.43 7.43 0 0 0 .05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.05.24.25.41.48.41h3.84c.23 0 .43-.17.48-.41l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
  stop: '<path d="M6 6h12v12H6z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  back: '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',
  copy: '<path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>',
  trash: '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
  download: '<path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z"/>',
  upload: '<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>',
  loop: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
  lock: '<path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm9 14H6V10h12v10z"/>',
  check: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  wand: '<path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a1 1 0 0 0-1.41 0L2.29 17.96a1 1 0 0 0 0 1.41l2.34 2.34a1 1 0 0 0 1.41 0L16.71 11.04a1 1 0 0 0 0-1.41l-2.34-2.34z"/>'
};

/**
 * Crea un elemento SVG de ícono accesible con tamaño configurable.
 * @param {keyof typeof ICONS} name Clave del ícono.
 * @param {number} [size=22] Tamaño en píxeles.
 * @returns {SVGSVGElement} Nodo SVG listo para insertar.
 */
export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || ICONS.music;
  return svg;
}

/**
 * Instala el efecto ripple Material 3 sobre un elemento interactivo respetando prefers-reduced-motion.
 * @param {HTMLElement} element Elemento interactivo destino.
 */
export function attachRipple(element) {
  element.classList.add('m3-interactive');
  element.addEventListener('pointerdown', (e) => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (element.disabled) return;
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const circle = document.createElement('span');
    circle.className = 'm3-ripple-circle';
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.left = `${e.clientX - rect.left - size / 2}px`;
    circle.style.top = `${e.clientY - rect.top - size / 2}px`;
    element.appendChild(circle);
    setTimeout(() => circle.remove(), 480);
  });
}

/**
 * Constructor conciso de nodos DOM para vistas sin framework pesado.
 * @param {string} tag Etiqueta HTML.
 * @param {object} [attrs={}] Atributos, clases, listeners y dataset.
 * @param {Array<Node|string|null|undefined>} [children=[]] Hijos a insertar.
 * @returns {HTMLElement} Elemento DOM creado.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'className') {
      node.className = val;
    } else if (key === 'ripple' && val) {
      attachRipple(node);
    } else if (key === 'dataset' && typeof val === 'object') {
      for (const [dk, dv] of Object.entries(val)) node.dataset[dk] = String(dv);
    } else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'checked' || key === 'disabled' || key === 'value' || key === 'selected') {
      node[key] = val;
    } else {
      node.setAttribute(key, val === true ? '' : String(val));
    }
  }
  const flatChildren = Array.isArray(children) ? children : [children];
  for (const child of flatChildren) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

/**
 * Crea un campo Material 3 con etiqueta flotante (input, select o textarea).
 * @param {object} opts Opciones del campo.
 * @param {string} opts.id ID único del control.
 * @param {string} opts.label Etiqueta visible.
 * @param {'input'|'select'|'textarea'} [opts.kind='input'] Tipo de control.
 * @param {string} [opts.type='text'] Tipo de input si kind === 'input'.
 * @param {*} [opts.value=''] Valor inicial.
 * @param {Array<{ value: string, label: string }>} [opts.options=[]] Opciones para select.
 * @param {Function} [opts.onInput] Callback al escribir.
 * @param {Function} [opts.onChange] Callback al confirmar cambio.
 * @param {string} [opts.extraClass=''] Clase adicional para el control.
 * @returns {{ wrap: HTMLElement, control: HTMLElement }} Contenedor y control interno.
 */
export function createFloatingField({
  id,
  label,
  kind = 'input',
  type = 'text',
  value = '',
  options = [],
  min,
  max,
  step,
  onInput,
  onChange,
  extraClass = ''
}) {
  let control;
  if (kind === 'select') {
    control = el(
      'select',
      { id, className: `m3-field__select ${extraClass}`.trim(), onChange },
      options.map((opt) => el('option', { value: opt.value, selected: String(opt.value) === String(value) }, [opt.label]))
    );
    control.value = String(value);
  } else if (kind === 'textarea') {
    control = el('textarea', {
      id,
      className: `m3-field__textarea ${extraClass}`.trim(),
      placeholder: ' ',
      value: String(value ?? ''),
      onInput,
      onChange
    });
  } else {
    control = el('input', {
      id,
      type,
      className: `m3-field__input ${extraClass}`.trim(),
      placeholder: ' ',
      value: String(value ?? ''),
      min,
      max,
      step,
      onInput,
      onChange
    });
  }

  const labelEl = el('label', { for: id, className: 'm3-field__label' }, [label]);
  const wrap = el('div', { className: 'm3-field' }, [control, labelEl]);
  return { wrap, control };
}

/**
 * Crea una fila con etiqueta y Switch Material 3 accesible.
 * @param {object} opts Opciones del switch.
 * @param {string} opts.id ID único.
 * @param {string} opts.label Texto principal.
 * @param {string} [opts.description] Texto auxiliar opcional.
 * @param {boolean} opts.checked Estado inicial.
 * @param {Function} opts.onChange Handler (boolean) => void.
 * @returns {{ row: HTMLElement, input: HTMLInputElement }} Contenedor e input checkbox.
 */
export function createSwitchRow({ id, label, description = '', checked = false, onChange }) {
  const input = el('input', {
    id,
    type: 'checkbox',
    checked,
    role: 'switch',
    'aria-checked': String(Boolean(checked)),
    onChange: (e) => {
      e.target.setAttribute('aria-checked', String(e.target.checked));
      onChange?.(e.target.checked);
    }
  });
  const track = el('span', { className: 'm3-switch__track' }, [el('span', { className: 'm3-switch__thumb' })]);
  const switchWrap = el('span', { className: 'm3-switch' }, [input, track]);
  const textCol = el('div', {}, [
    el('div', { className: 'm3-title-md' }, [label]),
    description ? el('div', { className: 'm3-body-md' }, [description]) : null
  ]);
  const row = el('label', { for: id, className: 'm3-switch-row' }, [textCol, switchWrap]);
  return { row, input };
}

/**
 * Crea un deslizador Material 3 con etiqueta y lectura numérica actualizada.
 * @param {object} opts Opciones del slider.
 * @returns {{ wrap: HTMLElement, input: HTMLInputElement, valueEl: HTMLElement }} Elementos creados.
 */
export function createSliderGroup({ id, label, min, max, step = 1, value, formatValue = (v) => String(v), onInput }) {
  const valueEl = el('strong', { className: 'm3-label' }, [formatValue(value)]);
  const input = el('input', {
    id,
    type: 'range',
    className: 'm3-slider',
    min,
    max,
    step,
    value,
    'aria-label': label,
    onInput: (e) => {
      const num = Number(e.target.value);
      valueEl.textContent = formatValue(num);
      onInput?.(num);
    }
  });
  const header = el('div', { className: 'm3-slider-header' }, [
    el('label', { for: id }, [label]),
    valueEl
  ]);
  const wrap = el('div', { className: 'm3-slider-group' }, [header, input]);
  return { wrap, input, valueEl };
}

/**
 * Abre un diálogo modal Material 3 accesible con soporte de tecla Escape y cierre por fondo.
 * @param {object} opts Contenido del diálogo.
 * @param {string} opts.title Título del diálogo.
 * @param {HTMLElement|string} opts.body Contenido principal.
 * @param {Array<{ label: string, variant?: string, onClick: Function }>} opts.actions Botones del pie.
 * @returns {{ close: Function }} Controlador para cerrar el diálogo.
 */
export function openModalDialog({ title, body, actions = [] }) {
  const previousFocus = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  const actionBtns = actions.map((act) =>
    el(
      'button',
      {
        type: 'button',
        className: `m3-btn ${act.variant || 'm3-btn--text'}`,
        ripple: true,
        onClick: () => act.onClick(close)
      },
      [act.label]
    )
  );

  const dialog = el(
    'div',
    {
      className: 'm3-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'm3-dialog-title'
    },
    [
      el('h2', { id: 'm3-dialog-title', className: 'm3-headline' }, [title]),
      typeof body === 'string' ? el('p', { className: 'm3-body-md' }, [body]) : body,
      el('div', { className: 'm3-dialog__actions' }, actionBtns)
    ]
  );

  const backdrop = el(
    'div',
    {
      className: 'm3-dialog-backdrop',
      onClick: (e) => {
        if (e.target === backdrop) close();
      }
    },
    [dialog]
  );

  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  const firstBtn = dialog.querySelector('input, select, button');
  firstBtn?.focus();
  return { close };
}

/**
 * Diálogo rápido de confirmación antes de acciones destructivas (ej. eliminar práctica).
 * @param {object} opts Parámetros del cuadro de confirmación.
 * @returns {Promise<boolean>} Promesa que resuelve true si el usuario confirmó.
 */
export function openConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    openModalDialog({
      title,
      body: message,
      actions: [
        {
          label: 'Cancelar',
          variant: 'm3-btn--text',
          onClick: (close) => {
            close();
            resolve(false);
          }
        },
        {
          label: confirmLabel,
          variant: danger ? 'm3-btn--danger' : 'm3-btn--filled',
          onClick: (close) => {
            close();
            resolve(true);
          }
        }
      ]
    });
  });
}
