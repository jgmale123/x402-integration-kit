import { AgentRuntime, stringToUuid } from '@elizaos/core';
import { randomUUID } from 'node:crypto';
import { ACTION_NAME, BriefError, createBlockchainIqPlugin, getPluginBudget } from './index.js';

/** A deliberately scoped single-action host, not a persistent chat/database server. */
export async function createElizaBriefRunner(options = {}) {
  const ownerEntityId = stringToUuid('blockchainiq-local-owner');
  let privateResult, attempted = false, stopped = false;
  const controller = new AbortController();
  const memories = [], logs = [], events = [];
  const adapter = {
    createMemory: async (memory, table) => { memories.push({ memory, table }); return memory.id; },
    log: async entry => { logs.push(entry); },
  };
  const runtime = new AgentRuntime({
    character: { id: stringToUuid('blockchainiq-private-runner'), name: 'BlockchainIQPrivateRunner', bio: [], settings: {} },
    adapter, settings: {},
  });
  const plugin = createBlockchainIqPlugin({ ...options, ownerEntityId, signal: controller.signal, onBrief: result => { privateResult = result; } });
  await runtime.registerPlugin(plugin);
  runtime.registerEvent('ACTION_COMPLETED', async event => { events.push(event); });
  return {
    runtime, plugin,
    getBudget: () => getPluginBudget(plugin),
    // These contain only the safe framework records; exposed to audit privacy.
    getAudit: () => ({ memories, logs, events, state: [...runtime.stateCache.values()] }),
    async run() {
      if (attempted || stopped) throw new BriefError('RUNNER_ATTEMPT_EXHAUSTED');
      attempted = true;
      const message = {
        id: randomUUID(), entityId: ownerEntityId, roomId: stringToUuid('blockchainiq-private-room'),
        worldId: stringToUuid('blockchainiq-private-world'), content: { text: 'Fetch the fixed private market brief.', source: 'private-owner' },
      };
      const response = { ...message, id: randomUUID(), entityId: runtime.agentId, content: { text: '', actions: [ACTION_NAME] } };
      try {
        await runtime.processActions(message, [response], { values: {}, data: {}, text: '' }, async () => []);
        if (!privateResult) {
          const result = runtime.getActionResults(message.id).at(-1);
          throw new BriefError(result?.data?.code || 'ACTION_DID_NOT_RETURN_A_PRIVATE_RESULT');
        }
        const result = privateResult;
        privateResult = undefined;
        return result;
      } finally { privateResult = undefined; }
    },
    async stop() { stopped = true; controller.abort(); privateResult = undefined; await runtime.stop(); },
  };
}
