import { describe, expect, it } from 'vitest';
import { applyRequestHeaderRules } from '../src/utils/requestHeaderRules';

describe('applyRequestHeaderRules', () => {
  it('updates (overwrites) an existing header', () => {
    const headers = { 'x-test': 'a' };
    const updated = applyRequestHeaderRules(headers, [
      { operation: 'update', headerName: 'X-Test', value: 'b' }
    ]);
    expect(updated['x-test']).toBe('b');
  });

  it('creates a header only when missing', () => {
    const headers = { 'x-test': 'a' };
    const updated = applyRequestHeaderRules(headers, [{ operation: 'create', headerName: 'X-Test', value: 'b' }]);
    expect(updated['x-test']).toBe('a');

    const updatedMissing = applyRequestHeaderRules({}, [{ operation: 'create', headerName: 'X-Test', value: 'b' }]);
    expect(updatedMissing['x-test']).toBe('b');
  });

  it('patches a header value via regex replacement', () => {
    const headers = { 'x-test': 'hello world' };
    const updated = applyRequestHeaderRules(headers, [
      { operation: 'patch', headerName: 'x-test', pattern: 'world', replacement: 'koa' }
    ]);
    expect(updated['x-test']).toBe('hello koa');
  });

  it('deletes a header', () => {
    const headers = { 'x-test': 'a' };
    const updated = applyRequestHeaderRules(headers, [{ operation: 'delete', headerName: 'X-Test' }]);
    expect(updated['x-test']).toBeUndefined();
  });

  it('applies a rule only when its condition matches', () => {
    const headers = { accept: 'application/json', 'x-test': 'a' };
    const updated = applyRequestHeaderRules(headers, [
      {
        operation: 'update',
        headerName: 'x-test',
        value: 'b',
        when: { condition: 'header', headerName: 'accept', includes: 'json' }
      },
      {
        operation: 'update',
        headerName: 'x-test',
        value: 'c',
        when: { condition: 'header', headerName: 'accept', includes: 'xml' }
      }
    ]);
    expect(updated['x-test']).toBe('b');
  });
});

