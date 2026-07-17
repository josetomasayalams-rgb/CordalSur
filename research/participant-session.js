import {
  calculateAestheticComposite,
  createSessionResult,
  parseCsv,
  validatePeriodRecord
} from './session-recorder-core.mjs';

const TASKS = {
  wifi: {
    title: 'Encontrar Wi-Fi',
    prompt: 'Encuentra en la guía la contraseña de la red Wi-Fi del alojamiento.'
  },
  checkin: {
    title: 'Revisar check-in',
    prompt: 'Encuentra la información necesaria para realizar el check-in.'
  },
  restaurant: {
    title: 'Elegir restaurante',
    prompt: 'Busca un restaurante que considerarías para una comida durante la estadía.'
  },
  activity: {
    title: 'Encontrar actividad',
    prompt: 'Encuentra una actividad que te interesaría realizar en la zona.'
  },
  nearby: {
    title: 'Ubicar servicio cercano',
    prompt: 'Encuentra un servicio cercano que podría ser útil durante la estadía.'
  },
  weather: {
    title: 'Consultar clima',
    prompt: 'Busca la información del clima disponible en la guía.'
  },
  tickets: {
    title: 'Localizar tickets',
    prompt: 'Encuentra dónde revisar o comprar tickets para una actividad de montaña.'
  },
  checkout: {
    title: 'Revisar check-out',
    prompt: 'Encuentra las indicaciones que debes seguir antes de hacer check-out.'
  },
  emergency: {
    title: 'Encontrar emergencia',
    prompt: 'Encuentra la información que usarías ante una emergencia.'
  }
};

const DEVICE_LABELS = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Escritorio' };
const THEME_LABELS = { light: 'Claro', dark: 'Oscuro' };
const params = new URL(window.location.href).searchParams;

const elements = {
  sessionId: document.querySelector('#session-id'),
  intro: document.querySelector('#intro-screen'),
  task: document.querySelector('#task-screen'),
  rating: document.querySelector('#rating-screen'),
  done: document.querySelector('#done-screen'),
  invalid: document.querySelector('#invalid-screen'),
  invalidMessage: document.querySelector('#invalid-message'),
  participant: document.querySelector('#participant-value'),
  period: document.querySelector('#period-value'),
  device: document.querySelector('#device-value'),
  theme: document.querySelector('#theme-value'),
  deviceWarning: document.querySelector('#device-warning'),
  consent: document.querySelector('#consent-input'),
  begin: document.querySelector('#begin-session'),
  taskProgress: document.querySelector('#task-progress'),
  taskTitle: document.querySelector('#task-title'),
  taskPrompt: document.querySelector('#task-prompt'),
  taskTimer: document.querySelector('#task-timer'),
  startTask: document.querySelector('#start-task'),
  outcome: document.querySelector('#outcome-panel'),
  taskErrors: document.querySelector('#task-errors'),
  taskSuccess: document.querySelector('#task-success'),
  taskFailure: document.querySelector('#task-failure'),
  aestheticsFields: [...document.querySelectorAll('[data-aesthetics-item]')],
  reuse: document.querySelector('#reuse-input'),
  reuseOutput: document.querySelector('#reuse-output'),
  finish: document.querySelector('#finish-session'),
  download: document.querySelector('#download-result'),
  downloadState: document.querySelector('#download-state'),
  status: document.querySelector('#status')
};

let config;
let assignment;
let participantId;
let period;
let device;
let theme;
let conditionCode;
let taskOrder = [];
let state;
let timerInterval;
let conditionWindow;
let toastTimer;
let deviceMatches = true;

function showOnly(screen) {
  [elements.intro, elements.task, elements.rating, elements.done, elements.invalid].forEach((candidate) => {
    candidate.hidden = candidate !== screen;
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showStatus(message, isError = false) {
  clearTimeout(toastTimer);
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
  elements.status.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.status.classList.remove('is-visible'), 3200);
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function storageKey() {
  return `cordalsur-participant-session-v2:${participantId}:${period}`;
}

function defaultAestheticItems() {
  return Object.fromEntries(config.primary.instrument.items.map((item) => [item.id, 4]));
}

function defaultState() {
  return {
    version: 2,
    participantId,
    period,
    started: false,
    completed: false,
    currentTask: 0,
    activeTaskStartedAt: null,
    visualAesthetics: 4,
    visualAestheticsItems: defaultAestheticItems(),
    reuseIntention: 4,
    taskResults: taskOrder.map((task) => ({ task, success: null, errors: 0, durationSeconds: 0 }))
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
    if (
      parsed?.version === 2 &&
      parsed.participantId === participantId &&
      Number(parsed.period) === period &&
      Array.isArray(parsed.taskResults)
    ) return parsed;
  } catch (error) {}
  return defaultState();
}

function persistState() {
  sessionStorage.setItem(storageKey(), JSON.stringify(state));
}

function stopTicker() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimer() {
  if (!state.activeTaskStartedAt) {
    elements.taskTimer.textContent = '0:00';
    return;
  }
  elements.taskTimer.textContent = formatDuration(Date.now() - state.activeTaskStartedAt);
}

function startTicker() {
  stopTicker();
  updateTimer();
  timerInterval = setInterval(updateTimer, 250);
}

function renderTask() {
  if (state.currentTask >= taskOrder.length) {
    stopTicker();
    elements.aestheticsFields.forEach((field) => {
      const input = field.querySelector('input');
      const output = field.querySelector('output');
      input.value = state.visualAestheticsItems[field.dataset.aestheticsItem];
      output.value = input.value;
    });
    elements.reuse.value = state.reuseIntention;
    elements.reuseOutput.value = String(state.reuseIntention);
    showOnly(elements.rating);
    return;
  }

  const task = taskOrder[state.currentTask];
  const definition = TASKS[task] || { title: task, prompt: task };
  elements.taskProgress.textContent = `Tarea ${state.currentTask + 1} de ${taskOrder.length}`;
  elements.taskTitle.textContent = definition.title;
  elements.taskPrompt.textContent = definition.prompt;
  elements.taskErrors.value = '0';
  elements.outcome.hidden = !state.activeTaskStartedAt;
  elements.startTask.textContent = state.activeTaskStartedAt ? 'Volver a abrir la guía' : 'Iniciar tarea y abrir la guía';
  if (state.activeTaskStartedAt) startTicker();
  else updateTimer();
  showOnly(elements.task);
}

function buildAppUrl() {
  const url = new URL('../', window.location.href);
  url.searchParams.set('condition', conditionCode);
  return url.href;
}

function openCondition() {
  try { localStorage.setItem('gh-theme-v3', theme); } catch (error) {}
  const appUrl = buildAppUrl();
  if (conditionWindow && !conditionWindow.closed) {
    conditionWindow.location.href = appUrl;
    conditionWindow.focus();
    return;
  }
  conditionWindow = window.open(appUrl, 'cordalsur-study-condition');
  if (!conditionWindow) showStatus('El navegador bloqueó la pestaña. Permite ventanas emergentes y vuelve a intentar.', true);
}

function startTask() {
  if (!state.activeTaskStartedAt) {
    state.activeTaskStartedAt = Date.now();
    persistState();
    elements.outcome.hidden = false;
    elements.startTask.textContent = 'Volver a abrir la guía';
    startTicker();
  }
  openCondition();
}

function completeTask(success) {
  if (!state.activeTaskStartedAt) {
    showStatus('Inicia la tarea antes de registrar el resultado', true);
    return;
  }
  const errors = Number(elements.taskErrors.value);
  if (!Number.isInteger(errors) || errors < 0) {
    showStatus('Los errores deben ser un número entero desde cero', true);
    return;
  }
  const result = state.taskResults[state.currentTask];
  result.success = success;
  result.errors = errors;
  result.durationSeconds = Number(Math.max(1, (Date.now() - state.activeTaskStartedAt) / 1000).toFixed(3));
  state.currentTask += 1;
  state.activeTaskStartedAt = null;
  persistState();
  renderTask();
}

function currentRecord() {
  const visualAesthetics = calculateAestheticComposite(state, config.primary.instrument.items);
  return {
    participantId,
    period,
    device,
    theme,
    visualAesthetics,
    visualAestheticsItems: state.visualAestheticsItems,
    reuseIntention: Number(state.reuseIntention),
    included: 'yes',
    exclusionReason: '',
    taskResults: state.taskResults
  };
}

function resultJson() {
  const record = currentRecord();
  const errors = validatePeriodRecord(record, config.randomization.tasks, config.primary.instrument.items);
  if (errors.length) throw new Error(errors[0]);
  return createSessionResult(record);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadResult() {
  try {
    download(
      `cordalsur-${participantId}-periodo-${period}.json`,
      resultJson(),
      'application/json'
    );
    elements.downloadState.textContent = 'Resultado descargado. Ya puedes entregarlo al responsable del estudio.';
  } catch (error) {
    showStatus(error.message, true);
  }
}

function finishSession() {
  state.visualAesthetics = calculateAestheticComposite(state, config.primary.instrument.items);
  state.reuseIntention = Number(elements.reuse.value);
  try {
    resultJson();
    state.completed = true;
    persistState();
    showOnly(elements.done);
  } catch (error) {
    showStatus(error.message, true);
  }
}

function beginSession() {
  if (!elements.consent.checked) return;
  state.started = true;
  persistState();
  renderTask();
}

function bindEvents() {
  elements.consent.addEventListener('change', () => {
    elements.begin.disabled = !elements.consent.checked || !deviceMatches;
  });
  elements.begin.addEventListener('click', beginSession);
  elements.startTask.addEventListener('click', startTask);
  elements.taskSuccess.addEventListener('click', () => completeTask(true));
  elements.taskFailure.addEventListener('click', () => completeTask(false));
  elements.aestheticsFields.forEach((field) => {
    const input = field.querySelector('input');
    const output = field.querySelector('output');
    input.addEventListener('input', () => {
      state.visualAestheticsItems[field.dataset.aestheticsItem] = Number(input.value);
      state.visualAesthetics = calculateAestheticComposite(state, config.primary.instrument.items);
      output.value = input.value;
      persistState();
    });
  });
  elements.reuse.addEventListener('input', () => {
    state.reuseIntention = Number(elements.reuse.value);
    elements.reuseOutput.value = elements.reuse.value;
    persistState();
  });
  elements.finish.addEventListener('click', finishSession);
  elements.download.addEventListener('click', downloadResult);
  window.addEventListener('beforeunload', stopTicker);
}

function invalidate(message) {
  elements.sessionId.textContent = 'Sesión inválida';
  elements.invalidMessage.textContent = message;
  showOnly(elements.invalid);
}

async function initialize() {
  participantId = params.get('participant') || '';
  period = Number(params.get('period'));
  device = params.get('device') || '';
  theme = params.get('theme') || '';

  if (!/^P\d{3}$/.test(participantId) || ![1, 2].includes(period)) {
    invalidate('El enlace no contiene un participante y período válidos.');
    return;
  }
  if (!Object.hasOwn(DEVICE_LABELS, device) || !Object.hasOwn(THEME_LABELS, theme)) {
    invalidate('El enlace no contiene un dispositivo y tema válidos.');
    return;
  }
  document.documentElement.dataset.theme = theme;

  try {
    const [configResponse, scheduleResponse] = await Promise.all([
      fetch('study-config.json'),
      fetch('randomization.csv')
    ]);
    if (!configResponse.ok || !scheduleResponse.ok) throw new Error('No se pudo cargar la asignación.');
    config = await configResponse.json();
    const schedule = parseCsv(await scheduleResponse.text());
    assignment = schedule.find((row) => row.participant_id === participantId);
    if (!assignment) throw new Error('El participante no existe en la asignación.');
    conditionCode = assignment[`period_${period}_code`];
    taskOrder = assignment[`period_${period}_task_order`].split('|');
    if (!conditionCode || taskOrder.length !== config.randomization.tasks.length) {
      throw new Error('La asignación del período está incompleta.');
    }

    elements.sessionId.textContent = `${participantId} · ${period}/2`;
    elements.participant.textContent = participantId;
    elements.period.textContent = `${period} de 2`;
    elements.device.textContent = DEVICE_LABELS[device];
    elements.theme.textContent = THEME_LABELS[theme];
    const shortScreenSide = Math.min(window.screen.width, window.screen.height);
    const detectedDevice = shortScreenSide <= 600 ? 'mobile' : shortScreenSide <= 1100 ? 'tablet' : 'desktop';
    deviceMatches = detectedDevice === device;
    elements.deviceWarning.hidden = deviceMatches;
    if (!deviceMatches) {
      elements.deviceWarning.textContent = `Este enlace fue asignado a ${DEVICE_LABELS[device]}, pero el dispositivo actual parece ${DEVICE_LABELS[detectedDevice]}. Solicita un enlace corregido o ábrelo en el dispositivo asignado.`;
    }
    state = loadState();
    bindEvents();

    if (state.completed) showOnly(elements.done);
    else if (state.started) renderTask();
    else showOnly(elements.intro);
  } catch (error) {
    invalidate(error.message);
  }
}

initialize();
