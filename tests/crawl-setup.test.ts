import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrawlPreset, validateCrawlSetup } from '../src/lib/crawlSetup';

const sample = {
  url: 'https://example.com',
  mode: 'domain' as const,
  maxPages: '50',
  maxDepth: '2'
};

test('approved example configuration validates without modification', () => {
  assert.deepEqual(validateCrawlSetup(sample), {
    valid: true,
    errors: {},
    targetCount: 1
  });
});

test('domain selection preserves depth 2 rather than resetting to 5', () => {
  assert.deepEqual(resolveCrawlPreset('domain', '2'), {
    mode: 'domain',
    maxDepth: '2'
  });
});

test('single mode uses depth zero, switching back restores depth 2', () => {
  const single = resolveCrawlPreset('single', '2');
  assert.deepEqual(single, { mode: 'single', maxDepth: '0' });
  assert.deepEqual(resolveCrawlPreset('domain', single.maxDepth), {
    mode: 'domain',
    maxDepth: '2'
  });
});

test('subdirectory respects valid depth and repairs invalid depth', () => {
  assert.equal(resolveCrawlPreset('depth', '4').maxDepth, '4');
  assert.equal(resolveCrawlPreset('depth', 'not-a-number').maxDepth, '2');
});

test('invalid URLs, credentials and non-HTTP protocols are rejected', () => {
  for (const url of ['https://', 'https://user:pass@example.com', 'ftp://example.com']) {
    assert.equal(validateCrawlSetup({ ...sample, url }).valid, false, url);
  }
});

test('page count and depth require bounded integers', () => {
  assert.ok(validateCrawlSetup({ ...sample, maxPages: '0' }).errors.maxPages);
  assert.ok(validateCrawlSetup({ ...sample, maxPages: '2.5' }).errors.maxPages);
  assert.ok(validateCrawlSetup({ ...sample, maxDepth: '0' }).errors.maxDepth);
  assert.ok(validateCrawlSetup({ ...sample, maxDepth: '11' }).errors.maxDepth);
});

test('multiple whitespace-separated targets are accepted', () => {
  const validated = validateCrawlSetup({
    ...sample,
    url: 'https://example.com\nhttps://example.org'
  });
  assert.equal(validated.valid, true);
  assert.equal(validated.targetCount, 2);
});

test('single-page mode accepts depth 0', () => {
  assert.equal(validateCrawlSetup({
    ...sample, mode: 'single', maxDepth: '0'
  }).valid, true);
});
