/* ICE restart policy — same functions addPeer uses. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZapIce = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TRIES = 3;
  const DISCONNECT_WAIT_MS = 2000;

  function iceEventAction(p, state) {
    if (!p) return { action: 'none' };
    if (state === 'connected') return { action: 'reset' };
    if (state === 'closed') return { action: 'none' };
    const tries = p.iceTries || 0;
    if (state === 'failed')
      return tries >= MAX_TRIES ? { action: 'stuck' } : { action: 'restart' };
    if (state === 'disconnected')
      return tries >= MAX_TRIES ? { action: 'stuck' } : { action: 'wait', delay: DISCONNECT_WAIT_MS };
    return { action: 'none' };
  }

  function shouldOfferRestart(p) {
    return !!(p && p.initiator && !p.iceBusy && (p.iceTries || 0) < MAX_TRIES && p.pc);
  }

  function beginRestart(p) {
    if (!shouldOfferRestart(p)) return false;
    p.iceBusy = true;
    p.iceTries = (p.iceTries || 0) + 1;
    p.stuck = false;
    return true;
  }

  function endRestart(p) { if (p) p.iceBusy = false; }

  function resetTries(p) {
    if (p) { p.iceTries = 0; p.iceBusy = false; }
  }

  return {
    MAX_TRIES, DISCONNECT_WAIT_MS,
    iceEventAction, shouldOfferRestart, beginRestart, endRestart, resetTries,
  };
});
