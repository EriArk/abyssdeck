// Durable reconciliation, independent of the native Codex process/job.
// Ports must implement observed, idempotent maintenance effects, never chat sends.
export const terminal = new Set(['completed', 'rolledBack', 'cancelled', 'needsAttention']);

export async function reconcile(state, io) {
  if (terminal.has(state.phase)) {
    if (state.cleanupPending) await cleanup();
    return;
  }
  const save = async (phase, extra = {}) => {
    Object.assign(state, extra, {phase, updatedAt: io.now()});
    await io.save(state); // intent is durable before each external effect
  };
  try {
    await io.preflight(state);
    if (!state.fenced) {
      if (state.phase === 'waitingIdle' && (await io.inspect()).config !== 'previous') {
        return await save('needsAttention', {detail: 'Configuration changed before admission; Hub remains available'});
      }
      // acquire is keyed by the durable operation ID. A lost acknowledgement is
      // reconciled by the same maintenance operation, never another operation ID.
      if (io.now() > state.deadline && state.phase === 'waitingIdle') {
        return await save('cancelled', {detail: 'No idle admission before deadline'});
      }
      await save('acquiring');
      const admission = await io.hub('acquire');
      if (admission === 'waitingIdle') return await save('waitingIdle');
      if (admission === 'draining' || admission === 'unknown') return;
      if (admission === 'released') return await finishReleased();
      if (admission !== 'drained') throw new Error('Unexpected maintenance admission');
      await save('drained', {fenced: true});
    }
    const lease = await io.hub('status');
    if (lease === 'released') return await finishReleased();
    if (lease !== 'drained') throw new Error('Maintenance lease is not drained');
    const observed = await io.inspect();
    const desired = state.rollback ? 'previous' : 'candidate';
    if (!['previous','candidate'].includes(observed.config)) {
      return await save('needsAttention', {detail: 'Configuration changed outside this operation; not overwritten'});
    }
    if (observed.config !== desired) {
      if (observed.children) return await save('needsAttention', {detail: 'Native children remain under the fenced broker; not stopped'});
      await save('stopping');
      await io.stop();
      await save('switching');
      await io.switchConfig(desired);
      // The broker must be restarted after changing its cached configuration.
      await save('starting', {startAt: io.now()});
    } else if (state.phase === 'stopping' || state.phase === 'switching') {
      // Crash after the atomic config replacement. Stop only an empty broker;
      // never assume its cached config matches the file after a Windows reboot.
      if (observed.children) return await save('needsAttention', {detail: 'Unexpected native child during configuration recovery'});
      await io.stop();
      await save('starting', {startAt: io.now()});
    }
    await io.start(); // ensure one existing Scheduled Task; IgnoreNew, inspect first
    await save('verifying', {startAt: state.startAt ?? io.now()});
    const ready = await io.ready(desired);
    if (!ready) {
      if (!state.rollback && io.now() - state.startAt >= 120_000) {
        const current = await io.inspect();
        if (!current.children) return await save('drained', {rollback: true, detail: 'Candidate broker did not become ready; restoring previous configuration'});
      }
      throw new Error('Broker readiness not yet confirmed');
    }
    // The Hub validates the preserved account before lifting admission. If this
    // reply is lost, the next tick observes released and does not stop anything.
    await save('releasing');
    if (await io.hub('release') !== 'released') throw new Error('Release not confirmed');
    await finishReleased();
  } catch (error) {
    // Retry observations at the next scheduled tick. A transport error is not a
    // rejection and cannot authorize rollback or expiry of a drained fence.
    if (state.fenced && !state.rollback && state.phase === 'releasing' &&
        io.now() - state.startAt >= 120_000) {
      try {
        // The broker may be healthy while its candidate native executable fails
        // to start. Rollback requires fresh proof that release did NOT complete
        // and there is no native child. A lost/offline status never proves this.
        if (await io.hub('status') === 'drained' && !(await io.inspect()).children) {
          await save('drained', {rollback: true, detail: 'Candidate native startup failed; restoring previous configuration'});
          return;
        }
      } catch { /* keep the existing fence and retry observation */ }
    }
    state.lastError = String(error.message || error).slice(0, 500);
    state.updatedAt = io.now();
    await io.save(state);
  }
  async function finishReleased() {
    const result = await io.verify();
    if (!['candidate','previous'].includes(result)) {
      return await save('needsAttention', {detail: 'Hub released but selected runtime not confirmed'});
    }
    await io.receipt(result);
    await save(result === 'candidate' ? 'completed' : 'rolledBack', {fenced: false, lastError: '', cleanupPending: true, detail: 'Hub account and exact running executable verified'});
    // Retention is after activation proof; its failure never re-fences the Hub.
    await cleanup();
  }
  async function cleanup() {
    try { await io.prune();state.cleanupPending=false;state.cleanupWarning=''; }
    catch (error) {state.cleanupWarning=String(error.message);}
    await io.save(state);
  }
}
