import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

const app = express();
app.use(cors()); // CORS security: allow the Vite dev origin
app.use(express.json());

// ============================================================
// LLM + MCP SETUP (graceful: mock stream still works without them)
// ============================================================

const model = openai(process.env.OPENAI_MODEL || 'gpt-4o');
const useMock = !process.env.OPENAI_API_KEY || process.env.MOCK_AI === 'true';

const MOCK_COMPONENTS = {
    'comp-1': { Box: { children: ['comp-2', 'comp-3', 'comp-4', 'comp-5'], gap: 'lg', padding: 'lg', backgroundColor: 'surface-default', borderRadius: 'lg' } },
    'comp-2': { Text: { literalString: 'A2Kit streaming demo', as: 'h1', size: '3xl', weight: 'bold', color: 'brand' } },
    'comp-3': { Field: { label: 'Your name', binding: '/user/name', placeholder: 'Type your name' } },
    'comp-4': { Text: { binding: '/user/name', prefix: 'Hello, ', fallback: 'stranger!', color: 'muted' } },
    'comp-5': { Button: { label: 'Test Action Bus', variant: 'primary', actionId: 'test-action', context: { source: 'streaming-demo' } } },
};

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

function mockFrames(components = MOCK_COMPONENTS) {
    return [
        { beginRendering: { root: 'comp-1' } },
        ...Object.entries(components).map(([id, component]) => ({
            surfaceUpdate: { components: { [id]: component } },
        })),
        { streamComplete: true },
    ];
}

async function streamMockFrames(res, frames) {
    for (const frame of frames) {
        const json = JSON.stringify(frame);
        // Deliberately split every protocol frame across SSE messages. The
        // browser forwards each fragment to StreamEngine, which reassembles it.
        for (let index = 0; index < json.length; index += 17) {
            res.write(`data: ${json.slice(index, index + 17)}\n\n`);
            await wait(35);
        }
    }
    res.end();
}

let mcpTools = {};
if (!useMock) {
    try {
        const mcpClient = await createMCPClient({
            transport: {
                type: 'sse',
                url: process.env.MCP_SERVER_URL || 'http://localhost:8765/sse'
            }
        });
        mcpTools = await mcpClient.tools();
        console.log('Connected to MCP server, loaded tools:', Object.keys(mcpTools));
    } catch (err) {
        console.warn('MCP server not reachable — continuing without DB tools.', err?.message || err);
    }
} else {
    console.log('MOCK_AI enabled; skipping OpenAI and MCP connections.');
}

// The A2UI component catalog the model is allowed to emit.
const CATALOG_SYSTEM = `
You are a UI generator using the A2UI protocol. You emit ONLY JSON.
Allowed components: Box, Text, Visual, Field, Button, DataGrid, Chart, Overlay.
Layout: Box supports layout:"flex"|"grid", direction, gap, padding, align, justify, wrap, columns, colSpan, flexGrow, backgroundColor, borderRadius.
Text: literalString, as, size (xs|sm|base|lg|xl|2xl|3xl), weight (bold|semibold), color, align, truncate.
Visual: src, alt, type (img|icon|avatar), aspectRatio, objectFit, borderRadius.
Field: label, binding (a JSON pointer like "/user/name"), placeholder, type, disabled, state, description, errorMessage.
Button: label, variant (primary|outline|destructive), disabled, loading, fullWidth, actionId, context.
DataGrid: columns [{key,label,type}], rows [{key:value}]. Chart: type, data [{label,value}]. Overlay: open, padding, borderRadius, closeActionId, context.
Use design tokens only. Emit your answer as a single flat JSON object:
{"rootId":"comp-1","components":{"comp-1":{"Box":{"children":["comp-2",...]}},"comp-2":{...}}}
The first component is the root. Never emit markdown, prose, or arrays of trees.
`;

// ============================================================
// 1. THE STREAM ENDPOINT — initial AI-generated UI
// ============================================================
app.get('/api/ai-stream', async (req, res) => {
    console.log('Frontend connected to stream...');

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeFrame = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (useMock) {
        console.log('Mock AI stream started; sending deliberately fragmented JSON.');
        await streamMockFrames(res, mockFrames());
        console.log('Mock stream complete.');
        return;
    }

    try {
        const result = streamText({
            model,
            system: CATALOG_SYSTEM,
            prompt: 'Generate a welcome screen with a name Field, a greeting Text, and a Button labeled "Test Action Bus".',
            tools: mcpTools,
        });

        const stream = result.toTextStreamResponse().body;
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        // The LLM streams a single JSON object; buffer until complete JSON.
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Try to extract a complete JSON object as it forms
            let parsed = null;
            try {
                parsed = JSON.parse(buffer);
            } catch {
                continue;
            }
            buffer = ''; // consumed

            if (parsed?.rootId && parsed?.components) {
                const rootId = parsed.rootId;
                const components = parsed.components;

                writeFrame({ beginRendering: { root: rootId } });

                // Stream each component in its own surfaceUpdate frame so the
                // frontend paints progressively as chunks arrive.
                for (const [id, component] of Object.entries(components)) {
                    writeFrame({ surfaceUpdate: { components: { [id]: component } } });
                }

                writeFrame({ streamComplete: true });
                res.end();
                console.log('Stream complete.');
                return;
            }
        }

        res.end();
    } catch (err) {
        console.error('Stream error:', err);
        res.status(500).end();
    }
});

// ============================================================
// 2. THE ACTION ENDPOINT — user actions routed back through the LLM
// ============================================================
app.post('/api/ai-action', async (req, res) => {
    console.log('Action Bus Triggered!');
    console.log('Payload from Frontend:', req.body);

    const { action, state } = req.body || {};
    const eventName = action?.event?.name || 'unknown';
    const context = action?.event?.context || {};

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeFrame = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (useMock) {
        console.log('Mock action received:', { eventName, context, state });
        const mockActionComponents = structuredClone(MOCK_COMPONENTS);
        mockActionComponents['comp-2'] = {
            Text: {
                literalString: `Action received: ${eventName}`,
                as: 'h1',
                size: '3xl',
                weight: 'bold',
                color: 'brand',
            },
        };
        await streamMockFrames(res, mockFrames(mockActionComponents));
        console.log('Mock action stream complete.');
        return;
    }

    try {
        const result = streamText({
            model,
            system: CATALOG_SYSTEM,
            prompt: `User triggered action "${eventName}" with context ${JSON.stringify(context)}. Current state: ${JSON.stringify(state)}. Generate the next screen.`,
            tools: mcpTools,
        });

        const stream = result.toTextStreamResponse().body;
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let parsed = null;
            try {
                parsed = JSON.parse(buffer);
            } catch {
                continue;
            }
            buffer = '';

            if (parsed?.rootId && parsed?.components) {
                writeFrame({ beginRendering: { root: parsed.rootId } });
                for (const [id, component] of Object.entries(parsed.components)) {
                    writeFrame({ surfaceUpdate: { components: { [id]: component } } });
                }
                writeFrame({ streamComplete: true });
                res.end();
                return;
            }
        }

        res.end();
    } catch (err) {
        console.error('Action stream error:', err);
        res.status(500).end();
    }
});

// ============================================================
// 3. BOOT
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`A2UI Unified Server running on http://localhost:${PORT}`);
});
