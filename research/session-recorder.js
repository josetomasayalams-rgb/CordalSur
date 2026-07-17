import {
  buildStudyRows,
  calculateAestheticComposite,
  createBackup,
  mergePeriodRecord,
  parseCsv,
  readBackup,
  readSessionResult,
  toCsv,
  validatePeriodRecord
} from './session-recorder-core.mjs';

const STORAGE_KEY = 'cordalsur-study-recorder-v2';
const TASK_LABELS = {
  wifi: 'Encontrar Wi-Fi',
  checkin: 'Revisar check-in',
  restaurant: 'Elegir restaurante',
  activity: 'Encontrar actividad',
  nearby: 'Ubicar servicio cercano',
  weather: 'Consultar clima',
  tickets: 'Localizar tickets',
  checkout: 'Revisar check-out',
  emergency: 'Encontrar emergencia'
};

const elements = {
  participant: document.querySelector('#participant-select'),
  device: document.querySelector('#device-select'),
  theme: document.querySelector('#theme-select'),
  code: document.querySelector('#condition-code'),
  launch: document.querySelector('#launch-condition'),
  copySessionLink: document.querySelector('#copy-session-link'),
  importSessionResult: document.querySelector('#import-session-result'),
  sessionLinkFallback: document.querySelector('#session-link-fallback'),
  sessionLinkValue: document.querySelector('#session-link-value'),
  tasks: document.querySelector('#task-list'),
  totalDuration: document.querySelector('#total-duration'),
  aestheticsFields: [...document.querySelectorAll('[data-aesthetics-item]')],
  reuse: document.querySelector('#reuse-input'),
  reuseOutput: document.querySelector('#reuse-output'),
  included: document.querySelector('#included-select'),
  exclusionField: document.querySelector('#exclusion-field'),
  exclusion: document.querySelector('#exclusion-input'),
  periodState: document.querySelector('#period-state'),
  pairProgress: document.querySelector('#pair-progress'),
  savedPeriods: document.querySelector('#saved-periods'),
  cohort: document.querySelector('#cohort-grid'),
  status: document.querySelector('#status'),
  save: document.querySelector('#save-period'),
  reset: document.querySelector('#reset-draft'),
  exportCsv: document.querySelector('#export-csv'),
  copyCsv: document.querySelector('#copy-csv'),
  exportBackup: document.querySelector('#export-backup'),
  importBackup: document.querySelector('#import-backup'),
  clear: document.querySelector('#clear-data')
};

let config;
let scheduleRows = [];
let scheduleByParticipant = new Map();
let state = loadState();
let currentParticipant = 'P001';
let currentPeriod = 1;
let draft = null;
let activeTimer = null;
let timerInterval = null;
let toastTimer = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (parsed?.version === 2 && Array.isArray(parsed.records) && parsed.drafts) return parsed;
  } catch (error) {}
  return { version: 2, records: [], drafts: {} };
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyFor(participantId = currentParticipant, period = currentPeriod) {
  return `${participantId}:${period}`;
}

function assignmentFor(participantId = currentParticipant) {
  return scheduleByParticipant.get(participantId);
}

function taskOrder(participantId = currentParticipant, period = currentPeriod) {
  return assignmentFor(participantId)[`period_${period}_task_order`].split('|');
}

function defaultDraft() {
  const visualAestheticsItems = Object.fromEntries(
    config.primary.instrument.items.map((item) => [item.id, 4])
  );
  return {
    participantId: currentParticipant,
    period: currentPeriod,
    device: 'mobile',
    theme: 'light',
    visualAesthetics: 4,
    visualAestheticsItems,
    reuseIntention: 4,
    included: 'yes',
    exclusionReason: '',
    taskResults: taskOrder().map((task) => ({ task, success: null, errors: 0, durationSeconds: 0 }))
  };
}

function findRecord(participantId = currentParticipant, period = currentPeriod) {
  return state.records.find((record) => record.participantId === participantId && Number(record.period) === Number(period));
}

function findOtherRecord() {
  return findRecord(currentParticipant, currentPeriod === 1 ? 2 : 1);
}

function loadDraft() {
  const saved = findRecord();
  draft = clone(saved || state.drafts[keyFor()] || defaultDraft());
  const assignedOrder = taskOrder();
  const existingTasks = new Map((draft.taskResults || []).map((task) => [task.task, task]));
  draft.taskResults = assignedOrder.map((task) => existingTasks.get(task) || {
    task,
    success: null,
    errors: 0,
    durationSeconds: 0
  });
  const other = findOtherRecord();
  if (other) {
    draft.device = other.device;
    draft.theme = other.theme;
  }
}

function saveDraft() {
  if (!draft) return;
  state.drafts[keyFor()] = clone(draft);
  persistState();
}

function showStatus(message, isError = false) {
  clearTimeout(toastTimer);
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
  elements.status.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.status.classList.remove('is-visible'), 3200);
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function updateTotalDuration() {
  const total = draft.taskResults.reduce((sum, task) => sum + Number(task.durationSeconds || 0), 0);
  elements.totalDuration.textContent = formatDuration(total);
}

function stopTimer() {
  if (!activeTimer) return;
  const elapsed = (performance.now() - activeTimer.startedAt) / 1000;
  const result = draft.taskResults[activeTimer.index];
  result.durationSeconds = Number((activeTimer.baseSeconds + elapsed).toFixed(3));
  const row = elements.tasks.querySelector(`[data-task-index="${activeTimer.index}"]`);
  if (row) {
    row.querySelector('.task-duration').value = Math.round(result.durationSeconds);
    const button = row.querySelector('.timer-button');
    button.textContent = 'Iniciar';
    button.classList.remove('is-running');
  }
  activeTimer = null;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTotalDuration();
  saveDraft();
}

function startTimer(index) {
  if (activeTimer?.index === index) {
    stopTimer();
    return;
  }
  stopTimer();
  const result = draft.taskResults[index];
  activeTimer = { index, startedAt: performance.now(), baseSeconds: Number(result.durationSeconds || 0) };
  const row = elements.tasks.querySelector(`[data-task-index="${index}"]`);
  const button = row.querySelector('.timer-button');
  button.textContent = 'Detener';
  button.classList.add('is-running');
  timerInterval = setInterval(() => {
    const elapsed = (performance.now() - activeTimer.startedAt) / 1000;
    row.querySelector('.task-duration').value = Math.round(activeTimer.baseSeconds + elapsed);
    elements.totalDuration.textContent = formatDuration(
      draft.taskResults.reduce((sum, task, taskIndex) => {
        if (taskIndex === activeTimer.index) return sum + activeTimer.baseSeconds + elapsed;
        return sum + Number(task.durationSeconds || 0);
      }, 0)
    );
  }, 250);
}

function taskRow(task, index) {
  const result = draft.taskResults[index];
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.taskIndex = index;

  const name = document.createElement('span');
  name.className = 'task-name';
  name.textContent = `${index + 1}. ${TASK_LABELS[task] || task}`;

  const outcome = document.createElement('select');
  outcome.className = 'task-result';
  outcome.setAttribute('aria-label', `Resultado ${TASK_LABELS[task] || task}`);
  outcome.innerHTML = '<option value="">Pendiente</option><option value="success">Éxito</option><option value="failure">Fallo</option>';
  outcome.value = result.success === true ? 'success' : result.success === false ? 'failure' : '';
  outcome.addEventListener('change', () => {
    result.success = outcome.value === 'success' ? true : outcome.value === 'failure' ? false : null;
    saveDraft();
  });

  const errors = document.createElement('input');
  errors.className = 'task-errors';
  errors.type = 'number';
  errors.min = '0';
  errors.step = '1';
  errors.inputMode = 'numeric';
  errors.value = result.errors;
  errors.setAttribute('aria-label', `Errores ${TASK_LABELS[task] || task}`);
  errors.addEventListener('input', () => {
    result.errors = Number(errors.value);
    saveDraft();
  });

  const duration = document.createElement('input');
  duration.className = 'task-duration';
  duration.type = 'number';
  duration.min = '0';
  duration.step = '1';
  duration.inputMode = 'decimal';
  duration.value = Math.round(result.durationSeconds);
  duration.setAttribute('aria-label', `Segundos ${TASK_LABELS[task] || task}`);
  duration.addEventListener('change', () => {
    result.durationSeconds = Number(duration.value);
    updateTotalDuration();
    saveDraft();
  });

  const timer = document.createElement('button');
  timer.type = 'button';
  timer.className = 'timer-button';
  timer.textContent = 'Iniciar';
  timer.addEventListener('click', () => startTimer(index));

  row.append(name, outcome, errors, duration, timer);
  return row;
}

function renderTasks() {
  elements.tasks.replaceChildren(...draft.taskResults.map((task, index) => taskRow(task.task, index)));
  updateTotalDuration();
}

function renderParticipantOptions() {
  const selected = currentParticipant;
  elements.participant.replaceChildren(...scheduleRows.map((assignment) => {
    const count = state.records.filter((record) => record.participantId === assignment.participant_id).length;
    const option = document.createElement('option');
    option.value = assignment.participant_id;
    option.textContent = `${assignment.participant_id} · ${count}/2`;
    return option;
  }));
  elements.participant.value = selected;
}

function renderCohort() {
  const pairIds = new Set();
  const cells = scheduleRows.map((assignment) => {
    const records = state.records.filter((record) => record.participantId === assignment.participant_id);
    if (records.length === 2) pairIds.add(assignment.participant_id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'participant-cell';
    button.classList.toggle('is-current', assignment.participant_id === currentParticipant);
    button.dataset.periods = records.length;
    button.textContent = assignment.participant_id;
    button.title = `${assignment.participant_id}: ${records.length} de 2 períodos`;
    button.addEventListener('click', () => changeParticipant(assignment.participant_id));
    return button;
  });
  elements.cohort.replaceChildren(...cells);
  elements.pairProgress.textContent = `${pairIds.size} / ${config.plannedRecruitment} pares`;
  elements.savedPeriods.textContent = `${state.records.length} períodos`;
  const disabled = state.records.length === 0;
  elements.exportCsv.disabled = disabled;
  elements.copyCsv.disabled = disabled;
  elements.exportBackup.disabled = disabled;
}

function renderForm() {
  stopTimer();
  loadDraft();
  const assignment = assignmentFor();
  const code = assignment[`period_${currentPeriod}_code`];
  elements.code.textContent = `Código ${code.toUpperCase()}`;
  elements.launch.href = new URL(`../?condition=${code}`, window.location.href).href;
  elements.device.value = draft.device;
  elements.theme.value = draft.theme;
  const locked = Boolean(findOtherRecord());
  elements.device.disabled = locked;
  elements.theme.disabled = locked;
  elements.aestheticsFields.forEach((field) => {
    const input = field.querySelector('input');
    const output = field.querySelector('output');
    input.value = draft.visualAestheticsItems[field.dataset.aestheticsItem];
    output.value = input.value;
  });
  elements.reuse.value = draft.reuseIntention;
  elements.reuseOutput.value = String(draft.reuseIntention);
  elements.included.value = draft.included;
  elements.exclusion.value = draft.exclusionReason || '';
  elements.exclusionField.hidden = draft.included !== 'no';
  const saved = Boolean(findRecord());
  elements.periodState.textContent = saved ? 'Guardado' : 'Borrador';
  elements.periodState.classList.toggle('is-saved', saved);
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.setAttribute('aria-pressed', Number(button.dataset.period) === currentPeriod ? 'true' : 'false');
  });
  renderTasks();
  renderParticipantOptions();
  renderCohort();
}

function changeParticipant(participantId) {
  stopTimer();
  saveDraft();
  currentParticipant = participantId;
  elements.participant.value = participantId;
  renderForm();
}

function changePeriod(period) {
  stopTimer();
  saveDraft();
  currentPeriod = Number(period);
  renderForm();
}

function savePeriod() {
  stopTimer();
  draft.visualAesthetics = calculateAestheticComposite(draft, config.primary.instrument.items);
  const errors = validatePeriodRecord(draft, config.randomization.tasks, config.primary.instrument.items);
  const other = findOtherRecord();
  if (other && (other.device !== draft.device || other.theme !== draft.theme)) {
    errors.push('Dispositivo y tema deben coincidir en ambos períodos');
  }
  if (errors.length) {
    showStatus(errors[0], true);
    return;
  }
  const key = keyFor();
  state.records = state.records.filter((record) => keyFor(record.participantId, record.period) !== key);
  state.records.push(clone(draft));
  delete state.drafts[key];
  persistState();
  renderForm();
  showStatus(`${currentParticipant} · período ${currentPeriod} guardado`);
}

function resetDraft() {
  if (!window.confirm('¿Restablecer el borrador de este período?')) return;
  stopTimer();
  delete state.drafts[keyFor()];
  persistState();
  renderForm();
  showStatus('Borrador restablecido');
}

function currentCsv() {
  return toCsv(buildStudyRows(
    state.records,
    scheduleRows,
    config.randomization.tasks,
    config.primary.instrument.items
  ));
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportCsv() {
  try {
    download(`cordalsur-study-observed-${new Date().toISOString().slice(0, 10)}.csv`, currentCsv(), 'text/csv;charset=utf-8');
    showStatus('CSV exportado');
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function copyCsv() {
  try {
    await navigator.clipboard.writeText(currentCsv());
    showStatus('CSV copiado');
  } catch (error) {
    showStatus('No se pudo copiar el CSV', true);
  }
}

function participantSessionUrl() {
  const url = new URL('participant-session.html', window.location.href);
  url.searchParams.set('participant', currentParticipant);
  url.searchParams.set('period', String(currentPeriod));
  url.searchParams.set('device', draft.device);
  url.searchParams.set('theme', draft.theme);
  return url.href;
}

function copyWithSelection(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Copia no disponible');
}

async function writeClipboardText(text) {
  if (!navigator.clipboard?.writeText) {
    copyWithSelection(text);
    return;
  }
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Portapapeles sin respuesta')), 1200))
    ]);
  } catch (error) {
    copyWithSelection(text);
  }
}

async function copySessionLink() {
  const url = participantSessionUrl();
  elements.sessionLinkFallback.hidden = true;
  try {
    saveDraft();
    await writeClipboardText(url);
    showStatus(`${currentParticipant} · enlace del período ${currentPeriod} copiado`);
  } catch (error) {
    elements.sessionLinkValue.value = url;
    elements.sessionLinkFallback.hidden = false;
    elements.sessionLinkValue.focus();
    elements.sessionLinkValue.select();
    showStatus('Copia manualmente el enlace seleccionado', true);
  }
}

function exportBackup() {
  download(`cordalsur-study-backup-${new Date().toISOString().slice(0, 10)}.json`, createBackup(state.records), 'application/json');
  showStatus('Respaldo exportado');
}

async function importBackup(file) {
  try {
    const records = readBackup(await file.text());
    buildStudyRows(records, scheduleRows, config.randomization.tasks, config.primary.instrument.items);
    state.records = records;
    state.drafts = {};
    persistState();
    renderForm();
    showStatus('Respaldo importado');
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    elements.importBackup.value = '';
  }
}

async function importSessionResult(file) {
  try {
    const record = readSessionResult(await file.text());
    const validation = validatePeriodRecord(record, config.randomization.tasks, config.primary.instrument.items);
    if (validation.length) throw new Error(validation[0]);
    const existing = state.records.find((candidate) => (
      candidate.participantId === record.participantId &&
      Number(candidate.period) === Number(record.period)
    ));
    if (existing && !window.confirm(`${record.participantId} · período ${record.period} ya existe. ¿Reemplazarlo?`)) return;

    const nextRecords = mergePeriodRecord(state.records, record);
    buildStudyRows(nextRecords, scheduleRows, config.randomization.tasks, config.primary.instrument.items);
    state.records = nextRecords;
    delete state.drafts[keyFor(record.participantId, record.period)];
    currentParticipant = record.participantId;
    currentPeriod = Number(record.period);
    persistState();
    renderForm();
    showStatus(`${record.participantId} · período ${record.period} importado`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    elements.importSessionResult.value = '';
  }
}

function clearData() {
  if (!window.confirm('¿Borrar todos los períodos y borradores de este navegador?')) return;
  state = { version: 2, records: [], drafts: {} };
  persistState();
  renderForm();
  showStatus('Datos locales eliminados');
}

function bindEvents() {
  elements.participant.addEventListener('change', () => changeParticipant(elements.participant.value));
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', () => changePeriod(button.dataset.period));
  });
  elements.device.addEventListener('change', () => { draft.device = elements.device.value; saveDraft(); });
  elements.theme.addEventListener('change', () => { draft.theme = elements.theme.value; saveDraft(); });
  elements.aestheticsFields.forEach((field) => {
    const input = field.querySelector('input');
    const output = field.querySelector('output');
    input.addEventListener('input', () => {
      draft.visualAestheticsItems[field.dataset.aestheticsItem] = Number(input.value);
      draft.visualAesthetics = calculateAestheticComposite(draft, config.primary.instrument.items);
      output.value = input.value;
      saveDraft();
    });
  });
  elements.reuse.addEventListener('input', () => {
    draft.reuseIntention = Number(elements.reuse.value);
    elements.reuseOutput.value = elements.reuse.value;
    saveDraft();
  });
  elements.included.addEventListener('change', () => {
    draft.included = elements.included.value;
    elements.exclusionField.hidden = draft.included !== 'no';
    saveDraft();
  });
  elements.exclusion.addEventListener('input', () => { draft.exclusionReason = elements.exclusion.value; saveDraft(); });
  elements.save.addEventListener('click', savePeriod);
  elements.reset.addEventListener('click', resetDraft);
  elements.exportCsv.addEventListener('click', exportCsv);
  elements.copyCsv.addEventListener('click', copyCsv);
  elements.copySessionLink.addEventListener('click', copySessionLink);
  elements.exportBackup.addEventListener('click', exportBackup);
  elements.importBackup.addEventListener('change', () => {
    const file = elements.importBackup.files[0];
    if (file) importBackup(file);
  });
  elements.importSessionResult.addEventListener('change', () => {
    const file = elements.importSessionResult.files[0];
    if (file) importSessionResult(file);
  });
  elements.clear.addEventListener('click', clearData);
  window.addEventListener('beforeunload', stopTimer);
}

async function initialize() {
  try {
    const [configResponse, randomizationResponse] = await Promise.all([
      fetch('study-config.json'),
      fetch('randomization.csv')
    ]);
    if (!configResponse.ok || !randomizationResponse.ok) throw new Error('No se pudo cargar la configuración');
    config = await configResponse.json();
    scheduleRows = parseCsv(await randomizationResponse.text());
    scheduleByParticipant = new Map(scheduleRows.map((row) => [row.participant_id, row]));
    bindEvents();
    renderForm();
  } catch (error) {
    showStatus(error.message, true);
    document.querySelectorAll('button, select, input').forEach((control) => { control.disabled = true; });
  }
}

initialize();
