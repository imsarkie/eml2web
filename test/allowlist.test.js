import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedSender } from '../src/allowlist.js';

test('allows an exact match', () => {
  assert.equal(isAllowedSender('me@example.com', 'me@example.com'), true);
});

test('is case-insensitive', () => {
  assert.equal(isAllowedSender('Me@Example.com', 'me@example.com'), true);
});

test('tolerates surrounding whitespace', () => {
  assert.equal(isAllowedSender('  me@example.com  ', 'me@example.com'), true);
});

test('rejects a different sender', () => {
  assert.equal(isAllowedSender('someone-else@example.com', 'me@example.com'), false);
});

test('fails closed when no sender is configured, even for a plausible address', () => {
  assert.equal(isAllowedSender('me@example.com', ''), false);
  assert.equal(isAllowedSender('me@example.com', undefined), false);
});

test('fails closed when there is no from address', () => {
  assert.equal(isAllowedSender('', 'me@example.com'), false);
  assert.equal(isAllowedSender(undefined, 'me@example.com'), false);
});

test('accepts a comma-separated list of multiple allowed senders', () => {
  const allowed = 'me@example.com,other@example.com';
  assert.equal(isAllowedSender('me@example.com', allowed), true);
  assert.equal(isAllowedSender('other@example.com', allowed), true);
  assert.equal(isAllowedSender('stranger@example.com', allowed), false);
});

test('tolerates whitespace and case within the comma-separated list', () => {
  const allowed = ' Me@Example.com , Other@Example.com ';
  assert.equal(isAllowedSender('me@example.com', allowed), true);
  assert.equal(isAllowedSender('other@example.com', allowed), true);
});
