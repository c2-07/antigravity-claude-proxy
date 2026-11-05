/**
 * Test System Prompts & Integrity
 *
 * Verifies that system prompts and instructions are preserved cleanly
 * without artificial prompt rewriting or evasion blocks, adhering strictly
 * to Section 5 guidelines.
 */

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           SYSTEM PROMPT INTEGRITY TEST SUITE                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const { buildCloudCodeRequest } = await import('../src/cloudcode/request-builder.js');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (e) {
            console.log(`✗ ${name}`);
            console.error(`  Error: ${e.message}`);
            failed++;
        }
    }

    function assert(cond, message) {
        if (!cond) throw new Error(message);
    }

    function outgoingSystem(system) {
        const payload = buildCloudCodeRequest(
            { model: 'claude-sonnet-4-6', system, messages: [{ role: 'user', content: 'hi' }] },
            'project-id',
            'test@example.com'
        );
        return payload.request.systemInstruction.parts.map(p => p.text).join('\n');
    }

    test('Caller string system prompt passes through verbatim', () => {
        const text = 'You are Claude Code, Anthropic\'s official CLI for Claude.';
        const out = outgoingSystem(text);
        assert(out.includes(text), 'Caller system prompt must be preserved verbatim');
    });

    test('Array of system text blocks preserved intact', () => {
        const out = outgoingSystem([
            { type: 'text', text: 'First instruction.' },
            { type: 'text', text: 'Second instruction.' }
        ]);
        assert(out.includes('First instruction.'), 'First block missing');
        assert(out.includes('Second instruction.'), 'Second block missing');
    });

    test('No artificial [ignore] tags injected', () => {
        const text = 'Helpful assistant.';
        const out = outgoingSystem(text);
        assert(!out.includes('[ignore]'), 'Prompt must not contain artificial [ignore] evasion tags');
        assert(!out.includes('[/ignore]'), 'Prompt must not contain artificial [/ignore] evasion tags');
    });

    test('Default assistant prompt used when caller provides none', () => {
        const out = outgoingSystem(undefined);
        assert(out.length > 0, 'Expected non-empty default system instruction');
        assert(out.includes('Antigravity'), 'Expected default assistant instruction');
    });

    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
