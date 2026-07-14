import { createHmac } from 'node:crypto';

const pin = process.env.PIN;
const pepper = process.env.PIN_PEPPER;

if (!pin || !pepper) {
  console.error('Usage: PIN="NN-NN" PIN_PEPPER="<secret>" npm run hash-pin');
  process.exitCode = 1;
} else if (!/^\d{2}-\d{2}$/.test(pin)) {
  console.error('PIN must use the NN-NN format.');
  process.exitCode = 1;
} else if (pepper.length < 32) {
  console.error('PIN_PEPPER must contain at least 32 characters.');
  process.exitCode = 1;
} else {
  process.stdout.write(createHmac('sha256', pepper).update(pin).digest('hex') + '\n');
}
