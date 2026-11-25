import { ProgressionStep } from './ProgressionStep.js';
import { Voicing } from './Voicing.js';

/**
 * Instrumentos válidos admitidos por el esquema de prácticas.
 */
export const VALID_INSTRUMENTS = ['guitarra-clasica', 'guitarra', 'bajo', 'piano'];

/**
 * Tipos principales de práctica en los esquemas v2 y v3: Melodía, Armonía o Mixta (lead sheet).
 */
export const VALID_PRACTICE_TYPES = ['melody', 'harmony', 'mixed'];

/**
 * Categorías válidas admitidas por el esquema de prácticas (melódicas, armónicas y repertorio).
 */
export const VALID_CATEGORIES = [
  'escala',
  'tecnica',
  'acordes',
  'lectura',
  'ritmo',
  'walking',
  'arpegio',
  'formas',
  'inversiones',
  'cambios',
  'conduccion-de-voces',
  'campo-armonico',
  'acompanamiento',
  'arpegios-de-acorde',
  'oido',
  'repertorio'
];

/**
 * Estados de derechos de autor soportados por el esquema v3 para repertorio e importaciones.
 */
export const VALID_RIGHTS = ['public_domain', 'harmony_only', 'user_import'];

/**
 * Estilos musicales admitidos para filtrar el repertorio.
 */
export const VALID_STYLES = ['jazz', 'blues', 'bossa', 'barroco', 'clasico-romantico', 'tradicional', 'tango'];

/**
 * Orígenes válidos de una práctica: incluida (solo lectura) o creada por el usuario.
 */
export const VALID_ORIGINS = ['builtin', 'user'];

/**
 * Deduce el tipo de práctica ('melody' | 'harmony' | 'mixed') para migración transparente de prácticas v1.
 * @param {object} data Objeto de práctica crudo.
 * @returns {'melody'|'harmony'|'mixed'} Tipo resuelto.
 */
export function inferPracticeType(data) {
  if (VALID_PRACTICE_TYPES.includes(data?.type)) {
    return data.type;
  }
  const hasProg = Array.isArray(data?.progression) && data.progression.length > 0;
  const hasAbc = typeof data?.abc === 'string' && data.abc.trim().length > 0;
  if (hasProg && hasAbc) return 'mixed';
  if (hasProg && !hasAbc) return 'harmony';
  // En prácticas v1 con cifrado americano sobre la partitura ABC, se clasifican como 'mixed' si son acordes
  if (hasAbc && /"[A-G][#b]?[^"]*"/.test(data.abc)) {
    return data.category === 'acordes' ? 'mixed' : 'melody';
  }
  return 'melody';
}

/**
 * Valida un objeto plano contra el esquema JSON oficial de una práctica (v1, v2 y v3).
 * Devuelve estado de validez y mensajes de error claros en español.
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

  const practiceType = inferPracticeType(data);
  if (!VALID_PRACTICE_TYPES.includes(practiceType)) {
    errors.push(`El tipo "${data.type}" no es válido. Opciones: ${VALID_PRACTICE_TYPES.join(', ')}.`);
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
    errors.push(`La categoría "${data.category}" no es válida.`);
  }

  if (data.rights !== undefined && data.rights !== null && !VALID_RIGHTS.includes(data.rights)) {
    errors.push(`El campo "rights" debe ser uno de: ${VALID_RIGHTS.join(', ')}.`);
  }

  if (data.style !== undefined && data.style !== null && !VALID_STYLES.includes(data.style)) {
    errors.push(`El estilo "${data.style}" no es válido.`);
  }

  if (typeof data.level !== 'number' || !Number.isInteger(data.level) || data.level < 1 || data.level > 5) {
    errors.push('El nivel ("level") debe ser un entero entre 1 y 5.');
  }

  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((t) => typeof t !== 'string'))) {
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

  const hasAbc = typeof data.abc === 'string' && data.abc.trim().length > 0;
  const hasProgression = Array.isArray(data.progression) && data.progression.length > 0;

  if (practiceType === 'melody') {
    if (!hasAbc) {
      errors.push('El contenido musical en notación ABC ("abc") es obligatorio para prácticas de melodía.');
    } else if (!/^K:/m.test(data.abc)) {
      errors.push('La notación ABC debe incluir al menos la cabecera de tonalidad (K:).');
    }
  } else if (practiceType === 'harmony') {
    if (!hasProgression && !hasAbc) {
      errors.push('Una práctica de armonía debe incluir una progresión de acordes ("progression").');
    }
  } else if (practiceType === 'mixed') {
    if (!hasAbc && !hasProgression) {
      errors.push('Una práctica mixta debe incluir partitura ABC y/o progresión de acordes.');
    } else if (hasAbc && !/^K:/m.test(data.abc)) {
      errors.push('La notación ABC debe incluir la cabecera de tonalidad (K:).');
    }
  }

  if (hasProgression) {
    data.progression.forEach((step, idx) => {
      if (!step || typeof step.chord !== 'string' || !step.chord.trim()) {
        errors.push(`Paso ${idx + 1} de la progresión: falta el acorde ("chord").`);
      }
      if (step?.bars !== undefined && (typeof step.bars !== 'number' || step.bars <= 0)) {
        errors.push(`Paso ${idx + 1} de la progresión: "bars" debe ser un número positivo.`);
      }
    });
  }

  if (data.fingerings !== undefined && (typeof data.fingerings !== 'object' || data.fingerings === null || Array.isArray(data.fingerings))) {
    errors.push('Las digitaciones ("fingerings") deben ser un objeto clave-valor.');
  }

  if (data.goals !== undefined && (!Array.isArray(data.goals) || data.goals.some((g) => typeof g !== 'string'))) {
    errors.push('Los objetivos ("goals") deben ser una lista de textos.');
  }

  if (data.notes !== undefined && typeof data.notes !== 'string') {
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
 * Modelo de dominio puro que representa una práctica musical o pieza de repertorio
 * (Melodía, Armonía o Mixta). Compatible hacia atrás con esquemas v1, v2 y v3.
 */
export class Practice {
  /**
   * Construye y valida una instancia de Practice a partir de datos crudos (v1, v2 o v3).
   * @param {object} data Objeto conforme al esquema JSON de práctica.
   */
  constructor(data) {
    const inferredType = inferPracticeType(data);
    const hasProgression = Array.isArray(data.progression) && data.progression.length > 0;
    const rawAbc = typeof data.abc === 'string' && data.abc.trim() ? data.abc.trim() : null;
    const isRepertoire = data.category === 'repertorio' || Boolean(data.rights);

    const normalized = {
      id: data.id || generatePracticeId(data.title),
      version: data.version ?? (isRepertoire ? 3 : hasProgression ? 2 : 1),
      type: inferredType,
      title: (data.title || '').trim(),
      instruments: Array.isArray(data.instruments) ? [...data.instruments] : ['guitarra'],
      category: data.category || (inferredType === 'harmony' ? 'cambios' : 'lectura'),
      level: Number(data.level ?? 1),
      tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      key: (data.key || 'C').trim(),
      timeSignature: (data.timeSignature || '4/4').trim(),
      tempo: {
        start: Number(data.tempo?.start ?? 60),
        target: Number(data.tempo?.target ?? 100),
        step: Number(data.tempo?.step ?? 5)
      },
      abc: rawAbc,
      progression: hasProgression ? data.progression.map((s) => new ProgressionStep(s).toJSON()) : [],
      comping: (typeof data.comping === 'object' && data.comping !== null ? data.comping.pattern : data.comping) || 'negras-abajo',
      customVoicings: Array.isArray(data.customVoicings)
        ? data.customVoicings.map((v) => new Voicing(v).toJSON())
        : [],
      fingerings: data.fingerings && typeof data.fingerings === 'object' ? { ...data.fingerings } : {},
      goals: Array.isArray(data.goals) ? data.goals.map((g) => String(g).trim()).filter(Boolean) : [],
      notes: typeof data.notes === 'string' ? data.notes : '',
      origin: data.origin || 'user',
      createdAt: data.createdAt || new Date().toISOString(),
      // Campos v3 de repertorio y metadatos de estudio
      form: typeof data.form === 'string' && data.form.trim() ? data.form.trim() : null,
      rights: VALID_RIGHTS.includes(data.rights) ? data.rights : null,
      sourceRef: typeof data.sourceRef === 'string' && data.sourceRef.trim() ? data.sourceRef.trim() : null,
      verified: data.verified !== undefined ? Boolean(data.verified) : !isRepertoire,
      focus: data.focus && typeof data.focus === 'object' && !Array.isArray(data.focus) ? { ...data.focus } : null,
      style: VALID_STYLES.includes(data.style) ? data.style : null,
      feeling: typeof data.feeling === 'string' && data.feeling.trim() ? data.feeling.trim() : null,
      tuning: typeof data.tuning === 'string' && data.tuning.trim() ? data.tuning.trim() : null,
      harmonicAnalysis: Array.isArray(data.harmonicAnalysis) ? [...data.harmonicAnalysis] : []
    };

    const validation = validatePracticeSchema(normalized);
    if (!validation.valid) {
      throw new Error(`Práctica inválida: ${validation.errors.join(' ')}`);
    }

    /** Identificador único de la práctica. */
    this.id = normalized.id;
    /** Versión del esquema de datos (1, 2 o 3). */
    this.version = normalized.version;
    /** Tipo de práctica: 'melody', 'harmony' o 'mixed'. */
    this.type = normalized.type;
    /** Título visible de la práctica. */
    this.title = normalized.title;
    /** Lista de instrumentos para los que aplica la práctica. */
    this.instruments = normalized.instruments;
    /** Categoría pedagógica (incluye 'repertorio'). */
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
    /** Partitura completa en notación ABC (o null en prácticas puras de armonía). */
    this.abc = normalized.abc;
    /** Pasos de progresión armónica con acordes, voicings y secciones. */
    this.progression = normalized.progression.map((s) => new ProgressionStep(s));
    /** Patrón rítmico predeterminado de acompañamiento (comping). */
    this.comping = normalized.comping;
    /** Voicings personalizados incrustados por el usuario en esta práctica. */
    this.customVoicings = normalized.customVoicings.map((v) => new Voicing(v));
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
    /** Forma estructural del tema (ej. "AABA, 32 compases", "Blues de 12"). */
    this.form = normalized.form;
    /** Estado de derechos ('public_domain' | 'harmony_only' | 'user_import' | null). */
    this.rights = normalized.rights;
    /** Referencia de fuente/edición consultada (IMSLP, urtext o progresión común). */
    this.sourceRef = normalized.sourceRef;
    /** Indica si la transcripción o cifrado fue verificado por el usuario/profesor. */
    this.verified = normalized.verified;
    /** Qué se practica en cada instrumento ({ guitarra, guitarra-clasica, bajo }). */
    this.focus = normalized.focus;
    /** Estilo musical del repertorio ('jazz', 'blues', 'bossa', 'barroco', 'clasico-romantico', 'tradicional', 'tango'). */
    this.style = normalized.style;
    /** Feeling rítmico sugerido para play-along ('swing', 'bossa', 'shuffle', 'ballad', 'tango', 'straight'). */
    this.feeling = normalized.feeling;
    /** Afinación específica opcional (ej. 'bass-5' para bajo de 5 cuerdas con Si grave B0). */
    this.tuning = normalized.tuning;
    /** Capa opcional de análisis armónico por compás (grados romanos y cadencias para guitarra clásica). */
    this.harmonicAnalysis = normalized.harmonicAnalysis;
  }

  /**
   * Indica si la práctica es de solo lectura (incluida en el catálogo base).
   * @returns {boolean} True si es builtin.
   */
  get isReadOnly() {
    return this.origin === 'builtin';
  }

  /**
   * Indica si la práctica pertenece a la sección Repertorio.
   * @returns {boolean} True si es categoría repertorio o tiene metadatos de derechos.
   */
  get isRepertoire() {
    return this.category === 'repertorio' || Boolean(this.rights);
  }

  /**
   * Indica si la práctica posee contenido de armonía (progression).
   * @returns {boolean} True si es harmony o mixed con progresión.
   */
  get isHarmonyCapable() {
    return this.type === 'harmony' || (this.type === 'mixed' && this.progression.length > 0);
  }

  /**
   * Devuelve el instrumento de síntesis recomendado por defecto según los instrumentos de la práctica.
   * @returns {'nylon-guitar'|'acoustic-guitar'|'electric-bass'|'acoustic-bass'} Clave del sintetizador.
   */
  getDefaultSynthInstrument() {
    if (this.instruments.includes('piano') && (this.instruments.length === 1 || this.instruments[0] === 'piano')) {
      return 'acoustic-piano';
    }
    if (this.instruments.includes('bajo') && this.instruments.length === 1) {
      return this.category === 'walking' || this.style === 'jazz' ? 'acoustic-bass' : 'electric-bass';
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
   * Serializa la instancia a un objeto JSON plano acorde al esquema oficial (v1/v2/v3).
   * @returns {object} Representación JSON pura.
   */
  toJSON() {
    const base = {
      id: this.id,
      version: this.version,
      type: this.type,
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

    if (this.progression.length > 0 || this.type === 'harmony') {
      base.progression = this.progression.map((s) => s.toJSON());
      base.comping = this.comping;
    }
    if (this.customVoicings.length > 0) {
      base.customVoicings = this.customVoicings.map((v) => v.toJSON());
    }
    if (this.form) base.form = this.form;
    if (this.rights) base.rights = this.rights;
    if (this.sourceRef) base.sourceRef = this.sourceRef;
    if (this.version >= 3 || this.rights || this.verified === false) {
      base.verified = this.verified;
    }
    if (this.focus) base.focus = { ...this.focus };
    if (this.style) base.style = this.style;
    if (this.feeling) base.feeling = this.feeling;
    if (this.tuning) base.tuning = this.tuning;
    if (this.harmonicAnalysis.length > 0) base.harmonicAnalysis = [...this.harmonicAnalysis];
    return base;
  }
}
