import { networkIdentity, prepareNetwork, routeDistances } from './road-routing-core.mjs';

let network = null;
let graph = null;

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function expectedIdentity(message) {
  const expected = message.expectedGraph && typeof message.expectedGraph === 'object' ? message.expectedGraph : {};
  return {
    schemaVersion: expected.schemaVersion ?? message.expectedGraphSchemaVersion ?? null,
    version: expected.version || expected.generatedAt || message.expectedGraphVersion || null,
    hash: expected.hash || expected.responseSha256 || message.expectedGraphHash || null
  };
}

function validateIdentity(actual, expected) {
  for (const key of ['schemaVersion', 'version', 'hash']) {
    if (expected[key] !== null && expected[key] !== undefined && String(actual[key]) !== String(expected[key])) {
      throw codedError(`driving network ${key} mismatch`, 'ROAD_GRAPH_MISMATCH');
    }
  }
}

function sameOriginNetworkUrl(value) {
  const url = new URL(value || '../data/driving-network.json', self.location.href);
  if (url.origin !== self.location.origin) throw codedError('driving network must be same-origin', 'ROAD_NETWORK_ORIGIN');
  return url.href;
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      const response = await fetch(sameOriginNetworkUrl(message.networkUrl), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`driving network ${response.status}`);
      const raw = await response.json();
      const actualGraph = networkIdentity(raw);
      validateIdentity(actualGraph, expectedIdentity(message));
      network = prepareNetwork(raw);
      graph = actualGraph;
      self.postMessage({ type: 'ready', requestId: message.requestId, graph, destinations: (network.destinations || []).length });
      return;
    }
    if (message.type === 'route') {
      if (!network) throw new Error('driving network not ready');
      const result = routeDistances(network, message.origin);
      self.postMessage({ type: 'result', requestId: message.requestId, ...result });
      return;
    }
    if (message.type === 'dispose') {
      network = null;
      graph = null;
      self.close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      code: error && error.code ? error.code : 'ROAD_WORKER_ERROR',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
