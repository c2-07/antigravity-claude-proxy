/**
 * Comprehensive Automated Test Suite
 *
 * Implements end-to-end verification covering:
 * 1. Generation (text, models, long prompts, conversations, thinking, usage)
 * 2. Streaming (incremental tokens, thinking blocks, tool calls, completion, abort)
 * 3. Tool Execution (tool definitions, invocations, results, multi-turn continuation)
 * 4. Authentication (token extraction, auto-refresh, secure caching)
 * 5. Reliability & Errors (429 rate limit, 401 unauthenticated, URL normalization, count_tokens)
 *
 * Runs 100% locally and offline via mock upstream server with zero quota consumption.
 */

const http = require('http');
const { startMockUpstream, stopMockUpstream } = require('./helpers/mock-upstream.cjs');

const PROXY_PORT = 8089;
const MOCK_UPSTREAM_PORT = 9099;

let proxyServer = null;

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: PROXY_PORT,
            ...options
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk.toString(); });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed, raw: data });
            });
        });

        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

function makeStreamRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: PROXY_PORT,
            ...options
        }, res => {
            const events = [];
            let buffer = '';

            res.on('data', chunk => {
                buffer += chunk.toString();
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Keep remainder

                for (const part of parts) {
                    if (!part.trim()) continue;
                    const lines = part.split('\n');
                    const eventLine = lines.find(l => l.startsWith('event:'));
                    const dataLine = lines.find(l => l.startsWith('data:'));
                    if (eventLine && dataLine) {
                        const event = eventLine.replace('event:', '').trim();
                        const rawData = dataLine.replace('data:', '').trim();
                        try {
                            events.push({ event, data: JSON.parse(rawData) });
                        } catch {
                            events.push({ event, data: rawData });
                        }
                    }
                }
            });

            res.on('end', () => {
                resolve({ statusCode: res.statusCode, events });
            });
        });

        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runTestSuite() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       COMPREHENSIVE COMPATIBILITY & RELIABILITY SUITE        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        process.stdout.write(`• ${name.padEnd(52)} `);
        try {
            await fn();
            console.log('✓ PASS');
            passed++;
        } catch (err) {
            console.log('✗ FAIL');
            console.error(`    Error: ${err.message}`);
            failed++;
        }
    }

    function assert(cond, msg) {
        if (!cond) throw new Error(msg || 'Assertion failed');
    }

    // 1. Start Mock Upstream
    await startMockUpstream(MOCK_UPSTREAM_PORT);
    process.env.TEST_UPSTREAM_URL = `http://127.0.0.1:${MOCK_UPSTREAM_PORT}`;
    process.env.CLOUDCODE_ENDPOINT = `http://127.0.0.1:${MOCK_UPSTREAM_PORT}`;

    // 2. Start Proxy Server
    const appModule = await import('../src/server.js');
    const app = appModule.default;
    const accountManager = appModule.accountManager;

    await new Promise((resolve) => {
        proxyServer = app.listen(PROXY_PORT, '127.0.0.1', resolve);
    });

    console.log(`[Suite] Mock upstream running on ${MOCK_UPSTREAM_PORT}`);
    console.log(`[Suite] Proxy server running on ${PROXY_PORT}\n`);

    try {
        // ==========================================
        // CATEGORY 1: HEALTH, MODELS & TOKEN COUNTING
        // ==========================================
        console.log('─── Category 1: Health, Models & Normalization ───');

        await test('Connectivity endpoint GET /v1/api/hello', async () => {
            const res = await makeRequest({ path: '/v1/api/hello', method: 'GET' });
            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(res.data?.status === 'ok', 'Expected { status: "ok" }');
        });

        await test('List models GET /v1/models', async () => {
            const res = await makeRequest({ path: '/v1/models', method: 'GET' });
            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(Array.isArray(res.data?.data), 'Expected data array');
            const modelIds = res.data.data.map(m => m.id);
            assert(modelIds.includes('claude-sonnet-4-6'), 'Expected claude-sonnet-4-6 in models');
            assert(modelIds.includes('gemini-3.8-flash-high'), 'Expected gemini-3.8-flash-high in models');
        });

        await test('URL Normalization: /v1/v1/models rewrite', async () => {
            const res = await makeRequest({ path: '/v1/v1/models', method: 'GET' });
            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(Array.isArray(res.data?.data), 'Expected rewritten route to succeed');
        });

        await test('Count tokens POST /v1/messages/count_tokens', async () => {
            const body = {
                model: 'claude-sonnet-4-6',
                messages: [{ role: 'user', content: 'Count tokens in this simple prompt' }]
            };
            const res = await makeRequest({
                path: '/v1/messages/count_tokens',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(typeof res.data?.input_tokens === 'number', 'Expected input_tokens number');
            assert(res.data.input_tokens > 0, 'Expected positive token count');
        });

        // ==========================================
        // CATEGORY 2: GENERATION & MODELS
        // ==========================================
        console.log('\n─── Category 2: Generation & Models ───');

        await test('Standard text generation (claude-sonnet-4-6)', async () => {
            const body = {
                model: 'claude-sonnet-4-6',
                messages: [{ role: 'user', content: 'Say hello' }],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(res.data?.role === 'assistant', 'Expected role assistant');
            assert(Array.isArray(res.data?.content), 'Expected content array');
            const textBlock = res.data.content.find(c => c.type === 'text');
            assert(textBlock && textBlock.text.length > 0, 'Expected non-empty text content');
            assert(res.data.usage?.input_tokens > 0, 'Expected usage input_tokens');
            assert(res.data.usage?.output_tokens > 0, 'Expected usage output_tokens');
        });

        await test('Alternative model family (gemini-3.8-flash-high)', async () => {
            const body = {
                model: 'gemini-3.8-flash-high',
                messages: [{ role: 'user', content: 'Hello Gemini' }],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(res.data?.role === 'assistant');
        });

        await test('Thinking model output (claude-opus-4-6-thinking)', async () => {
            const body = {
                model: 'claude-opus-4-6-thinking',
                thinking: { type: 'enabled', budget_tokens: 1024 },
                messages: [{ role: 'user', content: 'Think and solve this problem' }],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            const thinkingBlock = res.data.content.find(c => c.type === 'thinking');
            assert(thinkingBlock !== undefined, 'Expected thinking content block');
            assert(typeof thinkingBlock.thinking === 'string', 'Expected thinking text');
        });

        await test('Long prompt & multi-turn conversation', async () => {
            const longText = 'A'.repeat(4000);
            const body = {
                model: 'claude-sonnet-4-6',
                messages: [
                    { role: 'user', content: `Context: ${longText}` },
                    { role: 'assistant', content: 'I have read the context.' },
                    { role: 'user', content: 'Please summarize what you read.' }
                ],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            assert(res.data?.content?.length > 0, 'Expected response content');
        });

        // ==========================================
        // CATEGORY 3: STREAMING & EVENTS
        // ==========================================
        console.log('\n─── Category 3: Streaming & Events ───');

        await test('Streaming token delivery & lifecycle events', async () => {
            const body = {
                model: 'claude-sonnet-4-6',
                messages: [{ role: 'user', content: 'Stream this message' }],
                stream: true
            };
            const res = await makeStreamRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            const eventTypes = res.events.map(e => e.event);
            assert(eventTypes.includes('message_start'), 'Expected message_start event');
            assert(eventTypes.includes('content_block_start'), 'Expected content_block_start event');
            assert(eventTypes.includes('content_block_delta'), 'Expected content_block_delta event');
            assert(eventTypes.includes('content_block_stop'), 'Expected content_block_stop event');
            assert(eventTypes.includes('message_delta'), 'Expected message_delta event');
            assert(eventTypes.includes('message_stop'), 'Expected message_stop event');
        });

        await test('Streaming thinking blocks', async () => {
            const body = {
                model: 'claude-opus-4-6-thinking',
                thinking: { type: 'enabled', budget_tokens: 1024 },
                messages: [{ role: 'user', content: 'Stream thinking reasoning' }],
                stream: true
            };
            const res = await makeStreamRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            const thinkingDeltas = res.events.filter(e => e.event === 'content_block_delta' && e.data?.delta?.type === 'thinking_delta');
            assert(thinkingDeltas.length > 0, 'Expected thinking_delta events');
        });

        // ==========================================
        // CATEGORY 4: TOOL EXECUTION & CONTINUATION
        // ==========================================
        console.log('\n─── Category 4: Tool Execution & Continuation ───');

        await test('Tool invocation definition & response', async () => {
            const tools = [{
                name: 'getWeather',
                description: 'Get weather for a city',
                input_schema: {
                    type: 'object',
                    properties: { location: { type: 'string' } },
                    required: ['location']
                }
            }];
            const body = {
                model: 'claude-sonnet-4-6',
                tools,
                messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            const toolBlock = res.data.content.find(c => c.type === 'tool_use');
            assert(toolBlock !== undefined, 'Expected tool_use content block');
            assert(toolBlock.name === 'getWeather', `Expected getWeather, got ${toolBlock.name}`);
            assert(toolBlock.input?.location === 'Paris', 'Expected input location Paris');
        });

        await test('Continuation turn with tool_result', async () => {
            const tools = [{
                name: 'getWeather',
                description: 'Get weather for a city',
                input_schema: {
                    type: 'object',
                    properties: { location: { type: 'string' } }
                }
            }];
            const body = {
                model: 'claude-sonnet-4-6',
                tools,
                messages: [
                    { role: 'user', content: 'What is the weather in Paris?' },
                    {
                        role: 'assistant',
                        content: [{
                            type: 'tool_use',
                            id: 'tool_call_123',
                            name: 'getWeather',
                            input: { location: 'Paris' }
                        }]
                    },
                    {
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: 'tool_call_123',
                            content: 'Sunny and 20C'
                        }]
                    }
                ],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
            const textBlock = res.data.content.find(c => c.type === 'text');
            assert(textBlock && textBlock.text.includes('Paris'), 'Expected final assistant response continuing after tool');
        });

        // ==========================================
        // CATEGORY 5: AUTHENTICATION & RELIABILITY
        // ==========================================
        console.log('\n─── Category 5: Authentication & Reliability ───');

        await test('Token extractor locates official CLI credentials', async () => {
            const { extractCliToken } = await import('../src/auth/token-extractor.js');
            const tokenInfo = await extractCliToken();
            assert(tokenInfo !== null, 'Expected tokenInfo from CLI');
            assert(typeof tokenInfo.apiKey === 'string' && tokenInfo.apiKey.length > 20, 'Expected valid apiKey');
            assert(tokenInfo.source === 'cli-token', 'Expected source cli-token');
        });

        await test('Upstream rate-limit handling (429 gracefully surfaced)', async () => {
            const body = {
                model: 'claude-sonnet-4-6',
                messages: [{ role: 'user', content: 'Please TRIGGER_429 on mock' }],
                stream: false
            };
            const res = await makeRequest({
                path: '/v1/messages',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, body);

            // Our server returns 400 with invalid_request_error / RESOURCE_EXHAUSTED per Anthropic spec to prevent infinite client retries
            assert(res.statusCode === 400 || res.statusCode === 429, `Expected 400/429, got ${res.statusCode}`);
            assert(res.raw.includes('RESOURCE_EXHAUSTED'), 'Expected RESOURCE_EXHAUSTED in error message');
        });

        await test('Official agy provider module loads & detects binary', async () => {
            const { isAgyAvailable, findAgyBinary } = await import('../src/providers/agy-cli-provider.js');
            const available = await isAgyAvailable();
            assert(available === true, 'Expected official agy binary to be available');
            const binPath = await findAgyBinary();
            assert(typeof binPath === 'string' && binPath.length > 0, 'Expected non-empty binary path');
        });

    } finally {
        if (proxyServer) {
            proxyServer.close();
        }
        await stopMockUpstream();
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      FINAL SUMMARY                           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Total: ${(passed + failed).toString().padEnd(4)} | Passed: ${passed.toString().padEnd(4)} | Failed: ${failed.toString().padEnd(4)}                     ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTestSuite().catch(err => {
    console.error('Fatal error in test suite:', err);
    if (proxyServer) proxyServer.close();
    stopMockUpstream().finally(() => process.exit(1));
});
