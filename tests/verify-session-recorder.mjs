import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStudyCsv } from '../scripts/analyze-section-theme-study.mjs';
import {
  STUDY_COLUMNS,
  buildStudyRows,
  createBackup,
  createSessionResult,
  mergePeriodRecord,
  parseCsv,
  readBackup,
  readSessionResult,
  toCsv,
  validatePeriodRecord
} from '../research/session-recorder-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const html = read('research/session-recorder.html');
const css = read('research/session-recorder.css');
const browserScript = read('research/session-recorder.js');
const participantHtml = read('research/participant-session.html');
const participantCss = read('research/participant-session.css');
const participantScript = read('research/participant-session.js');
const configText = read('research/study-config.json');
const config = JSON.parse(configText);
const schedule = parseCsv(read('research/randomization.csv'));

assert.match(html, /Content-Security-Policy/);
assert.match(html, /session-recorder\.js\?v=3/);
assert.match(html, /session-recorder\.css\?v=3/);
assert.match(html, /id="task-list"/);
assert.match(html, /id="export-csv"/);
assert.match(html, /id="import-backup"/);
assert.match(html, /id="copy-session-link"/);
assert.match(html, /id="import-session-result"/);
assert.match(html, /id="session-link-fallback"/);
assert.match(css, /prefers-color-scheme: dark/);
assert.match(browserScript, /fetch\('study-config\.json'\)/);
assert.match(browserScript, /fetch\('randomization\.csv'\)/);
assert.match(browserScript, /participant-session\.html/);
assert.match(browserScript, /Promise\.race/);
assert.match(browserScript, /execCommand\('copy'\)/);
assert.doesNotMatch(browserScript, /https?:\/\/|sendBeacon|WebSocket|XMLHttpRequest/);
assert.match(participantHtml, /Content-Security-Policy/);
assert.match(participantHtml, /id="consent-input"/);
assert.match(participantHtml, /participant-session\.js\?v=2/);
assert.match(participantHtml, /participant-session\.css\?v=2/);
assert.equal(participantHtml.match(/data-aesthetics-item=/g)?.length, 4);
assert.match(participantCss, /:root\[data-theme="dark"\]/);
assert.match(participantScript, /sessionStorage/);
assert.match(participantScript, /localStorage\.setItem\('gh-theme-v3'/);
assert.doesNotMatch(participantScript, /https?:\/\/|sendBeacon|WebSocket|XMLHttpRequest/);
assert.ok(STUDY_COLUMNS.includes('duration_seconds'));
assert.ok(STUDY_COLUMNS.includes('aesthetics_craftsmanship'));
assert.equal(config.version, 2);
assert.equal(config.primary.instrument.items.length, 4);

const records = [];
for (const assignment of schedule.slice(0, 4)) {
  for (const period of [1, 2]) {
    const tasks = assignment[`period_${period}_task_order`].split('|');
    const condition = assignment[`period_${period}_condition`];
    const visualAesthetics = condition === 'section-adaptive' ? 5.2 : 4.4;
    records.push({
      participantId: assignment.participant_id,
      period,
      device: 'mobile',
      theme: 'dark',
      visualAesthetics,
      visualAestheticsItems: Object.fromEntries(
        config.primary.instrument.items.map((item) => [item.id, visualAesthetics])
      ),
      reuseIntention: condition === 'section-adaptive' ? 5.1 : 4.3,
      included: 'yes',
      exclusionReason: '',
      taskResults: tasks.map((task, index) => ({
        task,
        success: index !== 8,
        errors: index === 0 ? 1 : 0,
        durationSeconds: condition === 'section-adaptive' ? 42 + index : 48 + index
      }))
    });
  }
}

const rows = buildStudyRows(records, schedule, config.randomization.tasks, config.primary.instrument.items);
assert.equal(rows.length, 8);
assert.ok(rows.every((row) => row.dataset_kind === 'observed'));
assert.ok(rows.every((row) => row.task_success_rate === 0.888888889));
assert.ok(rows.every((row) => row.duration_seconds > 0));
const csv = toCsv(rows);
assert.match(csv, /\r\n/);
assert.deepEqual(parseCsv(csv), rows.map((row) => Object.fromEntries(
  STUDY_COLUMNS.map((column) => [column, String(row[column])])
)));

const analysis = analyzeStudyCsv(csv, configText);
assert.equal(analysis.sample.datasetKind, 'observed');
assert.equal(analysis.sample.completeParticipants, 4);
assert.equal(analysis.decision.verdict, 'insufficient-sample');
assert.ok(analysis.metrics.duration_seconds);

assert.deepEqual(readBackup(createBackup(records)), records);
const sessionResult = createSessionResult(records[0]);
assert.deepEqual(readSessionResult(sessionResult), records[0]);
assert.throws(
  () => readSessionResult(JSON.stringify({ version: 1, records })),
  /Resultado de sesión incompatible/
);
const merged = mergePeriodRecord(records, {
  ...records[0],
  visualAesthetics: 6.2,
  visualAestheticsItems: Object.fromEntries(
    config.primary.instrument.items.map((item) => [item.id, 6.2])
  )
});
assert.equal(merged.length, records.length);
assert.equal(merged.find((record) => (
  record.participantId === records[0].participantId && record.period === records[0].period
)).visualAesthetics, 6.2);
const invalid = structuredClone(records[0]);
invalid.taskResults[0].success = null;
invalid.taskResults[1].durationSeconds = 0;
assert.ok(validatePeriodRecord(invalid, config.randomization.tasks, config.primary.instrument.items).length >= 2);
const inconsistentComposite = structuredClone(records[0]);
inconsistentComposite.visualAestheticsItems.color = 1;
assert.match(
  validatePeriodRecord(
    inconsistentComposite, config.randomization.tasks, config.primary.instrument.items
  ).join('; '),
  /promedio estético/
);

const mismatched = structuredClone(records);
mismatched[1].theme = 'light';
assert.throws(
  () => buildStudyRows(mismatched, schedule, config.randomization.tasks, config.primary.instrument.items),
  /dispositivo y tema/
);

const excluded = structuredClone(records[0]);
excluded.included = 'no';
excluded.exclusionReason = 'documented technical failure';
excluded.taskResults = [];
const excludedRow = buildStudyRows(
  [excluded], schedule, config.randomization.tasks, config.primary.instrument.items
)[0];
assert.equal(excludedRow.duration_seconds, '');
assert.equal(excludedRow.included, 'no');

console.log('  PASS (v2 local/remote recorder, four-item composite, transfer and privacy contract)');
