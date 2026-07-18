import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_ROOT, '../..');

const nestedLanding = path.join(PROJECT_ROOT, '01-landing-page-cordal-sur-andes-chillan');
export const LANDING_ROOT = fs.existsSync(path.join(nestedLanding, 'data')) ? nestedLanding : PROJECT_ROOT;
const nestedWorker = path.join(PROJECT_ROOT, '02-servicio-de-acceso');
export const WORKER_ROOT = fs.existsSync(path.join(nestedWorker, 'src')) ? nestedWorker : path.join(PROJECT_ROOT, 'worker');
export const ROAD_CORE_URL = pathToFileURL(path.join(LANDING_ROOT, 'js/road-routing-core.mjs')).href;
