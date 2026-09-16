import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInstagramProfileCounts, getInstagramDailyReach } from './instagramClient.js';
import { createMetricsHandler } from '../api/social/instagram-metrics.js';

const company = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const userId = '17841400000000001';
const now = Date.parse('2026-09-16T12:00:00Z');
const json = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });

test('profile verifies identity and preserves missing counts versus real zero', async () => {
  let seen;
  const result = await getInstagramProfileCounts({ accessToken: 'private-token', expectedUserId: userId,
    fetchImpl: async url => { seen = url; return json({ user_id: userId, follows_count: 0 }); } });
  assert.deepEqual(result, { followers: null, following: 0 });
  assert.equal(seen.origin, 'https://graph.instagram.com');
  await assert.rejects(getInstagramProfileCounts({ accessToken: 'private-token', expectedUserId: userId,
    fetchImpl: async () => json({ user_id: '123', followers_count: 99 }) }), { code: 'IDENTITY_MISMATCH' });
});

test('reach keeps daily points and missing values without creating a weekly sum', async () => {
  const until = Date.parse('2026-09-16T00:00:00Z') / 1000;
  let url;
  const points = await getInstagramDailyReach({ accessToken: 'private-token', userId, since: until - 604800, until,
    fetchImpl: async u => { url = u; return json({ data: [{ name: 'reach', period: 'day', values: [
      { end_time: '2026-09-15T07:00:00Z', value: 0 },
      { end_time: '2026-09-14T07:00:00Z', value: null },
      { end_time: '2026-09-16T07:00:00Z', value: 3 },
    ] }] }); } });
  assert.equal(url.pathname, `/${userId}/insights`);
  assert.equal(url.searchParams.get('metric_type'), 'time_series');
  assert.deepEqual(points.map(point => point.value), [null, 0]);
});

function setup(overrides = {}) {
  const calls = [];
  const handler = createMetricsHandler({
    now: () => now, resultCache: new Map(), verifySession: () => ({ companyId: company }),
    getAccount: async (companyId, id) => { calls.push(['account', companyId, id]); return {
      company_id: company, external_account_id: userId, status: 'active', updated_at: 'v1',
      token_expires_at: '2026-11-13T00:00:00Z', scopes: ['instagram_business_manage_insights'],
    }; },
    decrypt: (_encrypted, context) => { calls.push(['decrypt', context]); return 'private-token'; },
    getProfile: async () => ({ followers: 12, following: 0 }), getReach: async () => [], ...overrides,
  });
  const invoke = async (request = {}) => {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'GET', headers: { authorization: 'session' }, query: { account: accountId }, ...request }, res);
    return res;
  };
  return { invoke, calls };
}

test('metrics require session and prevent foreign-company credential access', async () => {
  const noSession = setup({ verifySession: () => { throw Error(); } });
  assert.equal((await noSession.invoke()).code, 401);
  assert.equal(noSession.calls.length, 0);
  const foreign = setup({ getAccount: async () => ({ company_id: 'foreign' }) });
  assert.equal((await foreign.invoke()).code, 404);
  assert.equal(foreign.calls.length, 0);
});

test('expired tokens and malformed account selectors never call provider', async () => {
  const expired = setup({ getAccount: async () => ({ company_id: company, status: 'active', token_expires_at: '2025-01-01' }) });
  assert.equal((await expired.invoke()).code, 409);
  assert.equal(expired.calls.length, 0);
  assert.equal((await expired.invoke({ query: { account: [accountId] } })).code, 400);
});

test('account scoping, token binding, cache and safe response', async () => {
  let providerCalls = 0;
  const app = setup({ getProfile: async () => { providerCalls++; return { followers: 12, following: 0 }; } });
  const first = await app.invoke(); await app.invoke();
  assert.equal(providerCalls, 1);
  assert.equal(first.code, 200);
  assert.equal(first.headers['Cache-Control'], 'no-store');
  assert.deepEqual(app.calls[0], ['account', company, accountId]);
  assert.deepEqual(app.calls[1][1], { companyId: company, platform: 'instagram', externalAccountId: userId });
  assert.equal(JSON.stringify(first.body).includes('private-token'), false);
  assert.equal(first.body.partial, false);
  assert.deepEqual(first.body.dailyReach, []);
});

test('provider failures preserve other metrics without leaking errors or turning missing data into zero', async () => {
  const app = setup({ getReach: async () => { throw Object.assign(new Error('private-token'), { code: 'PROVIDER_HTTP_ERROR', status: 400 }); } });
  const res = await app.invoke();
  assert.equal(res.code, 200);
  assert.equal(res.body.profile.followers, 12);
  assert.equal(res.body.dailyReach, null);
  assert.equal(res.body.partial, true);
  assert.equal(JSON.stringify(res.body).includes('private-token'), false);
});

test('token identity mismatch fails closed instead of returning other account metrics', async () => {
  const app = setup({ getProfile: async () => { throw Object.assign(new Error('private'), { code: 'IDENTITY_MISMATCH' }); } });
  const res = await app.invoke();
  assert.equal(res.code, 500);
  assert.equal(res.body.profile, undefined);
  assert.equal(res.body.dailyReach, undefined);
});
