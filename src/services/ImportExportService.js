import { Practice, generatePracticeId, validatePracticeSchema } from '../models/Practice.js';
import { UserProgress } from '../models/UserProgress.js';
import { extractTimeSignatureFromAbc } from '../core/MusicTheory.js';

/**
 * Servicio puro para exportar e importar prácticas individuales (.json y .abc),
 * colecciones de prácticas (.json) y copias de seguridad del progreso (.json).
 */
export class ImportExportService {
  /**
   * Serializa una práctica individual a JSON con formato legible.
   * @param {Practice|object} practice Práctica a exportar.
   * @returns {string} Contenido JSON formateado.
   */
  exportPracticeJson(practice) {
    const data = practice instanceof Practice ? practice.toJSON() : practice;
    return JSON.stringify(data, null, 2);
  }

  /**
   * Exporta únicamente la notación ABC de una práctica para compatibilidad con archivos .abc.
   * @param {Practice|object} practice Práctica a exportar.
   * @returns {string} Texto ABC puro.
   */
  exportPracticeAbc(practice) {
    return `${(practice.abc || '').trim()}\n`;
  }

  /**
   * Exporta una colección (set) de múltiples prácticas en un único archivo JSON.
   * @param {Array<Practice|object>} practices Lista de prácticas.
   * @param {string} [collectionName='Colección Acordate'] Nombre del paquete exportado.
   * @returns {string} JSON serializado del paquete.
   */
  exportCollectionJson(practices, collectionName = 'Colección Acordate') {
    const payload = {
      format: 'acordate-collection',
      version: 1,
      name: collectionName,
      exportedAt: new Date().toISOString(),
      practices: practices.map((p) => (p instanceof Practice ? p.toJSON() : p))
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Importa y valida una práctica o colección desde texto JSON.
   * Todas las prácticas importadas pasan a ser origen "user" editables.
   * @param {string} jsonText Contenido del archivo JSON.
   * @returns {{ practices: Practice[], errors: string[] }} Prácticas válidas y lista de errores si hubo alguno.
   */
  importPracticesFromJson(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { practices: [], errors: ['El archivo JSON no tiene una sintaxis válida.'] };
    }

    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed?.format === 'acordate-collection' && Array.isArray(parsed.practices)
        ? parsed.practices
        : [parsed];

    const practices = [];
    const errors = [];

    candidates.forEach((raw, idx) => {
      const normalized = {
        ...raw,
        origin: 'user',
        id: raw?.origin === 'builtin' || !raw?.id ? generatePracticeId(raw?.title || `import-${idx + 1}`) : raw.id,
        createdAt: raw?.createdAt || new Date().toISOString()
      };
      const check = validatePracticeSchema(normalized);
      if (!check.valid) {
        errors.push(`Práctica #${idx + 1}: ${check.errors.join(' ')}`);
      } else {
        practices.push(new Practice(normalized));
      }
    });

    return { practices, errors };
  }

  /**
   * Importa un archivo .abc plano y lo envuelve en una instancia Practice editable válida.
   * @param {string} abcText Contenido del archivo .abc.
   * @param {string} [filename='Práctica importada'] Nombre de archivo sugerido para el título.
   * @returns {{ practice: Practice|null, errors: string[] }} Práctica creada o errores detectados.
   */
  importPracticeFromAbc(abcText, filename = 'Práctica importada') {
    const cleaned = String(abcText || '').trim();
    if (!cleaned) {
      return { practice: null, errors: ['El archivo .abc está vacío.'] };
    }

    const titleMatch = cleaned.match(/^T:\s*(.+)$/m);
    const keyMatch = cleaned.match(/^K:\s*([A-G][#b]?m?)/m);
    const isBass = /clef\s*=\s*bass/i.test(cleaned);

    const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.abc$/i, '').trim() || 'Práctica importada';
    const key = keyMatch ? keyMatch[1].trim() : 'C';
    const timeSignature = extractTimeSignatureFromAbc(cleaned, '4/4');
    const normalizedAbc = /^X:/m.test(cleaned) ? cleaned : `X:1\nT:${title}\nM:${timeSignature}\nL:1/4\nK:${key}\n${cleaned}`;

    const candidate = {
      id: generatePracticeId(title),
      version: 1,
      title,
      instruments: [isBass ? 'bajo' : 'guitarra'],
      category: 'lectura',
      level: 2,
      tags: ['importada', 'abc'],
      key,
      timeSignature,
      tempo: { start: 70, target: 110, step: 5 },
      abc: normalizedAbc,
      fingerings: {},
      goals: ['Leer con pulso estable'],
      notes: 'Importada desde archivo .abc.',
      origin: 'user',
      createdAt: new Date().toISOString()
    };

    const validation = validatePracticeSchema(candidate);
    if (!validation.valid) {
      return { practice: null, errors: validation.errors };
    }
    return { practice: new Practice(candidate), errors: [] };
  }

  /**
   * Exporta el progreso del usuario en formato JSON legible.
   * @param {UserProgress} progress Instancia de progreso.
   * @returns {string} Cadena JSON.
   */
  exportProgressJson(progress) {
    const payload = {
      format: 'acordate-progress',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: progress instanceof UserProgress ? progress.toJSON() : progress
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Importa y valida un archivo JSON de progreso de usuario.
   * @param {string} jsonText Contenido JSON del backup de progreso.
   * @returns {{ progress: UserProgress|null, errors: string[] }} Instancia restaurada o errores.
   */
  importProgressJson(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { progress: null, errors: ['El archivo de progreso no es un JSON válido.'] };
    }
    const raw = parsed?.format === 'acordate-progress' ? parsed.progress : parsed;
    if (!raw || typeof raw !== 'object' || typeof raw.byPractice !== 'object') {
      return { progress: null, errors: ['El archivo no contiene un registro de progreso válido de Acordate.'] };
    }
    return { progress: new UserProgress(raw), errors: [] };
  }

  /**
   * Dispara la descarga local de un archivo de texto en el navegador.
   * @param {string} filename Nombre del archivo a descargar.
   * @param {string} content Contenido textual.
   * @param {string} [mimeType='application/json'] Tipo MIME.
   */
  triggerBrowserDownload(filename, content, mimeType = 'application/json') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
