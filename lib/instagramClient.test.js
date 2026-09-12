import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTAGRAM_OAUTH_TOKEN_URL,
  INSTAGRAM_GRAPH_BASE_URL,
  INSTAGRAM_ANALYTICS_SCOPES,
  InstagramClientError,
  assertInstagramUserId,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  refreshInstagramLongLivedToken,
  getInstagramAccountIdentity,
} from './instagramClient.js';

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function textResponse(text, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    },
  };
}

const VALID_USER_ID = '17841400000000001';
const SHORT_TOKEN = 'IGAA_short_token_value';
const LONG_TOKEN = 'IGAA_long_token_value';

function validAuthArgs(fetchImpl) {
  return {
    clientId: '123456789012345',
    clientSecret: 'synthetic-client-secret',
    redirectUri: 'https://jmnmedia.com/api/social/instagram-callback',
    code: 'synthetic-authorization-code',
    fetchImpl,
  };
}

test('analytics-first scopes are the exact Instagram Login permissions JMN needs initially', () => {
  assert.deepEqual([...INSTAGRAM_ANALYTICS_SCOPES], [
    'instagram_business_basic',
    'instagram_business_manage_insights',
  ]);
});

test('assertInstagramUserId accepts canonical digit strings and rejects numbers', () => {
  assert.equal(assertInstagramUserId(VALID_USER_ID), VALID_USER_ID);
  assert.throws(() => assertInstagramUserId(Number(VALID_USER_ID)), InstagramClientError);
  assert.throws(() => assertInstagramUserId('abc'), InstagramClientError);
  assert.throws(() => assertInstagramUserId('1'.repeat(31)), InstagramClientError);
});

test('authorization-code exchange uses POST + FormData and returns strict normalized fields', async () => {
  let seenUrl;
  let seenOptions;
  const result = await exchangeInstagramAuthorizationCode(validAuthArgs(async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return jsonResponse({
      data: [{
        access_token: SHORT_TOKEN,
        user_id: VALID_USER_ID,
        permissions: 'instagram_business_basic, instagram_business_manage_insights',
      }],
    });
  }));

  assert.equal(seenUrl, INSTAGRAM_OAUTH_TOKEN_URL);
  assert.equal(seenOptions.method, 'POST');
  assert.ok(seenOptions.body instanceof FormData);
  assert.equal(seenOptions.body.get('client_id'), '123456789012345');
  assert.equal(seenOptions.body.get('client_secret'), 'synthetic-client-secret');
  assert.equal(seenOptions.body.get('grant_type'), 'authorization_code');
  assert.equal(seenOptions.body.get('redirect_uri'), 'https://jmnmedia.com/api/social/instagram-callback');
  assert.equal(seenOptions.body.get('code'), 'synthetic-authorization-code');
  assert.deepEqual(result, {
    accessToken: SHORT_TOKEN,
    userId: VALID_USER_ID,
    permissions: ['instagram_business_basic', 'instagram_business_manage_insights'],
  });
});

test('authorization exchange accepts a permission array and deduplicates it', async () => {
  const result = await exchangeInstagramAuthorizationCode(validAuthArgs(async () => jsonResponse({
    data: [{
      access_token: SHORT_TOKEN,
      user_id: VALID_USER_ID,
      permissions: ['instagram_business_basic', 'instagram_business_basic'],
    }],
  })));
  assert.deepEqual(result.permissions, ['instagram_business_basic']);
});

test('authorization exchange supports the strict historical bare token record shape', async () => {
  const result = await exchangeInstagramAuthorizationCode(validAuthArgs(async () => jsonResponse({
    access_token: SHORT_TOKEN,
    user_id: VALID_USER_ID,
    permissions: 'instagram_business_basic',
  })));
  assert.equal(result.userId, VALID_USER_ID);
});

test('authorization exchange rejects numeric provider user_id to avoid JS precision coercion', async () => {
  await assert.rejects(
    exchangeInstagramAuthorizationCode(validAuthArgs(async () => jsonResponse({
      data: [{ access_token: SHORT_TOKEN, user_id: 17841400000000001, permissions: [] }],
    }))),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('authorization exchange rejects zero or multiple data records', async () => {
  for (const data of [[], [
    { access_token: SHORT_TOKEN, user_id: VALID_USER_ID },
    { access_token: SHORT_TOKEN, user_id: '17841400000000002' },
  ]]) {
    await assert.rejects(
      exchangeInstagramAuthorizationCode(validAuthArgs(async () => jsonResponse({ data }))),
      (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
    );
  }
});

test('authorization exchange rejects malformed granted permissions', async () => {
  await assert.rejects(
    exchangeInstagramAuthorizationCode(validAuthArgs(async () => jsonResponse({
      data: [{ access_token: SHORT_TOKEN, user_id: VALID_USER_ID, permissions: ['pages_read_engagement'] }],
    }))),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('long-lived exchange uses graph.instagram.com access_token endpoint and required query params', async () => {
  let seenUrl;
  const result = await exchangeInstagramLongLivedToken({
    clientSecret: 'synthetic-secret',
    shortLivedAccessToken: SHORT_TOKEN,
    fetchImpl: async (url) => {
      seenUrl = url;
      return jsonResponse({ access_token: LONG_TOKEN, token_type: 'bearer', expires_in: 5_184_000 });
    },
  });

  assert.equal(seenUrl.origin, INSTAGRAM_GRAPH_BASE_URL);
  assert.equal(seenUrl.pathname, '/access_token');
  assert.equal(seenUrl.searchParams.get('grant_type'), 'ig_exchange_token');
  assert.equal(seenUrl.searchParams.get('client_secret'), 'synthetic-secret');
  assert.equal(seenUrl.searchParams.get('access_token'), SHORT_TOKEN);
  assert.deepEqual(result, { accessToken: LONG_TOKEN, expiresIn: 5_184_000 });
});

test('long-lived exchange rejects malformed expiry instead of guessing a default', async () => {
  await assert.rejects(
    exchangeInstagramLongLivedToken({
      clientSecret: 'synthetic-secret',
      shortLivedAccessToken: SHORT_TOKEN,
      fetchImpl: async () => jsonResponse({ access_token: LONG_TOKEN, expires_in: '5184000' }),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('refresh uses the dedicated Instagram refresh endpoint and returns new expiry', async () => {
  let seenUrl;
  const result = await refreshInstagramLongLivedToken({
    accessToken: LONG_TOKEN,
    fetchImpl: async (url) => {
      seenUrl = url;
      return jsonResponse({ access_token: 'IGAA_refreshed_token_value', expires_in: 5_184_000 });
    },
  });
  assert.equal(seenUrl.origin, INSTAGRAM_GRAPH_BASE_URL);
  assert.equal(seenUrl.pathname, '/refresh_access_token');
  assert.equal(seenUrl.searchParams.get('grant_type'), 'ig_refresh_token');
  assert.equal(seenUrl.searchParams.get('access_token'), LONG_TOKEN);
  assert.deepEqual(result, { accessToken: 'IGAA_refreshed_token_value', expiresIn: 5_184_000 });
});

test('/me identity request validates the canonical user_id and expected authorization identity', async () => {
  let seenUrl;
  const result = await getInstagramAccountIdentity({
    accessToken: LONG_TOKEN,
    expectedUserId: VALID_USER_ID,
    fetchImpl: async (url) => {
      seenUrl = url;
      return jsonResponse({ user_id: VALID_USER_ID, username: 'jmnmedia', account_type: 'BUSINESS' });
    },
  });
  assert.equal(seenUrl.origin, INSTAGRAM_GRAPH_BASE_URL);
  assert.equal(seenUrl.pathname, '/me');
  assert.equal(seenUrl.searchParams.get('fields'), 'user_id,username,account_type');
  assert.equal(seenUrl.searchParams.get('access_token'), LONG_TOKEN);
  assert.deepEqual(result, { userId: VALID_USER_ID, username: 'jmnmedia', accountType: 'BUSINESS' });
});

test('/me identity mismatch fails closed', async () => {
  await assert.rejects(
    getInstagramAccountIdentity({
      accessToken: LONG_TOKEN,
      expectedUserId: VALID_USER_ID,
      fetchImpl: async () => jsonResponse({
        user_id: '17841400000000002',
        username: 'otheraccount',
        account_type: 'BUSINESS',
      }),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'IDENTITY_MISMATCH'
  );
});

test('/me rejects numeric user_id', async () => {
  await assert.rejects(
    getInstagramAccountIdentity({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => jsonResponse({ user_id: 17841400000000001, username: 'jmnmedia' }),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('provider 429 is classified retryable without exposing provider body', async () => {
  const secretMarker = 'DO_NOT_LEAK_PROVIDER_BODY';
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => textResponse(`{"error":"${secretMarker}"}`, { status: 429 }),
    }),
    (error) => {
      assert.ok(error instanceof InstagramClientError);
      assert.equal(error.code, 'PROVIDER_HTTP_ERROR');
      assert.equal(error.status, 429);
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, new RegExp(secretMarker));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(secretMarker));
      return true;
    }
  );
});

test('provider 400 is classified non-retryable', async () => {
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => textResponse('{"error":"bad token"}', { status: 400 }),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'PROVIDER_HTTP_ERROR' && error.status === 400 && error.retryable === false
  );
});

test('network exception is sanitized and retryable', async () => {
  const secretMarker = 'https://graph.instagram.com/?access_token=SECRET_MARKER';
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => { throw new Error(secretMarker); },
    }),
    (error) => {
      assert.ok(error instanceof InstagramClientError);
      assert.equal(error.code, 'NETWORK_ERROR');
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /SECRET_MARKER/);
      assert.doesNotMatch(JSON.stringify(error), /SECRET_MARKER/);
      return true;
    }
  );
});

test('request timeout aborts fetch and returns sanitized TIMEOUT classification', async () => {
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      timeoutMs: 10,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('secret URL should never escape');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'TIMEOUT' && error.retryable === true
  );
});

test('invalid JSON response is rejected generically', async () => {
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => textResponse('<html>provider error</html>'),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('oversized provider body is rejected before parsing', async () => {
  await assert.rejects(
    refreshInstagramLongLivedToken({
      accessToken: LONG_TOKEN,
      fetchImpl: async () => textResponse('x'.repeat(70 * 1024)),
    }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_RESPONSE'
  );
});

test('invalid inputs are rejected before fetch is invoked', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse({}); };

  await assert.rejects(
    exchangeInstagramAuthorizationCode({
      clientId: '123',
      clientSecret: 'secret',
      redirectUri: 'http://insecure.example/callback',
      code: 'code',
      fetchImpl,
    }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_INPUT'
  );

  await assert.rejects(
    getInstagramAccountIdentity({ accessToken: '', fetchImpl }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_INPUT'
  );
  assert.equal(calls, 0);
});

test('invalid fetch implementation and timeout fail before network use', async () => {
  await assert.rejects(
    refreshInstagramLongLivedToken({ accessToken: LONG_TOKEN, fetchImpl: null }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_INPUT'
  );
  await assert.rejects(
    refreshInstagramLongLivedToken({ accessToken: LONG_TOKEN, timeoutMs: 0, fetchImpl: async () => jsonResponse({}) }),
    (error) => error instanceof InstagramClientError && error.code === 'INVALID_INPUT'
  );
});
