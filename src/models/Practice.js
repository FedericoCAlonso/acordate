/**
 * Instrumentos válidos admitidos por el esquema de prácticas.
 */
export const VALID_INSTRUMENTS = ['guitarra-clasica', 'guitarra', 'bajo'];

/**
 * Categorías válidas admitidas por el esquema de prácticas.
 */
export const VALID_CATEGORIES = ['escala', 'acordes', 'lectura', 'ritmo', 'walking', 'arpegio'];

/**
 * Orígenes válidos de una práctica: incluida (solo lectura) o creada por el usuario.
 */
export const VALID_ORIGINS = ['builtin', 'user'];

/**
 * Valida un objeto plano contra el esquema JSON oficial de una práctica.
 * Devuelve un objeto con estado de validez y mensajes de error claros en español.
 * @param {object} data Objeto candidato a validar.
 * @returns {{ valid: boolean, errors: string[] }} Resultado de la validación.
 */
export function validatePracticeSchema(data) {
  /** Lista acumulativa de errores detectados en el esquema. */
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['La práctica debe ser un objeto JSON válido.'] };
  }

  if (typeof data.id !== 'string' || !data.id.trim()) {
    errors.push('El campo "id" es obligatorio y debe ser un texto no vacío.');
  }

  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    errors.push('El campo "version" debe ser un número entero mayor o igual a 1.');
  }

  if (typeof data.title !== 'string' || data.title.trim().length < 2) {
    errors.push('El título ("title") es obligatorio y debe tener al menos 2 caracteres.');
  }

  if (!Array.isArray(data.instruments) || data.instruments.length === 0) {
    errors.push('Debe indicar al menos un instrumento en "instruments".');
  } else {
    const invalidInst = data.instruments.filter((inst) => !VALID_INSTRUMENTS.includes(inst));
    if (invalidInst.length > 0) {
      errors.push(`Instrumento(s) no soportado(s): ${invalidInst.join(', ')}.`);
    }
  }

  if (!VALID_CATEGORIES.includes(data.category)) {
    errors.push(`La categoría "${data.category}" no es válida. Opciones: ${VALID_CATEGORIES.join(', ')}.`);
  }

  if (typeof data.level !== 'number' || !Number.isInteger(data.level) || data.level < 1 || data.level > 5) {
    errors.push('El nivel ("level") debe ser un entero entre 1 y 5.');
  }

  if (!Array.isArray(data.tags) || data.tags.some((t) => typeof t !== 'string')) {
    errors.push('Las etiquetas ("tags") deben ser una lista de textos.');
  }

  if (typeof data.key !== 'string' || !data.key.trim()) {
    errors.push('La tonalidad ("key") es obligatoria (ej. "C", "F", "Am").');
  }

  if (typeof data.timeSignature !== 'string' || !/^\d+\/\d+$/.test(data.timeSignature.trim())) {
    errors.push('El compás ("timeSignature") debe tener formato numerador/denominador (ej. "4/4", "6/8").');
  }

  if (!data.tempo || typeof data.tempo !== 'object') {
    errors.push('El objeto "tempo" ({ start, target, step }) es obligatorio.');
  } else {
    const { start, target, step } = data.tempo;
    if (typeof start !== 'number' || start < 40 || start > 240) {
      errors.push('El tempo inicial ("tempo.start") debe estar entre 40 y 240 BPM.');
    }
    if (typeof target !== 'number' || target < 40 || target > 240) {
      errors.push('El tempo objetivo ("tempo.target") debe estar entre 40 y 240 BPM.');
    }
    if (typeof start === 'number' && typeof target === 'number' && target < start) {
      errors.push('El tempo objetivo no puede ser menor que el tempo inicial.');
    }
    if (typeof step !== 'number' || step < 1 || step > 40) {
      errors.push('El incremento de tempo ("tempo.step") debe estar entre 1 y 40 BPM.');
    }
  }

  if (typeof data.abc !== 'string' || !data.abc.trim()) {
    errors.push('El contenido musical en notación ABC ("abc") es obligatorio.');
  } else if (!/^K:/m.test(data.abc)) {
    errors.push('La notación ABC debe incluir al menos la cabecera de tonalidad (K:).');
  }

  if (data.fingerings !== undefined && (typeof data.fingerings !== 'object' || data.fingerings === null || Array.isArray(data.fingerings))) {
    errors.push('Las digitaciones ("fingerings") deben ser un objeto clave-valor.');
  }

  if (!Array.isArray(data.goals) || data.goals.some((g) => typeof g !== 'string')) {
    errors.push('Los objetivos ("goals") deben ser una lista de textos.');
  }

  if (typeof data.notes !== 'string') {
    errors.push('Las notas ("notes") deben ser un texto.');
  }

  if (!VALID_ORIGINS.includes(data.origin)) {
    errors.push('El origen ("origin") debe ser "builtin" o "user".');
  }

  if (typeof data.createdAt !== 'string' || Number.isNaN(Date.parse(data.createdAt))) {
    errors.push('La fecha de creación ("createdAt") debe ser una fecha ISO válida.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Genera un identificador único legible para prácticas creadas por el usuario.
 * @param {string} [title='practica'] Título base para construir el slug.
 * @returns {string} Identificador único.
 */
export function generatePracticeId(title = 'practica') {
  const slug = String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'practica';
  const suffix = Math.random().toString(36).slice(2, 7);
  return `user-${slug}-${suffix}`;
}

/**
 * Modelo de dominio puro que representa una práctica musical (incluida o de usuario).
 * No accede al DOM ni a APIs del navegador.
 */
export class Practice {
  /**
   * Construye y valida una instancia de Practice a partir de datos crudos.
   * @param {object} data Objeto conforme al esquema JSON de práctica.
   */
  constructor(data) {
    const normalized = {
      id: data.id || generatePracticeId(data.title),
      version: data.version ?? 1,
      title: (data.title || '').trim(),
      instruments: Array.isArray(data.instruments) ? [...data.instruments] : ['guitarra'],
      category: data.category || 'lectura',
      level: Number(data.level ?? 1),
      tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      key: (data.key || 'C').trim(),
      timeSignature: (data.timeSignature || '4/4').trim(),
      tempo: {
        start: Number(data.tempo?.start ?? 60),
        target: Number(data.tempo?.target ?? 100),
        step: Number(data.tempo?.step ?? 5)
      },
      abc: String(data.abc || '').trim(),
      fingerings: data.fingerings && typeof data.fingerings === 'object' ? { ...data.fingerings } : {},
      goals: Array.isArray(data.goals) ? data.goals.map((g) => String(g).trim()).filter(Boolean) : [],
      notes: typeof data.notes === 'string' ? data.notes : '',
      origin: data.origin || 'user',
      createdAt: data.createdAt || new Date().toISOString()
    };

    const validation = validatePracticeSchema(normalized);
    if (!validation.valid) {
      throw new Error(`Práctica inválida: ${validation.errors.join(' ')}`);
    }

    /** Identificador único de la práctica. */
    this.id = normalized.id;
    /** Versión del esquema de datos. */
    this.version = normalized.version;
    /** Título visible de la práctica. */
    this.title = normalized.title;
    /** Lista de instrumentos para los que aplica la práctica. */
    this.instruments = normalized.instruments;
    /** Categoría pedagógica (escala, acordes, lectura, ritmo, walking, arpegio). */
    this.category = normalized.category;
    /** Nivel de dificultad entre 1 y 5. */
    this.level = normalized.level;
    /** Etiquetas descriptivas para búsqueda y filtrado. */
    this.tags = normalized.tags;
    /** Tonalidad original en cifrado americano. */
    this.key = normalized.key;
    /** Compás de la práctica (ej. "4/4"). */
    this.timeSignature = normalized.timeSignature;
    /** Configuración de tempo inicial, objetivo y paso de incremento. */
    this.tempo = normalized.tempo;
    /** Partitura completa en notación ABC. */
    this.abc = normalized.abc;
    /** Mapa opcional de digitaciones por número de nota/compás. */
    this.fingerings = normalized.fingerings;
    /** Objetivos pedagógicos de la práctica. */
    this.goals = normalized.goals;
    /** Indicaciones o consejos de estudio en español. */
    this.notes = normalized.notes;
    /** Origen de la práctica ("builtin" solo lectura o "user" editable). */
    this.origin = normalized.origin;
    /** Marca temporal ISO de creación. */
    this.createdAt = normalized.createdAt;
  }

  /**
   * Indica si la práctica es de solo lectura (incluida en el catálogo base).
   * @returns {boolean} True si es builtin.
   */
  get isReadOnly() {
    return this.origin === 'builtin';
  }

  /**
   * Devuelve el instrumento de síntesis recomendado por defecto según los instrumentos de la práctica.
   * @returns {'nylon-guitar'|'acoustic-guitar'|'electric-bass'|'acoustic-bass'} Clave del sintetizador.
   */
  getDefaultSynthInstrument() {
    if (this.instruments.includes('bajo')) {
      return this.category === 'walking' ? 'acoustic-bass' : 'electric-bass';
    }
    if (this.instruments.includes('guitarra-clasica')) {
      return 'nylon-guitar';
    }
    return 'acoustic-guitar';
  }

  /**
   * Crea una copia editable propiedad del usuario a partir de esta práctica ("Duplicar y editar").
   * @param {string} [customTitle] Título opcional para la copia.
   * @returns {Practice} Nueva instancia editable con origen "user".
   */
  duplicateAsUser(customTitle) {
    const title = customTitle || `${this.title} (copia)`;
    return new Practice({
      ...this.toJSON(),
      id: generatePracticeId(title),
      title,
      origin: 'user',
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Serializa la instancia a un objeto JSON plano acorde al esquema oficial.
   * @returns {object} Representación JSON pura.
   */
  toJSON() {
    return {
      id: this.id,
      version: this.version,
      title: this.title,
      instruments: [...this.instruments],
      category: this.category,
      level: this.level,
      tags: [...this.tags],
      key: this.key,
      timeSignature: this.timeSignature,
      tempo: { ...this.tempo },
      abc: this.abc,
      fingerings: { ...this.fingerings },
      goals: [...this.goals],
      notes: this.notes,
      origin: this.origin,
      createdAt: this.createdAt
    };
  }
}
