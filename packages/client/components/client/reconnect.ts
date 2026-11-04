/**
 * Longest wait between reconnection attempts before jitter, in seconds
 */
const MAX_RECONNECT_DELAY = 30;

/**
 * Work out how long to wait before the next reconnection attempt
 * @param failures Consecutive connection failures
 * @param random Random number between 0 and 1, used to spread out clients
 * @returns Delay in seconds
 */
export function reconnectDelay(failures: number, random = Math.random()) {
  const delay = Math.min(Math.pow(2, failures) - 1, MAX_RECONNECT_DELAY);
  return delay * (0.8 + random * 0.4);
}
