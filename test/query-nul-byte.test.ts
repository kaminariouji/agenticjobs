import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listInstances } from '../src/directory/registry.ts';
import { parseQuery, queryToParams } from '../src/schema/query.ts';

test('a NUL byte in a string filter is dropped, not sent to the database', () => {
  // PostgreSQL refuses a NUL byte in text outright, so before this every
  // surface that shares parseQuery - the page, the API, MCP, the CLI and
  // federated search - answered 500 for `?q=%00`, `?org=%00` and `?tags=%00`.
  const query = parseQuery(new URLSearchParams({ q: '\0', org: '\0', tags: '\0', tag: '\0' }));
  assert.equal(query.q, null);
  assert.equal(query.org, null);
  assert.deepEqual(query.tags, []);
});

test('a NUL byte inside a longer value is dropped, not spaced', () => {
  // The byte is not a separator: "post\0gres" is one mangled word, not two.
  const query = parseQuery(new URLSearchParams({ q: 'post\0gres', org: 'ac\0me' }));
  assert.equal(query.q, 'postgres');
  assert.equal(query.org, 'acme');
});

test('a cleaned filter still round-trips into a canonical link', () => {
  const query = parseQuery(new URLSearchParams({ q: 'post\0gres' }));
  assert.equal(queryToParams(query).get('q'), 'postgres');
});

test('the directory search never passes a NUL byte into its parameters', async () => {
  let values: unknown[] = [];
  const pool = {
    async query(_query: string, params: unknown[] = []) {
      values = params;
      return { rows: [] };
    },
  };
  await listInstances(pool as never, { q: '\0', topic: '\0' });
  for (const value of values) {
    assert.ok(!String(value).includes('\0'), JSON.stringify(String(value)));
  }
});

test('a directory filter that cleans away to nothing is treated as absent', async () => {
  let statement = '';
  const pool = {
    async query(query: string, _params: unknown[] = []) {
      statement = query;
      return { rows: [] };
    },
  };
  await listInstances(pool as never, { q: '\0' });
  assert.ok(!statement.includes(' like '), 'no LIKE clause for a filter that is only a NUL byte');
});
