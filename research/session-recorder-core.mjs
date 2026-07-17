export const STUDY_COLUMNS = [
  'dataset_kind',
  'participant_id',
  'sequence',
  'period',
  'condition',
  'device',
  'theme',
  'visual_aesthetics',
  'task_success_rate',
  'error_count',
  'duration_seconds',
  'reuse_intention',
  'included',
  'exclusion_reason'
];

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field) throw new Error('Comilla inválida en CSV');
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) throw new Error('Campo CSV sin cerrar');
  if (field || record.length) {
    record.push(field);
    if (record.some((value) => value.trim())) records.push(record);
  }
  if (records.length < 2) throw new Error('El CSV no contiene filas');
  const headers = records.shift().map((value) => value.trim());
  return records.map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`Fila ${rowIndex + 2} con cantidad de campos inválida`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns = STUDY_COLUMNS) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

function finiteInRange(value, minimum, maximum = Infinity) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
}

export function validatePeriodRecord(record, taskNames) {
  const errors = [];
  if (!record || !/^P\d{3}$/.test(record.participantId || '')) errors.push('Participante inválido');
  if (![1, 2].includes(Number(record.period))) errors.push('Período inválido');
  if (!['mobile', 'tablet', 'desktop'].includes(record.device)) errors.push('Dispositivo obligatorio');
  if (!['light', 'dark'].includes(record.theme)) errors.push('Tema obligatorio');
  if (!['yes', 'no'].includes(record.included)) errors.push('Inclusión inválida');

  if (record.included === 'no') {
    if (!(record.exclusionReason || '').trim()) errors.push('La exclusión necesita motivo');
    return errors;
  }

  if (!finiteInRange(record.visualAesthetics, 1, 7)) errors.push('Estética debe estar entre 1 y 7');
  if (!finiteInRange(record.reuseIntention, 1, 7)) errors.push('Reutilización debe estar entre 1 y 7');
  if (!Array.isArray(record.taskResults) || record.taskResults.length !== taskNames.length) {
    errors.push('Faltan tareas');
    return errors;
  }
  const expected = new Set(taskNames);
  const observed = new Set(record.taskResults.map((task) => task.task));
  if (observed.size !== expected.size || [...observed].some((task) => !expected.has(task))) {
    errors.push('Las tareas no coinciden con la asignación');
  }
  for (const task of record.taskResults) {
    if (typeof task.success !== 'boolean') errors.push(`${task.task}: registra éxito o fallo`);
    if (!Number.isInteger(Number(task.errors)) || Number(task.errors) < 0) errors.push(`${task.task}: errores inválidos`);
    if (!Number.isFinite(Number(task.durationSeconds)) || Number(task.durationSeconds) <= 0) {
      errors.push(`${task.task}: duración obligatoria`);
    }
  }
  return errors;
}

export function buildStudyRows(records, scheduleRows, taskNames) {
  const schedule = new Map(scheduleRows.map((row) => [row.participant_id, row]));
  const keys = new Set();
  const rows = [];

  for (const record of records) {
    const validation = validatePeriodRecord(record, taskNames);
    if (validation.length) throw new Error(validation.join('; '));
    const assignment = schedule.get(record.participantId);
    if (!assignment) throw new Error(`No existe asignación para ${record.participantId}`);
    const key = `${record.participantId}:${record.period}`;
    if (keys.has(key)) throw new Error(`Registro duplicado ${key}`);
    keys.add(key);
    const prefix = `period_${record.period}`;
    const condition = assignment[`${prefix}_condition`];
    const assignedTasks = assignment[`${prefix}_task_order`].split('|');
    const taskByName = new Map((record.taskResults || []).map((task) => [task.task, task]));
    if (record.included === 'yes' && assignedTasks.some((task) => !taskByName.has(task))) {
      throw new Error(`${key}: orden de tareas incompleto`);
    }

    const successes = record.included === 'yes'
      ? assignedTasks.filter((task) => taskByName.get(task).success).length
      : null;
    const errors = record.included === 'yes'
      ? assignedTasks.reduce((total, task) => total + Number(taskByName.get(task).errors), 0)
      : null;
    const duration = record.included === 'yes'
      ? assignedTasks.reduce((total, task) => total + Number(taskByName.get(task).durationSeconds), 0)
      : null;

    rows.push({
      dataset_kind: 'observed',
      participant_id: record.participantId,
      sequence: assignment.sequence,
      period: record.period,
      condition,
      device: record.device,
      theme: record.theme,
      visual_aesthetics: record.included === 'yes' ? Number(record.visualAesthetics) : '',
      task_success_rate: record.included === 'yes' ? Number((successes / taskNames.length).toFixed(9)) : '',
      error_count: record.included === 'yes' ? errors : '',
      duration_seconds: record.included === 'yes' ? Number(duration.toFixed(3)) : '',
      reuse_intention: record.included === 'yes' ? Number(record.reuseIntention) : '',
      included: record.included,
      exclusion_reason: record.included === 'no' ? record.exclusionReason.trim() : ''
    });
  }

  const grouped = new Map();
  for (const row of rows) {
    const participantRows = grouped.get(row.participant_id) || [];
    participantRows.push(row);
    grouped.set(row.participant_id, participantRows);
  }
  for (const [participantId, participantRows] of grouped) {
    if (participantRows.length === 2 && (
      participantRows[0].device !== participantRows[1].device ||
      participantRows[0].theme !== participantRows[1].theme
    )) {
      throw new Error(`${participantId}: dispositivo y tema deben coincidir en ambos períodos`);
    }
  }

  return rows.sort((left, right) => left.participant_id.localeCompare(right.participant_id) || left.period - right.period);
}

export function createBackup(records) {
  return JSON.stringify({ version: 1, records }, null, 2);
}

export function readBackup(text) {
  const parsed = JSON.parse(text);
  if (parsed?.version !== 1 || !Array.isArray(parsed.records)) throw new Error('Respaldo incompatible');
  return parsed.records;
}

export function createSessionResult(record) {
  return JSON.stringify({
    kind: 'cordalsur-study-period',
    version: 1,
    consentConfirmed: true,
    record
  }, null, 2);
}

export function readSessionResult(text) {
  const parsed = JSON.parse(text);
  if (
    parsed?.kind !== 'cordalsur-study-period' ||
    parsed?.version !== 1 ||
    parsed?.consentConfirmed !== true ||
    !parsed.record ||
    Array.isArray(parsed.record)
  ) {
    throw new Error('Resultado de sesión incompatible');
  }
  return parsed.record;
}

export function mergePeriodRecord(records, record) {
  const key = `${record?.participantId}:${Number(record?.period)}`;
  const withoutCurrent = records.filter((candidate) => (
    `${candidate.participantId}:${Number(candidate.period)}` !== key
  ));
  return [...withoutCurrent, record];
}
