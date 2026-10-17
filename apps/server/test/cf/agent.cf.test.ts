import { SELF } from 'cloudflare:test';
import { agentApiTests } from '../helpers/agent-api.js';

agentApiTests(() => ({
  request: async (path, init) => SELF.fetch(`http://esbuddy.test${path}`, init),
}));
