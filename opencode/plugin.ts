import type { Plugin } from '@opencode-ai/plugin';

/**
 * opencode-effect-harness — OpenCode plugin entrypoint.
 *
 * Currently a no-op placeholder. Real hook implementations land in later tasks.
 */
const effectHarnessPlugin: Plugin = async (_ctx) => {
	return {};
};

export default effectHarnessPlugin;
