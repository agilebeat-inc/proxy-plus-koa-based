import { describe, expect, it } from 'vitest';
import { buildTargetUrl, getNormalizedProxiedPath } from '../src/routes/proxy';

describe('proxy path normalization', () => {
  it('returns "/" when request path matches route prefix exactly and prefix ends with "/"', () => {
    const ctx = { path: '/browser/' } as Parameters<typeof getNormalizedProxiedPath>[0];
    expect(getNormalizedProxiedPath(ctx, '/browser/')).toBe('/');
  });

  it('returns "" when request path matches route prefix exactly and prefix does not end with "/"', () => {
    const ctx = { path: '/mcp' } as Parameters<typeof getNormalizedProxiedPath>[0];
    expect(getNormalizedProxiedPath(ctx, '/mcp')).toBe('');
  });

  it('keeps trailing slash on target base for route-root requests', () => {
    const ctx = { path: '/browser/', search: '' } as Parameters<typeof buildTargetUrl>[0];
    const url = buildTargetUrl(ctx, 'http://upstream:7474/browser/', '/browser/');
    expect(url.toString()).toBe('http://upstream:7474/browser/');
  });

  it('keeps target path as-is for non-slash route-root requests', () => {
    const ctx = { path: '/mcp', search: '' } as Parameters<typeof buildTargetUrl>[0];
    const url = buildTargetUrl(ctx, 'http://upstream:7475/mcp', '/mcp');
    expect(url.toString()).toBe('http://upstream:7475/mcp');
  });
});
