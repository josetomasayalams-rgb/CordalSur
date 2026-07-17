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

assert.equal(config.status, 'preregister-before-data-collection');
assert.equal(config.plannedCompletedParticipants, 72);
assert.equal(config.plannedRecruitment, 80);
assert.equal(config.primary.smallestEffectOfInterest, 0.35);
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
assert.equal(result.decision.taskSuccessNonInferior, true);
assert.equal(result.decision.errorsNonInferior, true);
assert.match(result.protocol.configSha256, /^[a-f0-9]{64}$/);
assert.equal(result.metrics.visual_aesthetics.estimate, 0.591667);
assert.deepEqual(result.metrics.visual_aesthetics.confidenceInterval, [0.491676, 0.691657]);
assert.equal(result.metrics.task_success_rate.holmAdjustedPValue, 0.020239);

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
  const stylesheetPosition = html.indexOf('css/section-palettes.css?v=3');
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

const excludedRows = fixtureText.split('\n').map((line) => {
  if (!line.startsWith('synthetic,P001,uniform-section-adaptive,2,')) return line;
  return 'synthetic,P001,uniform-section-adaptive,2,section-adaptive,mobile,dark,,,,,no,documented technical failure';
}).join('\n');
const excludedResult = analyzeStudyCsv(excludedRows, configText);
assert.equal(excludedResult.sample.completeParticipants, 11);
assert.equal(excludedResult.sample.excludedRows, 1);
assert.equal(excludedResult.sample.excludedParticipants, 1);

assert.throws(
  () => analyzeStudyCsv(fixtureText.replace('P001,uniform-section-adaptive,2', 'P001,uniform-section-adaptive,1'), configText),
  /periods 1 and 2/
);
assert.throws(
  () => analyzeStudyCsv(fixtureText.replace('P001,uniform-section-adaptive,2,section-adaptive', 'P001,uniform-section-adaptive,2,uniform'), configText),
  /conditions do not match assigned sequence/
);
assert.throws(
  () => analyzeStudyCsv(fixtureText.replace('P001,uniform-section-adaptive,1,uniform,mobile,dark,4.2', 'P001,uniform-section-adaptive,1,uniform,mobile,dark,9.2'), configText),
  /visual_aesthetics/
);
assert.throws(
  () => analyzeStudyCsv(fixtureText.replace('0.888888889,2,4.3', '0.8,2,4.3'), configText),
  /9 tasks/
);

console.log('  PASS (A/B instrument, preregistered crossover analysis and synthetic-data guard)');
