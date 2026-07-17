import { prepareNetwork, routeDistances } from './road-routing-core.mjs';

let network = null;

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      const response = await fetch(message.networkUrl || '../data/driving-network.json', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`driving network ${response.status}`);
      network = prepareNetwork(await response.json());
      self.postMessage({ type: 'ready', requestId: message.requestId, destinations: network.destinations.length });
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
      self.close();
    }
  } catch (error) {
    self.postMessage({ type: 'error', requestId: message.requestId, message: error instanceof Error ? error.message : String(error) });
  }
});
