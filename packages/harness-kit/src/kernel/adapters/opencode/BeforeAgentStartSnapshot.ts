import { Effect } from 'effect';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';
import { fromSessionStateStore } from './BranchSnapshot.ts';

/**
 * The OpenCode plugin calls this on every hook fire to produce an
 * ActiveBranch.Value the rules can consume. It's a thin re-export of
 * BranchSnapshot.fromSessionStateStore for naming symmetry with the Pi
 * adapter's `activeBranchFromContext`.
 */
export const activeBranchForSession = (
	sessionId: string
): Effect.Effect<ActiveBranch.Value, never, SessionStateStore.Service> =>
	fromSessionStateStore(sessionId);
