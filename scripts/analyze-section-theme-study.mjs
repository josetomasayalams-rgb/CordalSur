import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const DEFAULT_CONFIG = path.join(ROOT, 'research', 'study-config.json');
const REQUIRED_COLUMNS = [
  'dataset_kind',
  'participant_id',
  'sequence',
  'period',
  'condition',
  'device',
  'theme',
  'aesthetics_coherence',
  'aesthetics_variety',
  'aesthetics_color',
  'aesthetics_craftsmanship',
  'visual_aesthetics',
  'task_success_rate',
  'error_count',
  'duration_seconds',
  'reuse_intention',
  'included',
  'exclusion_reason'
];

function parseCsv(text) {
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
      if (field.length > 0) throw new Error('Malformed CSV: quote inside an unquoted field');
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field);
      if (record.some((value) => value.trim() !== '')) records.push(record);
      record = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unclosed quoted field');
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.trim() !== '')) records.push(record);
  }
  if (records.length < 2) throw new Error('CSV must contain a header and at least one data row');

  const headers = records.shift().map((value) => value.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate headers');
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) throw new Error(`CSV is missing required column: ${column}`);
  }

  return records.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function numeric(value, label, minimum, maximum = Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function logGamma(value) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) {
    series += coefficients[index] / (shifted + index + 1);
  }
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function betaContinuedFraction(x, a, b) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const doubled = 2 * iteration;
    let aa = (iteration * (b - iteration) * x) / ((qam + doubled) * (a + doubled));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;

    aa = (-((a + iteration) * (qab + iteration)) * x) / ((a + doubled) * (qap + doubled));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) return result;
  }
  throw new Error('Student t calculation did not converge');
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (factor * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (factor * betaContinuedFraction(1 - x, b, a)) / b;
}

function studentTCdf(value, degreesOfFreedom) {
  if (value === 0) return 0.5;
  const x = degreesOfFreedom / (degreesOfFreedom + value * value);
  const tail = 0.5 * regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return value > 0 ? 1 - tail : tail;
}

function studentTQuantile(probability, degreesOfFreedom) {
  if (probability === 0.5) return 0;
  if (probability < 0.5) return -studentTQuantile(1 - probability, degreesOfFreedom);
  let lower = 0;
  let upper = 100;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (studentTCdf(midpoint, degreesOfFreedom) < probability) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sampleVariance(values) {
  return sampleDeviation(values) ** 2;
}

function cronbachAlpha(rows, columns) {
  if (rows.length < 2 || columns.length < 2) return null;
  const itemVariance = columns.reduce(
    (total, column) => total + sampleVariance(rows.map((row) => row[column])),
    0
  );
  const totals = rows.map((row) => columns.reduce((total, column) => total + row[column], 0));
  const totalVariance = sampleVariance(totals);
  if (totalVariance === 0) return null;
  return (columns.length / (columns.length - 1)) * (1 - itemVariance / totalVariance);
}

function adjustedCrossover(pairs, metric, alpha) {
  const observations = pairs.map((pair) => ({
    difference: pair.treatment[metric] - pair.control[metric],
    sequenceSign: pair.sequence === 'uniform-section-adaptive' ? 1 : -1
  }));
  const n = observations.length;
  if (n < 4) throw new Error('At least four complete participants are required for adjusted analysis');
  const sumX = observations.reduce((total, item) => total + item.sequenceSign, 0);
  const sumY = observations.reduce((total, item) => total + item.difference, 0);
  const sumXX = observations.reduce((total, item) => total + item.sequenceSign ** 2, 0);
  const sumXY = observations.reduce((total, item) => total + item.sequenceSign * item.difference, 0);
  const determinant = n * sumXX - sumX ** 2;
  if (determinant === 0) throw new Error('Both counterbalanced sequences need complete participants');

  const estimate = (sumXX * sumY - sumX * sumXY) / determinant;
  const periodEffect = (n * sumXY - sumX * sumY) / determinant;
  const residuals = observations.map(
    (item) => item.difference - estimate - periodEffect * item.sequenceSign
  );
  const degreesOfFreedom = n - 2;
  const residualVariance = residuals.reduce((total, value) => total + value ** 2, 0) / degreesOfFreedom;
  const standardError = Math.sqrt((residualVariance * sumXX) / determinant);
  const critical = studentTQuantile(1 - alpha / 2, degreesOfFreedom);
  const statistic = standardError === 0 ? Math.sign(estimate) * Infinity : estimate / standardError;
  const pValue = standardError === 0
    ? (estimate === 0 ? 1 : 0)
    : Math.min(1, 2 * (1 - studentTCdf(Math.abs(statistic), degreesOfFreedom)));
  const differences = observations.map((item) => item.difference);
  const deviation = sampleDeviation(differences);

  return {
    estimate,
    confidenceInterval: [estimate - critical * standardError, estimate + critical * standardError],
    standardError,
    degreesOfFreedom,
    statistic,
    pValue,
    pairedEffectDz: deviation === 0 ? null : mean(differences) / deviation,
    periodEffect,
    rawDifferenceMean: mean(differences)
  };
}

function holmAdjust(results) {
  const ranked = results
    .map((result, index) => ({ index, pValue: result.pValue }))
    .sort((left, right) => left.pValue - right.pValue);
  let previous = 0;
  const adjusted = Array(results.length).fill(1);
  ranked.forEach((item, rank) => {
    const value = Math.max(previous, Math.min(1, item.pValue * (ranked.length - rank)));
    adjusted[item.index] = value;
    previous = value;
  });
  return results.map((result, index) => ({ ...result, holmAdjustedPValue: adjusted[index] }));
}

function roundDeep(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Number(value.toFixed(6));
  }
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundDeep(item)]));
  }
  return value;
}

function prepareRows(csvRows, config) {
  const datasetKinds = new Set(csvRows.map((row) => row.dataset_kind));
  if (datasetKinds.size !== 1 || !['synthetic', 'observed'].includes([...datasetKinds][0])) {
    throw new Error('All rows must share dataset_kind synthetic or observed');
  }

  const aestheticItems = config.primary?.instrument?.items || [];
  if (aestheticItems.length !== 4) throw new Error('Primary instrument must contain four aesthetic items');
  const candidateIncluded = [];
  const excluded = [];
  for (const [index, row] of csvRows.entries()) {
    const label = `row ${index + 2}`;
    if (!row.participant_id) throw new Error(`${label} requires participant_id`);
    if (!config.requiredSequences.includes(row.sequence)) throw new Error(`${label} has invalid sequence`);
    if (!config.allowedDevices.includes(row.device)) throw new Error(`${label} has invalid device`);
    if (!config.allowedThemes.includes(row.theme)) throw new Error(`${label} has invalid theme`);
    if (!['uniform', 'section-adaptive'].includes(row.condition)) throw new Error(`${label} has invalid condition`);
    const period = numeric(row.period, `${label} period`, 1, 2);
    if (!Number.isInteger(period)) throw new Error(`${label} period must be an integer`);
    const normalized = {
      ...row,
      period
    };
    if (row.included === 'yes') {
      for (const item of aestheticItems) {
        normalized[item.column] = numeric(row[item.column], `${label} ${item.column}`, 1, 7);
      }
      normalized.visual_aesthetics = numeric(row.visual_aesthetics, `${label} visual_aesthetics`, 1, 7);
      const composite = mean(aestheticItems.map((item) => normalized[item.column]));
      if (Math.abs(normalized.visual_aesthetics - composite) > 1e-6) {
        throw new Error(`${label} visual_aesthetics must equal the four-item mean`);
      }
      normalized.task_success_rate = numeric(row.task_success_rate, `${label} task_success_rate`, 0, 1);
      normalized.error_count = numeric(row.error_count, `${label} error_count`, 0);
      normalized.duration_seconds = numeric(row.duration_seconds, `${label} duration_seconds`, 0);
      normalized.reuse_intention = numeric(row.reuse_intention, `${label} reuse_intention`, 1, 7);
      const taskCount = config.randomization.tasks.length;
      const completedTasks = normalized.task_success_rate * taskCount;
      if (Math.abs(completedTasks - Math.round(completedTasks)) > 1e-6) {
        throw new Error(`${label} task_success_rate must represent success across ${taskCount} tasks`);
      }
      if (!Number.isInteger(normalized.error_count)) throw new Error(`${label} error_count must be an integer`);
      candidateIncluded.push(normalized);
    } else if (row.included === 'no' && row.exclusion_reason) {
      excluded.push(normalized);
    } else {
      throw new Error(`${label} requires included yes, or no with exclusion_reason`);
    }
  }

  const excludedParticipantIds = new Set(excluded.map((row) => row.participant_id));
  const included = candidateIncluded.filter((row) => !excludedParticipantIds.has(row.participant_id));
  return { datasetKind: [...datasetKinds][0], included, excluded, excludedParticipantIds };
}

function pairParticipants(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const group = grouped.get(row.participant_id) ?? [];
    group.push(row);
    grouped.set(row.participant_id, group);
  }

  const pairs = [];
  for (const [participantId, participantRows] of grouped) {
    if (participantRows.length !== 2) throw new Error(`${participantId} must have exactly two included rows`);
    const [first, second] = participantRows.sort((left, right) => left.period - right.period);
    if (first.period !== 1 || second.period !== 2) throw new Error(`${participantId} must contain periods 1 and 2`);
    if (first.sequence !== second.sequence) throw new Error(`${participantId} has inconsistent sequence`);
    if (first.device !== second.device || first.theme !== second.theme) {
      throw new Error(`${participantId} must use the same device and theme in both periods`);
    }
    const expected = first.sequence === 'uniform-section-adaptive'
      ? ['uniform', 'section-adaptive']
      : ['section-adaptive', 'uniform'];
    if (first.condition !== expected[0] || second.condition !== expected[1]) {
      throw new Error(`${participantId} conditions do not match assigned sequence`);
    }
    pairs.push({
      participantId,
      sequence: first.sequence,
      control: first.condition === 'uniform' ? first : second,
      treatment: first.condition === 'section-adaptive' ? first : second
    });
  }
  return pairs;
}

export function analyzeStudyCsv(csvText, configText) {
  const config = JSON.parse(configText);
  const configSha256 = crypto.createHash('sha256').update(configText).digest('hex');
  const prepared = prepareRows(parseCsv(csvText), config);
  const pairs = pairParticipants(prepared.included);
  const sequenceCounts = Object.fromEntries(
    config.requiredSequences.map((sequence) => [sequence, pairs.filter((pair) => pair.sequence === sequence).length])
  );
  if (Object.values(sequenceCounts).some((count) => count === 0)) {
    throw new Error('Both counterbalanced sequences need at least one complete participant');
  }
  const aestheticColumns = config.primary.instrument.items.map((item) => item.column);
  const reliability = Object.fromEntries(['uniform', 'section-adaptive'].map((condition) => {
    const rows = prepared.included.filter((row) => row.condition === condition);
    return [condition, cronbachAlpha(rows, aestheticColumns)];
  }));
  const measurementReliable = Object.values(reliability).every((alpha) => (
    alpha !== null && alpha >= config.primary.minimumCronbachAlpha
  ));
  const instrumentReady = config.primary.instrument.confirmatoryReady === true;

  const metricNames = [
    'visual_aesthetics',
    'task_success_rate',
    'error_count',
    'duration_seconds',
    'reuse_intention'
  ];
  const analyzed = Object.fromEntries(
    metricNames.map((metric) => [metric, adjustedCrossover(pairs, metric, config.alpha)])
  );
  const secondaryNames = ['task_success_rate', 'error_count', 'duration_seconds', 'reuse_intention'];
  const adjustedSecondary = holmAdjust(secondaryNames.map((name) => analyzed[name]));
  secondaryNames.forEach((name, index) => {
    analyzed[name] = adjustedSecondary[index];
  });

  const primaryPass = analyzed.visual_aesthetics.confidenceInterval[0]
    > config.primary.superiorityNull;
  const primaryMeaningfulPass = analyzed.visual_aesthetics.confidenceInterval[0]
    > config.primary.smallestEffectOfInterest;
  const successPass = analyzed.task_success_rate.confidenceInterval[0]
    > config.secondary.task_success_rate.nonInferiorityLowerBound;
  const errorsPass = analyzed.error_count.confidenceInterval[1]
    < config.secondary.error_count.nonInferiorityUpperBound;
  const eligible = prepared.datasetKind === 'observed'
    && pairs.length >= config.plannedCompletedParticipants
    && measurementReliable
    && instrumentReady;
  let verdict = 'inconclusive-or-negative';
  if (prepared.datasetKind === 'synthetic') verdict = 'simulation-only';
  else if (pairs.length < config.plannedCompletedParticipants) verdict = 'insufficient-sample';
  else if (!instrumentReady) verdict = 'instrument-not-ready';
  else if (!measurementReliable) verdict = 'measurement-unreliable';
  else if (primaryMeaningfulPass && successPass && errorsPass) verdict = 'meaningful-improvement';
  else if (primaryPass && successPass && errorsPass) verdict = 'improves-attraction';

  return roundDeep({
    protocol: {
      version: config.version,
      status: config.status,
      configSha256,
      alpha: config.alpha,
      plannedCompletedParticipants: config.plannedCompletedParticipants
    },
    sample: {
      datasetKind: prepared.datasetKind,
      completeParticipants: pairs.length,
      excludedRows: prepared.excluded.length,
      excludedParticipants: prepared.excludedParticipantIds.size,
      sequenceCounts
    },
    measurement: {
      instrument: config.primary.instrument.id,
      minimumCronbachAlpha: config.primary.minimumCronbachAlpha,
      instrumentReady,
      cronbachAlphaByCondition: reliability,
      reliable: measurementReliable
    },
    metrics: analyzed,
    decision: {
      eligible,
      primaryPass,
      primaryMeaningfulPass,
      taskSuccessNonInferior: successPass,
      errorsNonInferior: errorsPass,
      verdict
    }
  });
}

function formatResult(result) {
  const metricLines = Object.entries(result.metrics).map(([name, metric]) => {
    const [lower, upper] = metric.confidenceInterval;
    return `- ${name}: ${metric.estimate} (95% CI ${lower} to ${upper}), dz ${metric.pairedEffectDz}, p ${metric.pValue}`;
  });
  return [
    `Dataset: ${result.sample.datasetKind}`,
    `Complete participants: ${result.sample.completeParticipants}`,
    `Protocol SHA-256: ${result.protocol.configSha256}`,
    `Instrument ready: ${result.measurement.instrumentReady ? 'yes' : 'no'}`,
    `Aesthetic reliability: ${JSON.stringify(result.measurement.cronbachAlphaByCondition)}`,
    ...metricLines,
    `Eligible for confirmatory claim: ${result.decision.eligible ? 'yes' : 'no'}`,
    `Verdict: ${result.decision.verdict}`
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const argumentsList = process.argv.slice(2);
  const jsonOutput = argumentsList.includes('--json');
  const csvPath = argumentsList.find((argument) => argument !== '--json');
  if (!csvPath) {
    console.error('Usage: node scripts/analyze-section-theme-study.mjs <data.csv> [--json]');
    process.exitCode = 1;
  } else {
    const csvText = fs.readFileSync(path.resolve(csvPath), 'utf8');
    const configText = fs.readFileSync(DEFAULT_CONFIG, 'utf8');
    const result = analyzeStudyCsv(csvText, configText);
    console.log(jsonOutput ? JSON.stringify(result, null, 2) : formatResult(result));
  }
}
