/**
 * Mock Upstream CloudCode PA Server
 *
 * Simulates Google CloudCode PA backend endpoints for deterministic,
 * 100% offline automated testing without consuming live quotas.
 */

const http = require('http');

let serverInstance = null;
let currentPort = null;

function createMockUpstreamServer() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            let parsedBody = {};
            try {
                if (body) parsedBody = JSON.parse(body);
            } catch {
                // Ignore parse errors
            }

            // Check for simulated error triggers
            const bodyStr = body || '';
            if (req.headers['x-mock-error'] === '401' || req.headers['authorization'] === 'Bearer invalid-token' || bodyStr.includes('TRIGGER_401')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } }));
                return;
            }

            if (req.headers['x-mock-error'] === '429' || bodyStr.includes('TRIGGER_429') || parsedBody.model === 'mock-rate-limit-model') {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { code: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for model claude-sonnet-4-6. quota will reset after 5m0s', status: 'RESOURCE_EXHAUSTED' } }));
                return;
            }

            // 1. loadCodeAssist
            if (url.pathname.includes('loadCodeAssist')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    cloudaicompanionProject: 'aicode-consumers',
                    paidTier: { id: 'g1-pro-tier' },
                    currentTier: { id: 'g1-pro-tier' }
                }));
                return;
            }

            // 2. fetchAvailableModels
            if (url.pathname.includes('fetchAvailableModels')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    models: {
                        'claude-sonnet-4-6': {
                            displayName: 'Claude 3.7 Sonnet',
                            apiProvider: 'API_PROVIDER_ANTHROPIC',
                            supportsThinking: true,
                            maxOutputTokens: 64000
                        },
                        'claude-opus-4-6-thinking': {
                            displayName: 'Claude 3.7 Opus',
                            apiProvider: 'API_PROVIDER_ANTHROPIC',
                            supportsThinking: true,
                            maxOutputTokens: 64000
                        },
                        'gemini-3.8-flash-high': {
                            displayName: 'Gemini 3.8 Flash (High)',
                            apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                            supportsThinking: true,
                            maxOutputTokens: 64000
                        },
                        'gemini-3.8-flash-tiered': {
                            displayName: 'Gemini 3.8 Flash (Tiered)',
                            apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                            supportsThinking: true,
                            maxOutputTokens: 64000
                        },
                        'gpt-oss-120b-medium': {
                            displayName: 'GPT OSS 120B',
                            apiProvider: 'API_PROVIDER_OPENAI',
                            supportsThinking: false,
                            maxOutputTokens: 32000
                        }
                    }
                }));
                return;
            }

            // 3. streamGenerateContent
            if (url.pathname.includes('streamGenerateContent')) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                const model = parsedBody.model || 'claude-sonnet-4-6';
                const contents = parsedBody.request?.contents || [];
                const lastContent = contents[contents.length - 1];
                let promptText = '';

                if (lastContent?.parts) {
                    for (const p of lastContent.parts) {
                        if (p.text) promptText += p.text;
                        if (p.functionResponse) promptText += ' [tool_result]';
                    }
                }

                // Check if tool invocation was requested or simulated
                const hasTools = (parsedBody.request?.tools && parsedBody.request.tools.length > 0) || false;
                const isToolResponse = promptText.includes('[tool_result]');

                if (hasTools && !isToolResponse && (promptText.toLowerCase().includes('weather') || promptText.toLowerCase().includes('tool'))) {
                    // Send a functionCall chunk
                    const toolChunk = {
                        response: {
                            candidates: [{
                                content: {
                                    role: 'model',
                                    parts: [{
                                        functionCall: {
                                            name: 'getWeather',
                                            args: { location: 'Paris' }
                                        }
                                    }]
                                }
                            }]
                        }
                    };
                    res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);

                    const finalChunk = {
                        response: {
                            candidates: [{
                                finishReason: 'STOP'
                            }],
                            usageMetadata: {
                                promptTokenCount: 25,
                                candidatesTokenCount: 15,
                                totalTokenCount: 40
                            }
                        }
                    };
                    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                    res.end();
                    return;
                }

                // Normal response (with thinking if model supports it)
                const isThinking = model.includes('thinking') || parsedBody.request?.generationConfig?.thinkingConfig;

                if (isThinking) {
                    const thinkChunk = {
                        response: {
                            candidates: [{
                                content: {
                                    role: 'model',
                                    parts: [{
                                        thought: true,
                                        text: 'Analyzing the query carefully...'
                                    }]
                                }
                            }]
                        }
                    };
                    res.write(`data: ${JSON.stringify(thinkChunk)}\n\n`);
                }

                // Text response chunks
                const chunk1 = {
                    response: {
                        candidates: [{
                            content: {
                                role: 'model',
                                parts: [{
                                    text: 'Mock response: '
                                }]
                            }
                        }]
                    }
                };
                res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

                const chunk2 = {
                    response: {
                        candidates: [{
                            content: {
                                role: 'model',
                                parts: [{
                                    text: isToolResponse ? 'Weather in Paris is sunny, 20°C.' : 'Hello from mock CloudCode upstream!'
                                }]
                            },
                            finishReason: 'STOP'
                        }],
                        usageMetadata: {
                            promptTokenCount: 30,
                            candidatesTokenCount: 20,
                            totalTokenCount: 50
                        }
                    }
                };
                res.write(`data: ${JSON.stringify(chunk2)}\n\n`);
                res.end();
                return;
            }

            // Default 404 for unhandled paths
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 404, message: 'Not found' } }));
        });
    });

    return server;
}

/**
 * Start the mock upstream server on a given port.
 */
function startMockUpstream(port = 9099) {
    return new Promise((resolve, reject) => {
        if (serverInstance) {
            return resolve({ port: currentPort, server: serverInstance });
        }

        const server = createMockUpstreamServer();
        server.listen(port, '127.0.0.1', () => {
            currentPort = server.address().port;
            serverInstance = server;
            resolve({ port: currentPort, server });
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Already listening, can be reused
                currentPort = port;
                resolve({ port: currentPort, server: null, reused: true });
            } else {
                reject(err);
            }
        });
    });
}

/**
 * Stop the mock upstream server.
 */
function stopMockUpstream() {
    return new Promise((resolve) => {
        if (!serverInstance) return resolve();
        serverInstance.close(() => {
            serverInstance = null;
            currentPort = null;
            resolve();
        });
    });
}

module.exports = {
    startMockUpstream,
    stopMockUpstream
};
