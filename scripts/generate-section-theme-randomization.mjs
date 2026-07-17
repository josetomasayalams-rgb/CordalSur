import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const CONFIG_PATH = path.join(ROOT, 'research', 'study-config.json');
const OUTPUT_PATH = path.join(ROOT, 'research', 'randomization.csv');

function seededUnit(seed, label) {
  const digest = crypto.createHash('sha256').update(`${seed}:${label}`).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

function shuffle(values, seed, label) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(seededUnit(seed, `${label}:${index}`) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function rotate(values, offset) {
  const normalized = offset % values.length;
  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

export function renderRandomization(config) {
  const { seed, blockSize, tasks } = config.randomization;
  const total = config.plannedRecruitment;
  if (!seed || blockSize < 2 || blockSize % 2 !== 0) {
    throw new Error('Randomization requires a seed and an even block size');
  }
  if (total % blockSize !== 0) throw new Error('Recruitment total must be divisible by block size');
  if (new Set(tasks).size !== tasks.length || tasks.length !== 8) {
    throw new Error('Randomization requires eight unique tasks');
  }

  const baseTasks = shuffle(tasks, seed, 'task-base');
  const rows = [
    'participant_id,block,sequence,period_1_condition,period_2_condition,period_1_task_order,period_2_task_order'
  ];
  let participantNumber = 1;

  for (let block = 1; block <= total / blockSize; block += 1) {
    const balanced = Array.from({ length: blockSize / 2 }, () => [
      'uniform-section-adaptive',
      'section-adaptive-uniform'
    ]).flat();
    const sequences = shuffle(balanced, seed, `block:${block}`);
    sequences.forEach((sequence, position) => {
      const participantId = `P${String(participantNumber).padStart(3, '0')}`;
      const offset = (participantNumber - 1) % tasks.length;
      const firstOrder = rotate(baseTasks, offset);
      const secondOrder = rotate([...baseTasks].reverse(), (offset + position + 1) % tasks.length);
      const [period1, period2] = sequence === 'uniform-section-adaptive'
        ? ['uniform', 'section-adaptive']
        : ['section-adaptive', 'uniform'];
      rows.push([
        participantId,
        block,
        sequence,
        period1,
        period2,
        firstOrder.join('|'),
        secondOrder.join('|')
      ].join(','));
      participantNumber += 1;
    });
  }
  return `${rows.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  fs.writeFileSync(OUTPUT_PATH, renderRandomization(config), 'utf8');
  console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)}`);
}
