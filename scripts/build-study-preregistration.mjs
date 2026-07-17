import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRandomization } from './generate-section-theme-randomization.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const LOCKED_DIRECTORIES = ['assets', 'css', 'js'];
const LOCKED_FILES = [
  'data/host-data.json',
  'data/section-palettes.json',
  'research/INSTRUMENT_ADAPTATION.md',
  'research/SECTION_THEME_STUDY.md',
  'research/STUDY_RUNBOOK.md',
  'research/participant-session.css',
  'research/participant-session.html',
  'research/participant-session.js',
  'research/randomization.csv',
  'research/session-recorder-core.mjs',
  'research/session-recorder.css',
  'research/session-recorder.html',
  'research/session-recorder.js',
  'research/study-config.json',
  'scripts/analyze-section-theme-study.mjs',
  'scripts/build-study-preregistration.mjs',
  'scripts/generate-section-palettes.mjs',
  'scripts/generate-section-theme-randomization.mjs'
];

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walkFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) throw new Error(`Missing locked directory: ${relativeDirectory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return walkFiles(root, relative);
    if (entry.isFile() && entry.name !== '.DS_Store') return [relative];
    return [];
  });
}

function lockedPaths(root) {
  const rootFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);
  return [...new Set([
    ...rootFiles,
    ...LOCKED_FILES,
    ...LOCKED_DIRECTORIES.flatMap((directory) => walkFiles(root, directory))
  ])].sort();
}

function fileEvidence(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Missing locked file: ${relativePath}`);
  const content = fs.readFileSync(absolute);
  return {
    path: relativePath,
    bytes: content.byteLength,
    sha256: sha256(content)
  };
}

export function buildPreregistrationManifest(root = ROOT, { draft = false } = {}) {
  const configPath = path.join(root, 'research', 'study-config.json');
  const configText = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configText);
  if (config.status !== 'preregister-before-data-collection') {
    throw new Error('Study configuration is not in preregistration state');
  }
  if (!draft && config.primary?.instrument?.confirmatoryReady !== true) {
    throw new Error('Instrument is not ready: complete adaptation before final preregistration');
  }

  const randomizationPath = path.join(root, 'research', 'randomization.csv');
  const randomization = fs.readFileSync(randomizationPath, 'utf8');
  if (renderRandomization(config) !== randomization) {
    throw new Error('Randomization does not match the locked configuration');
  }

  const files = lockedPaths(root).map((relativePath) => fileEvidence(root, relativePath));
  const treeInput = files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join('');
  return {
    schemaVersion: 1,
    status: draft ? 'draft-not-ready' : 'ready-for-external-timestamp',
    protocolVersion: config.version,
    instrument: {
      id: config.primary.instrument.id,
      language: config.primary.instrument.language,
      translationStatus: config.primary.instrument.translationStatus,
      confirmatoryReady: config.primary.instrument.confirmatoryReady
    },
    design: config.design,
    plannedRecruitment: config.plannedRecruitment,
    plannedCompletedParticipants: config.plannedCompletedParticipants,
    conditionCodes: config.conditionCodes,
    configSha256: sha256(configText),
    lockedTreeSha256: sha256(treeInput),
    fileCount: files.length,
    files
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--draft');
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  const manifest = buildPreregistrationManifest(ROOT, { draft: process.argv.includes('--draft') });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
