import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTAGRAM_AUTHORIZATION_URL,
  InstagramOAuthFlowError,
  buildInstagramAuthorizationUrl,
  parseInstagramCallbackQuery,
  completeInstagramOAuthCallback,
  buildInstagramCallbackPage,
  validatePostMessageOrigin,
} from './instagramOAuthFlow.js';

const STATE = 'A'.repeat(43);
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '17841400000000001';
const REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
];

function happyDeps(trace = []) {
  return {
    consumeState: async ({ rawState, platform }) => {
      trace.push(['consume', rawState, platform]);
      return { companyId: COMPANY_ID, contactId: CONTACT_ID };
    },
    exchangeAuthorizationCode: async (args) => {
      trace.push(['short', args]);
      return {
        accessToken: 'IGAA_short_token_value',
        userId: USER_ID,
        permissions: [...REQUIRED_SCOPES],
      };
    },
    exchangeLongLivedToken: async (args) => {
      trace.push(['long', args]);
      return { accessToken: 'IGAA_long_token_value', expiresIn: 5_184_000 };
    },
    getAccountIdentity: async (args) => {
      trace.push(['identity', args]);
      return { userId: USER_ID, username: 'jmnmedia', accountType: 'BUSINESS' };
    },
    encryptToken: (token, context) => {
      trace.push(['encrypt', token, context]);
      return {
        ciphertext: 'cipher',
        iv: 'iv',
        authTag: 'tag',
        keyVersion: 1,
        aadVersion: 1,
      };
    },
    upsertAccount: async (args) => {
      trace.push(['upsert', args]);
      return '33333333-3333-4333-8333-333333333333';
    },
  };
}

function callbackArgs(overrides = {}) {
  return {
    query: { state: STATE, code: 'synthetic-code' },
    clientId: '123456789012345',
    clientSecret: 'synthetic-app-secret',
    redirectUri: 'https://jmn-media-strategy-hub-backend.vercel.app/api/social/instagram-callback',
    requiredScopes: REQUIRED_SCOPES,
    nowMs: 1_800_000_000_000,
    ...happyDeps(),
    ...overrides,
  };
}

test('authorization URL uses Instagram Business Login core fields and no JMN identity', () => {
  const value = buildInstagramAuthorizationUrl({
    clientId: '123456789012345',
    redirectUri: 'https://example.com/api/social/instagram-callback',
    state: STATE,
  });
  const url = new URL(value);
  assert.equal(url.origin + url.pathname, INSTAGRAM_AUTHORIZATION_URL);
  assert.equal(url.searchParams.get('client_id'), '123456789012345');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/social/instagram-callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), REQUIRED_SCOPES.join(','));
  assert.equal(url.searchParams.get('state'), STATE);
  assert.equal(url.searchParams.has('companyId'), false);
  assert.equal(url.searchParams.has('contactId'), false);
  assert.equal(url.searchParams.has('sessionToken'), false);
});

test('authorization URL rejects non-HTTPS redirect, malformed app ID, and malformed state', () => {
  for (const args of [
    { clientId: 'abc', redirectUri: 'https://example.com/cb', state: STATE },
    { clientId: '123', redirectUri: 'http://example.com/cb', state: STATE },
    { clientId: '123', redirectUri: 'https://example.com/cb', state: 'short' },
  ]) {
    assert.throws(() => buildInstagramAuthorizationUrl(args), InstagramOAuthFlowError);
  }
});

test('callback parser accepts exactly code XOR error plus canonical state', () => {
  assert.deepEqual(
    parseInstagramCallbackQuery({ state: STATE, code: 'abc' }),
    { kind: 'code', state: STATE, code: 'abc' }
  );
  assert.deepEqual(
    parseInstagramCallbackQuery({ state: STATE, error: 'access_denied', error_description: 'ignored' }),
    { kind: 'declined', state: STATE }
  );
});

test('callback parser rejects parameter pollution, both/neither outcome, and malformed state', () => {
  for (const query of [
    { state: [STATE, STATE], code: 'abc' },
    { state: STATE, code: ['a', 'b'] },
    { state: STATE, error: ['a', 'b'] },
    { state: STATE, code: 'abc', error: 'denied' },
    { state: STATE },
    { state: 'bad', code: 'abc' },
  ]) {
    assert.throws(() => parseInstagramCallbackQuery(query), InstagramOAuthFlowError);
  }
});

test('malformed callback does not consume state', async () => {
  let consumes = 0;
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      query: { state: STATE, code: 'abc', error: 'denied' },
      consumeState: async () => { consumes += 1; },
    })),
    InstagramOAuthFlowError
  );
  assert.equal(consumes, 0);
});

test('provider decline consumes state exactly once and performs no provider/token/account work', async () => {
  const calls = [];
  const deps = happyDeps(calls);
  const result = await completeInstagramOAuthCallback(callbackArgs({
    query: { state: STATE, error: 'access_denied', error_description: 'DO_NOT_REFLECT' },
    ...deps,
  }));
  assert.deepEqual(result, { outcome: 'declined' });
  assert.deepEqual(calls, [['consume', STATE, 'instagram']]);
});

test('happy path order is state -> short -> long -> identity -> encrypt -> upsert', async () => {
  const trace = [];
  const result = await completeInstagramOAuthCallback(callbackArgs({ ...happyDeps(trace) }));
  assert.deepEqual(result, { outcome: 'connected' });
  assert.deepEqual(trace.map(([name]) => name), [
    'consume', 'short', 'long', 'identity', 'encrypt', 'upsert',
  ]);

  const encryptEntry = trace.find(([name]) => name === 'encrypt');
  assert.equal(encryptEntry[1], 'IGAA_long_token_value');
  assert.deepEqual(encryptEntry[2], {
    companyId: COMPANY_ID,
    platform: 'instagram',
    externalAccountId: USER_ID,
  });

  const upsert = trace.find(([name]) => name === 'upsert')[1];
  assert.equal(upsert.companyId, COMPANY_ID);
  assert.equal(upsert.contactId, CONTACT_ID);
  assert.equal(upsert.externalAccountId, USER_ID);
  assert.equal(upsert.username, 'jmnmedia');
  assert.equal(upsert.accountType, 'BUSINESS');
  assert.deepEqual(upsert.scopes, REQUIRED_SCOPES);
  assert.equal(upsert.tokenExpiresAt, new Date(1_800_000_000_000 + 5_184_000 * 1000).toISOString());
});

test('required analytics scope missing fails before long-token exchange', async () => {
  let longCalls = 0;
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      exchangeAuthorizationCode: async () => ({
        accessToken: 'IGAA_short_token_value',
        userId: USER_ID,
        permissions: ['instagram_business_basic'],
      }),
      exchangeLongLivedToken: async () => { longCalls += 1; },
    })),
    (error) => error instanceof InstagramOAuthFlowError && error.code === 'MISSING_REQUIRED_SCOPES'
  );
  assert.equal(longCalls, 0);
});

test('identity mismatch fails before encryption and persistence', async () => {
  let encryptionCalls = 0;
  let upsertCalls = 0;
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      getAccountIdentity: async () => ({
        userId: '17841400000000002',
        username: 'wrong',
        accountType: 'BUSINESS',
      }),
      encryptToken: () => { encryptionCalls += 1; },
      upsertAccount: async () => { upsertCalls += 1; },
    })),
    (error) => error instanceof InstagramOAuthFlowError && error.code === 'IDENTITY_MISMATCH'
  );
  assert.equal(encryptionCalls, 0);
  assert.equal(upsertCalls, 0);
});

test('personal or unknown account type is rejected before encryption', async () => {
  for (const accountType of ['PERSONAL', null, 'UNKNOWN']) {
    let encryptionCalls = 0;
    await assert.rejects(
      completeInstagramOAuthCallback(callbackArgs({
        getAccountIdentity: async () => ({ userId: USER_ID, username: 'jmnmedia', accountType }),
        encryptToken: () => { encryptionCalls += 1; },
      })),
      (error) => error instanceof InstagramOAuthFlowError && error.code === 'UNSUPPORTED_ACCOUNT_TYPE'
    );
    assert.equal(encryptionCalls, 0);
  }
});

test('state failure stops all provider calls', async () => {
  let providerCalls = 0;
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      consumeState: async () => { throw new Error('db detail must not escape'); },
      exchangeAuthorizationCode: async () => { providerCalls += 1; },
    })),
    (error) => error instanceof InstagramOAuthFlowError && error.code === 'INVALID_STATE'
  );
  assert.equal(providerCalls, 0);
});

test('provider and token errors are collapsed to static flow errors', async () => {
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      exchangeAuthorizationCode: async () => {
        throw new Error('SECRET_PROVIDER_BODY access_token=abc');
      },
    })),
    (error) => {
      assert.ok(error instanceof InstagramOAuthFlowError);
      assert.equal(error.code, 'PROVIDER_EXCHANGE_FAILED');
      assert.doesNotMatch(error.message, /SECRET_PROVIDER_BODY|access_token/);
      return true;
    }
  );
});

test('ownership/upsert denial is generic and occurs after encryption only', async () => {
  await assert.rejects(
    completeInstagramOAuthCallback(callbackArgs({
      upsertAccount: async () => { throw new Error('cross-company row detail'); },
    })),
    (error) => {
      assert.ok(error instanceof InstagramOAuthFlowError);
      assert.equal(error.code, 'ACCOUNT_OWNERSHIP_DENIED');
      assert.doesNotMatch(error.message, /cross-company/);
      return true;
    }
  );
});

test('postMessage origin accepts exact HTTPS origins only', () => {
  assert.equal(validatePostMessageOrigin('https://portal.example.com'), 'https://portal.example.com');
  assert.throws(() => validatePostMessageOrigin('http://portal.example.com'), InstagramOAuthFlowError);
  assert.throws(() => validatePostMessageOrigin('https://portal.example.com/path'), InstagramOAuthFlowError);
  assert.throws(() => validatePostMessageOrigin('https://user:pass@portal.example.com'), InstagramOAuthFlowError);
});

test('callback HTML contains only safe outcome/origin and strips query via history.replaceState', () => {
  const { html, nonce } = buildInstagramCallbackPage({
    outcome: 'connected',
    allowedOrigin: 'https://portal.example.com',
  });
  assert.match(html, /history\.replaceState/);
  assert.match(html, /window\.opener\.postMessage/);
  assert.match(html, /https:\/\/portal\.example\.com/);
  assert.match(html, /jmn:social-connect/);
  assert.match(html, /connected/);
  assert.ok(typeof nonce === 'string' && nonce.length > 10);
  assert.doesNotMatch(html, /access_token|client_secret|companyId|contactId/);
});
