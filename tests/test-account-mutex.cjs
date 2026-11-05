/**
 * Tests for AccountMutex
 */
const assert = require('assert');

async function runTests() {
    console.log('--- Testing AccountMutex ---');
    const { AccountMutex } = await import('../src/account-manager/mutex.js');

    // 1. Basic acquire and release
    {
        const mutex = new AccountMutex();
        assert.strictEqual(mutex.isLocked(), false);
        assert.strictEqual(mutex.getQueueLength(), 0);

        const release = await mutex.acquire();
        assert.strictEqual(mutex.isLocked(), true);
        assert.strictEqual(mutex.getQueueLength(), 0);

        release();
        assert.strictEqual(mutex.isLocked(), false);
        console.log('✓ Basic acquire and release: OK');
    }

    // 2. Sequential execution in FIFO order
    {
        const mutex = new AccountMutex();
        const executionOrder = [];

        const task1 = async () => {
            const release = await mutex.acquire();
            executionOrder.push('task1:start');
            await new Promise(r => setTimeout(r, 50));
            executionOrder.push('task1:end');
            release();
        };

        const task2 = async () => {
            await new Promise(r => setTimeout(r, 10)); // Ensure task1 acquires first
            const release = await mutex.acquire();
            executionOrder.push('task2:start');
            await new Promise(r => setTimeout(r, 20));
            executionOrder.push('task2:end');
            release();
        };

        const task3 = async () => {
            await new Promise(r => setTimeout(r, 20)); // Ensure task3 queues behind task2
            const release = await mutex.acquire();
            executionOrder.push('task3:start');
            executionOrder.push('task3:end');
            release();
        };

        await Promise.all([task1(), task2(), task3()]);

        assert.deepStrictEqual(executionOrder, [
            'task1:start',
            'task1:end',
            'task2:start',
            'task2:end',
            'task3:start',
            'task3:end'
        ]);
        assert.strictEqual(mutex.isLocked(), false);
        assert.strictEqual(mutex.getQueueLength(), 0);
        console.log('✓ Sequential FIFO ordering: OK');
    }

    // 3. Double-release safety
    {
        const mutex = new AccountMutex();
        const release = await mutex.acquire();
        assert.strictEqual(mutex.isLocked(), true);
        release();
        assert.strictEqual(mutex.isLocked(), false);
        release(); // Should not throw or affect future acquires
        assert.strictEqual(mutex.isLocked(), false);

        const release2 = await mutex.acquire();
        assert.strictEqual(mutex.isLocked(), true);
        release2();
        assert.strictEqual(mutex.isLocked(), false);
        console.log('✓ Double-release safety: OK');
    }

    // 4. Timeout handling
    {
        const mutex = new AccountMutex();
        const release = await mutex.acquire();

        let timedOut = false;
        try {
            await mutex.acquire(50); // Should timeout after 50ms
        } catch (err) {
            timedOut = true;
            assert(err.message.includes('timed out'));
        }

        assert.strictEqual(timedOut, true);
        assert.strictEqual(mutex.getQueueLength(), 0); // Evicted from queue
        release();
        assert.strictEqual(mutex.isLocked(), false);
        console.log('✓ Timeout handling: OK');
    }

    console.log('\n✓ All AccountMutex tests passed!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
