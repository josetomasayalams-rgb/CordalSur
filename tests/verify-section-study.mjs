import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStudyCsv } from '../scripts/analyze-section-theme-study.mjs';
import { renderRandomization } from '../scripts/generate-section-theme-randomization.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configText = fs.readFileSync(path.join(ROOT, 'research', 'study-config.json'), 'utf8');
const fixtureText = fs.readFileSync(
  path.join(ROOT, 'research', 'fixtures', 'section-theme-study.sample.csv'),
  'utf8'
);
const config = JSON.parse(configText);
const result = analyzeStudyCsv(fixtureText, configText);
const randomizationText = fs.readFileSync(path.join(ROOT, 'research', 'randomization.csv'), 'utf8');
const paletteData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'section-palettes.json'), 'utf8'));
const paletteCss = fs.readFileSync(path.join(ROOT, 'css', 'section-palettes.css'), 'utf8');
const conditionScript = fs.readFileSync(path.join(ROOT, 'js', 'study-condition.js'), 'utf8');
const adaptationProtocol = fs.readFileSync(path.join(ROOT, 'research', 'INSTRUMENT_ADAPTATION.md'), 'utf8');
const STUDY_OUTCOME_COLUMNS = [
  ...config.primary.instrument.items.map((item) => item.column),
  'visual_aesthetics',
  'task_success_rate',
  'error_count',
  'duration_seconds',
  'reuse_intention'
];

function mutateFixture(text, participantId, period, mutation) {
  const lines = text.trimEnd().split(/\r?\n/);
  const headers = lines[0].split(',');
  return `${lines.map((line, index) => {
    if (index === 0) return line;
    const values = line.split(',');
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    if (row.participant_id !== participantId || row.period !== String(period)) return line;
    mutation(row);
    return headers.map((header) => row[header]).join(',');
  }).join('\n')}\n`;
}

assert.equal(config.status, 'preregister-before-data-collection');
assert.equal(config.version, 2);
assert.equal(config.plannedCompletedParticipants, 72);
assert.equal(config.plannedRecruitment, 80);
assert.equal(config.primary.smallestEffectOfInterest, 0.35);
assert.equal(config.primary.superiorityNull, 0);
assert.equal(config.primary.instrument.items.length, 4);
assert.equal(config.primary.instrument.confirmatoryReady, false);
assert.match(adaptationProtocol, /confirmatoryReady/);
assert.match(adaptationProtocol, /retrotraducci/);
assert.deepEqual(config.conditionCodes, { uniform: 'a', 'section-adaptive': 'b' });
assert.equal(result.sample.datasetKind, 'synthetic');
assert.equal(result.sample.completeParticipants, 12);
assert.deepEqual(result.sample.sequenceCounts, {
  'uniform-section-adaptive': 6,
  'section-adaptive-uniform': 6
});
assert.equal(result.decision.eligible, false);
assert.equal(result.decision.verdict, 'simulation-only');
assert.equal(result.decision.primaryPass, true);
assert.equal(result.decision.primaryMeaningfulPass, true);
assert.equal(result.decision.taskSuccessNonInferior, true);
assert.equal(result.decision.errorsNonInferior, true);
assert.equal(result.measurement.reliable, true);
assert.equal(result.measurement.instrumentReady, false);
assert.deepEqual(result.measurement.cronbachAlphaByCondition, {
  uniform: 1,
  'section-adaptive': 1
});
assert.match(result.protocol.configSha256, /^[a-f0-9]{64}$/);
assert.equal(result.metrics.visual_aesthetics.estimate, 0.591667);
assert.deepEqual(result.metrics.visual_aesthetics.confidenceInterval, [0.491676, 0.691657]);
assert.equal(result.metrics.task_success_rate.holmAdjustedPValue, 0.020239);
assert.equal(result.metrics.duration_seconds.estimate, -32.5);
assert.deepEqual(result.metrics.duration_seconds.confidenceInterval, [-42.516304, -22.483696]);

assert.equal(renderRandomization(config), randomizationText);
const randomizationLines = randomizationText.trim().split('\n');
const randomizationHeaders = randomizationLines.shift().split(',');
const assignments = randomizationLines.map((line) => Object.fromEntries(
  line.split(',').map((value, index) => [randomizationHeaders[index], value])
));
assert.equal(assignments.length, 80);
assert.equal(new Set(assignments.map((row) => row.participant_id)).size, 80);
assert.equal(assignments.filter((row) => row.sequence === 'uniform-section-adaptive').length, 40);
assert.equal(assignments.filter((row) => row.sequence === 'section-adaptive-uniform').length, 40);
for (let block = 1; block <= 20; block += 1) {
  const blockRows = assignments.filter((row) => Number(row.block) === block);
  assert.equal(blockRows.length, 4);
  assert.equal(blockRows.filter((row) => row.sequence === 'uniform-section-adaptive').length, 2);
  for (const row of blockRows) {
    assert.equal(row.period_1_code, config.conditionCodes[row.period_1_condition]);
    assert.equal(row.period_2_code, config.conditionCodes[row.period_2_condition]);
    assert.deepEqual(new Set(row.period_1_task_order.split('|')), new Set(config.randomization.tasks));
    assert.deepEqual(new Set(row.period_2_task_order.split('|')), new Set(config.randomization.tasks));
  }
}

for (const definition of Object.values(paletteData.sections)) {
  const html = fs.readFileSync(path.join(ROOT, definition.page), 'utf8');
  const loaderPosition = html.indexOf('data-study-condition');
  const stylesheetPosition = html.indexOf('css/section-palettes.css?v=5');
  assert.ok(loaderPosition >= 0 && loaderPosition < stylesheetPosition, `${definition.page}: condition must load before CSS`);
  assert.match(html, /js\/study-condition\.js\?v=1/);
}
assert.match(paletteCss, /html\[data-study-condition="a"\]\[data-theme="light"\] body\[data-section\]/);
assert.match(paletteCss, /html\[data-study-condition="a"\]\[data-theme="dark"\] body\[data-section\]/);
assert.doesNotMatch(paletteCss, /data-study-condition="b"/);
assert.match(conditionScript, /searchParams\.set\('condition', condition\)/);
assert.doesNotMatch(conditionScript, /localStorage|sessionStorage/);

const tooSmallObserved = fixtureText.replaceAll('synthetic,', 'observed,');
const tooSmallResult = analyzeStudyCsv(tooSmallObserved, configText);
assert.equal(tooSmallResult.decision.eligible, false);
assert.equal(tooSmallResult.decision.verdict, 'insufficient-sample');

const readinessConfig = structuredClone(config);
readinessConfig.plannedCompletedParticipants = 4;
const notReadyResult = analyzeStudyCsv(tooSmallObserved, JSON.stringify(readinessConfig));
assert.equal(notReadyResult.decision.eligible, false);
assert.equal(notReadyResult.decision.verdict, 'instrument-not-ready');
readinessConfig.primary.instrument.confirmatoryReady = true;
const readyResult = analyzeStudyCsv(tooSmallObserved, JSON.stringify(readinessConfig));
assert.equal(readyResult.decision.eligible, true);
assert.equal(readyResult.decision.verdict, 'meaningful-improvement');
readinessConfig.primary.minimumCronbachAlpha = 1.01;
const unreliableResult = analyzeStudyCsv(tooSmallObserved, JSON.stringify(readinessConfig));
assert.equal(unreliableResult.decision.eligible, false);
assert.equal(unreliableResult.decision.verdict, 'measurement-unreliable');

const excludedRows = mutateFixture(fixtureText, 'P001', 2, (row) => {
  for (const column of STUDY_OUTCOME_COLUMNS) row[column] = '';
  row.included = 'no';
  row.exclusion_reason = 'documented technical failure';
});
const excludedResult = analyzeStudyCsv(excludedRows, configText);
assert.equal(excludedResult.sample.completeParticipants, 11);
assert.equal(excludedResult.sample.excludedRows, 1);
assert.equal(excludedResult.sample.excludedParticipants, 1);

assert.throws(
  () => analyzeStudyCsv(mutateFixture(fixtureText, 'P001', 2, (row) => { row.period = '1'; }), configText),
  /periods 1 and 2/
);
assert.throws(
  () => analyzeStudyCsv(mutateFixture(fixtureText, 'P001', 2, (row) => { row.condition = 'uniform'; }), configText),
  /conditions do not match assigned sequence/
);
assert.throws(
  () => analyzeStudyCsv(mutateFixture(fixtureText, 'P001', 1, (row) => { row.visual_aesthetics = '9.2'; }), configText),
  /visual_aesthetics/
);
assert.throws(
  () => analyzeStudyCsv(mutateFixture(fixtureText, 'P001', 1, (row) => { row.task_success_rate = '0.8'; }), configText),
  /9 tasks/
);

console.log('  PASS (four-item A/B instrument, reliability/readiness gates and crossover analysis)');
