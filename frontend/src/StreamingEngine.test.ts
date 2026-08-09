import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StreamEngine } from './StreamingEngine.ts';

test('parses JSON split across chunks', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"name":');
    engine.receiveChunk('"Ada"}');

    assert.deepEqual(values, [{ name: 'Ada' }]);
});

test('strips Markdown JSON fences', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('```json\n{"ok":true}\n```');

    assert.deepEqual(values, [{ ok: true }]);
});

test('parses multiple objects from one chunk', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"id":1}{"id":2}');

    assert.deepEqual(values, [{ id: 1 }, { id: 2 }]);
});

test('ignores braces and escaped quotes inside strings', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"text":"brace } and quote \\\"ok\\\""}');

    assert.deepEqual(values, [{ text: 'brace } and quote "ok"' }]);
});

test('repairs trailing commas in objects and arrays', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"items":[1,2,],}');

    assert.deepEqual(values, [{ items: [1, 2] }]);
});

test('repairs raw newlines inside string values', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"text":"first\nsecond"}');

    assert.deepEqual(values, [{ text: 'first\nsecond' }]);
});

test('does not invoke the callback for unrecoverable JSON', () => {
    const values: unknown[] = [];
    const engine = new StreamEngine(value => values.push(value));

    engine.receiveChunk('{"value": nope}');

    assert.deepEqual(values, []);
});
