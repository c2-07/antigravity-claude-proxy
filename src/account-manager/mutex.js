/**
 * Account Mutex
 *
 * Enforces per-account request serialization for upstream APIs (such as
 * Google CloudCode PA) that disallow concurrent inference requests on the
 * same OAuth token/account.
 */

export class AccountMutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }

    /**
     * Check if the mutex is currently locked.
     * @returns {boolean}
     */
    isLocked() {
        return this.locked;
    }

    /**
     * Get the number of pending waiters in the queue.
     * @returns {number}
     */
    getQueueLength() {
        return this.queue.length;
    }

    /**
     * Acquire the lock. If currently locked, waits in FIFO order.
     * @param {number} [timeoutMs=60000] - Max wait time in ms before rejecting
     * @returns {Promise<() => void>} A release function to be called in finally block
     */
    async acquire(timeoutMs = 60000) {
        if (!this.locked) {
            this.locked = true;
            let released = false;
            return () => {
                if (!released) {
                    released = true;
                    this.release();
                }
            };
        }

        return new Promise((resolve, reject) => {
            let timer = null;
            const item = {
                resolve: () => {
                    if (timer) clearTimeout(timer);
                    this.locked = true;
                    let released = false;
                    resolve(() => {
                        if (!released) {
                            released = true;
                            this.release();
                        }
                    });
                },
                reject: (err) => {
                    if (timer) clearTimeout(timer);
                    reject(err);
                }
            };

            if (timeoutMs > 0 && timeoutMs < Infinity) {
                timer = setTimeout(() => {
                    const idx = this.queue.indexOf(item);
                    if (idx !== -1) {
                        this.queue.splice(idx, 1);
                    }
                    item.reject(new Error(`Account lock acquisition timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }

            this.queue.push(item);
        });
    }

    /**
     * Release the lock and dispatch to the next waiter if any.
     */
    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next.resolve();
        } else {
            this.locked = false;
        }
    }
}
