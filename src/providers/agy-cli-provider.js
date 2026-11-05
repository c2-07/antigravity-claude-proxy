/**
 * Official Antigravity CLI Provider
 *
 * Interfaces directly with the official Google Antigravity CLI (`agy`) binary
 * for headless execution and streaming integration.
 */

import { spawn } from 'child_process';
import { access, constants } from 'fs/promises';
import { logger } from '../utils/logger.js';

const CANDIDATE_CLI_PATHS = [
    '/Users/gourav/.gemini/bin/agy',
    process.env.AGY_BIN_PATH,
    'agy'
].filter(Boolean);

let cachedAgyPath = null;

/**
 * Locate the official `agy` binary on the system.
 * @returns {Promise<string|null>} Path to executable agy binary or null
 */
export async function findAgyBinary() {
    if (cachedAgyPath) return cachedAgyPath;

    for (const binPath of CANDIDATE_CLI_PATHS) {
        try {
            await access(binPath, constants.X_OK);
            cachedAgyPath = binPath;
            return binPath;
        } catch {
            // continue checking
        }
    }

    return null;
}

/**
 * Check if the official agy binary is available.
 * @returns {Promise<boolean>}
 */
export async function isAgyAvailable() {
    return (await findAgyBinary()) !== null;
}

/**
 * Execute a prompt using the official `agy` CLI in headless JSON mode.
 *
 * @param {string} prompt - Prompt to send
 * @param {Object} [options]
 * @param {string} [options.model] - Model name (e.g. 'claude-sonnet-4-6')
 * @param {string} [options.cwd] - Working directory
 * @param {number} [options.timeoutMs] - Timeout in milliseconds
 * @returns {Promise<Object>} Output result object
 */
export async function executeHeadlessPrompt(prompt, options = {}) {
    const agyBin = await findAgyBinary();
    if (!agyBin) {
        throw new Error('Official agy binary not found in candidate paths');
    }

    const args = ['-p', prompt, '--output-format', 'json'];
    if (options.model) {
        args.push('--model', options.model);
    }
    if (options.effort) {
        args.push('--effort', options.effort);
    }
    args.push('--dangerously-skip-permissions');

    return new Promise((resolve, reject) => {
        const proc = spawn(agyBin, args, {
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...options.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });

        proc.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });

        const timer = options.timeoutMs ? setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`agy execution timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs) : null;

        proc.on('close', code => {
            if (timer) clearTimeout(timer);
            if (code !== 0) {
                return reject(new Error(`agy exited with code ${code}: ${stderr || stdout}`));
            }

            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            } catch (err) {
                reject(new Error(`Failed to parse agy JSON output: ${err.message}. Raw: ${stdout}`));
            }
        });

        proc.on('error', err => {
            if (timer) clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Stream a prompt turn using official `agy` stream-json protocol.
 * Yields parsed events as they are emitted by the CLI.
 *
 * @param {string} prompt - User message content
 * @param {Object} [options]
 * @param {string} [options.model] - Model name
 * @param {string} [options.cwd] - Working directory
 * @returns {AsyncGenerator<Object>}
 */
export async function* streamHeadlessPrompt(prompt, options = {}) {
    const agyBin = await findAgyBinary();
    if (!agyBin) {
        throw new Error('Official agy binary not found in candidate paths');
    }

    const args = [
        '-p', '',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
    ];
    if (options.model) {
        args.push('--model', options.model);
    }

    const proc = spawn(agyBin, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env }
    });

    // Write input event
    const inputMsg = JSON.stringify({
        event: 'user',
        message: { content: prompt }
    }) + '\n';

    proc.stdin.write(inputMsg);
    proc.stdin.end();

    let buffer = '';
    const eventQueue = [];
    let resolveNext = null;
    let isDone = false;
    let error = null;

    proc.stdout.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (resolveNext) {
                    const fn = resolveNext;
                    resolveNext = null;
                    fn(parsed);
                } else {
                    eventQueue.push(parsed);
                }
            } catch {
                // Non-JSON line or logging
            }
        }
    });

    proc.on('close', code => {
        isDone = true;
        if (code !== 0 && !error) {
            error = new Error(`agy process exited with code ${code}`);
        }
        if (resolveNext) {
            const fn = resolveNext;
            resolveNext = null;
            fn(null);
        }
    });

    proc.on('error', err => {
        isDone = true;
        error = err;
        if (resolveNext) {
            const fn = resolveNext;
            resolveNext = null;
            fn(null);
        }
    });

    while (!isDone || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
            yield eventQueue.shift();
        } else if (!isDone) {
            const event = await new Promise(r => { resolveNext = r; });
            if (event) yield event;
        }
    }

    if (error) {
        throw error;
    }
}
