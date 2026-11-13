/**
 * Typed event emitter for LocalShare engine events.
 */

export const EngineEventType = {
  PEER_FOUND: 'PEER_FOUND',
  PEER_LOST: 'PEER_LOST',
  PEER_UPDATED: 'PEER_UPDATED',
  PIN_CHALLENGE_REQUESTED: 'PIN_CHALLENGE_REQUESTED',
  TRANSFER_QUEUED: 'TRANSFER_QUEUED',
  TRANSFER_PROGRESS: 'TRANSFER_PROGRESS',
  TRANSFER_COMPLETED: 'TRANSFER_COMPLETED',
  TRANSFER_FAILED: 'TRANSFER_FAILED',
  TRANSFER_CANCELLED: 'TRANSFER_CANCELLED',
  ENGINE_STATE_CHANGED: 'ENGINE_STATE_CHANGED'
};

export class EngineEventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name from EngineEventType.
   * @param {Function} listener - Callback function.
   * @returns {() => void} Unsubscribe function.
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event);
    if (set) {
      set.add(listener);
    }
    return () => this.off(event, listener);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} listener
   */
  off(event, listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (error) {
          // Log and continue to ensure other subscribers receive the event
          // eslint-disable-next-line no-console
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners() {
    this.listeners.clear();
  }
}
