#!/usr/bin/env node
/**
 * Test Runner
 *
 * Runs all tests in sequence and reports results.
 * Usage: node tests/run-all.cjs
 */
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { startMockUpstream, stopMockUpstream } = require('./helpers/mock-upstream.cjs');

function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(400);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

async function waitForPort(port, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await checkPort(port)) return true;
        await new Promise(r => setTimeout(r, 200));
    }
    return false;
}

const tests = [
    { name: 'Account Selection Strategies', file: 'test-strategies.cjs' },
    { name: 'Cache Control Stripping', file: 'test-cache-control.cjs' },
    { name: 'Thinking Signatures', file: 'test-thinking-signatures.cjs' },
    { name: 'Multi-turn Tools (Non-Streaming)', file: 'test-multiturn-thinking-tools.cjs' },
    { name: 'Multi-turn Tools (Streaming)', file: 'test-multiturn-thinking-tools-streaming.cjs' },
    { name: 'Interleaved Thinking', file: 'test-interleaved-thinking.cjs' },
    { name: 'Image Support', file: 'test-images.cjs' },
    { name: 'Prompt Caching', file: 'test-caching-streaming.cjs' },
    { name: 'Cross-Model Thinking', file: 'test-cross-model-thinking.cjs' },
    { name: 'OAuth No-Browser Mode', file: 'test-oauth-no-browser.cjs' },
    { name: 'Empty Response Retry', file: 'test-empty-response-retry.cjs' },
    { name: 'Schema Sanitizer', file: 'test-schema-sanitizer.cjs' },
    { name: 'Billing Header Stripping', file: 'test-billing-header.cjs' },
    { name: 'System Prompts & Integrity', file: 'test-identity-scrub.cjs' },
    { name: 'Streaming Whitespace', file: 'test-streaming-whitespace.cjs' },
    { name: '403 Account Rotation (Unit)', file: 'test-403-account-rotation.cjs' },
    { name: '403 Account Rotation (Integration)', file: 'test-403-integration.cjs' },
    { name: 'Model Registry & Routing', file: 'test-model-registry.cjs' },
    { name: 'Version Detection', file: 'test-version-detection.js' },
    { name: 'Usage Stats & Model Tracking', file: 'test-usage-stats.js' },
    { name: 'End-to-End Compatibility & Reliability Suite', file: 'test-automated-suite.cjs' }
];

async function runTest(test) {
    return new Promise((resolve) => {
        const testPath = path.join(__dirname, test.file);
        const child = spawn('node', [testPath], {
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            resolve({ ...test, passed: code === 0 });
        });

        child.on('error', (err) => {
            console.error(`Error running ${test.name}:`, err);
            resolve({ ...test, passed: false });
        });
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              ANTIGRAVITY PROXY TEST SUITE                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    let spawnedProxy = null;
    let mockUpstreamStarted = false;

    // Check if proxy server is already running on port 8080
    const isPortOpen = await checkPort(8080);
    if (!isPortOpen) {
        console.log('[TestRunner] Port 8080 is idle. Launching local mock upstream & proxy server...');
        await startMockUpstream(9099);
        mockUpstreamStarted = true;

        spawnedProxy = spawn('node', ['src/index.js'], {
            cwd: path.resolve(__dirname, '..'),
            env: {
                ...process.env,
                PORT: '8080',
                HOST: '127.0.0.1',
                TEST_UPSTREAM_URL: 'http://127.0.0.1:9099',
                CLOUDCODE_ENDPOINT: 'http://127.0.0.1:9099'
            },
            stdio: 'ignore'
        });

        const ready = await waitForPort(8080, 8000);
        if (!ready) {
            console.error('[TestRunner] Timed out waiting for proxy server to start on port 8080');
            if (spawnedProxy) spawnedProxy.kill();
            if (mockUpstreamStarted) await stopMockUpstream();
            process.exit(1);
        }
        console.log('[TestRunner] Proxy server is ready on port 8080 with mock upstream.');
    } else {
        console.log('[TestRunner] Connected to existing server running on port 8080.');
    }
    console.log('');

    // Check if running specific test
    const specificTest = process.argv[2];
    let testsToRun = tests;

    if (specificTest) {
        testsToRun = tests.filter(t =>
            t.file.includes(specificTest) || t.name.toLowerCase().includes(specificTest.toLowerCase())
        );
        if (testsToRun.length === 0) {
            console.log(`No test found matching: ${specificTest}`);
            console.log('\nAvailable tests:');
            tests.forEach(t => console.log(`  - ${t.name} (${t.file})`));
            if (spawnedProxy) spawnedProxy.kill();
            if (mockUpstreamStarted) await stopMockUpstream();
            process.exit(1);
        }
    }

    const results = [];

    try {
        for (const test of testsToRun) {
            console.log('\n');
            console.log('╔' + '═'.repeat(60) + '╗');
            console.log('║ Running: ' + test.name.padEnd(50) + '║');
            console.log('╚' + '═'.repeat(60) + '╝');
            console.log('');

            const result = await runTest(test);
            results.push(result);

            console.log('\n');
        }
    } finally {
        if (spawnedProxy) {
            spawnedProxy.kill('SIGTERM');
        }
        if (mockUpstreamStarted) {
            await stopMockUpstream();
        }
    }

    // Summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      FINAL RESULTS                           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    let allPassed = true;
    for (const result of results) {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        const statusColor = result.passed ? '' : '';
        console.log(`║ ${status.padEnd(8)} ${result.name.padEnd(50)} ║`);
        if (!result.passed) allPassed = false;
    }

    console.log('╠══════════════════════════════════════════════════════════════╣');
    const overallStatus = allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED';
    console.log(`║ ${overallStatus.padEnd(60)} ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
