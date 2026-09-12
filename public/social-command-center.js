(() => {
  'use strict';

  const MESSAGE_TYPE = 'jmn:social-connect';
  const PLATFORM = 'instagram';
  const ALLOWED_RESULTS = new Set(['connected', 'declined', 'error']);
  const INSTAGRAM_AUTH_ORIGIN = 'https://www.instagram.com';
  const INSTAGRAM_AUTH_PATH = '/oauth/authorize';
  const MAX_BOOTSTRAP_LENGTH = 4096;

  const gateEl = document.getElementById('access-gate');
  const appEl = document.getElementById('app');
  const pillEl = document.getElementById('connection-pill');
  const emptyStateEl = document.getElementById('empty-state');
  const accountsEl = document.getElementById('accounts');
  const connectBtn = document.getElementById('connect-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const feedbackEl = document.getElementById('feedback');

  let sessionToken = null;
  let sessionExpiryTimer = null;
  let authPopup = null;
  let popupPollTimer = null;
  let popupMessageHandled = false;

  function setFeedback(message, kind = '') {
    feedbackEl.textContent = message || '';
    feedbackEl.className = 'feedback' + (kind ? ` ${kind}` : '');
  }

  function setControlsEnabled(enabled) {
    connectBtn.disabled = !enabled;
    refreshBtn.disabled = !enabled;
  }

  function denyAccess() {
    sessionToken = null;
    if (sessionExpiryTimer) {
      clearTimeout(sessionExpiryTimer);
      sessionExpiryTimer = null;
    }
    stopPopupPolling();
    if (authPopup && !authPopup.closed) {
      try { authPopup.close(); } catch {}
    }
    authPopup = null;
    setControlsEnabled(false);
    appEl.hidden = true;
    gateEl.hidden = false;
  }

  function showApp() {
    gateEl.hidden = true;
    appEl.hidden = false;
    setControlsEnabled(true);
  }

  function consumeBootstrapTokenFromHash() {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;

    let token = null;
    if (rawHash) {
      try {
        const params = new URLSearchParams(rawHash);
        const values = params.getAll('token');
        if (values.length === 1 && values[0] && values[0].length <= MAX_BOOTSTRAP_LENGTH) {
          token = values[0];
        }
      } catch {}

      // Remove the entire fragment immediately. Bootstrap material must never
      // remain visible in the address bar or browser history after first read.
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return token;
  }

  function scheduleSessionExpiry(expiresInSeconds) {
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
      denyAccess();
      return false;
    }
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = setTimeout(() => {
      denyAccess();
    }, expiresInSeconds * 1000);
    return true;
  }

  async function exchangeBootstrapToken(bootstrapToken) {
    const response = await fetch('/api/session-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bootstrapToken })
    });

    if (!response.ok) throw new Error('SESSION_EXCHANGE_FAILED');
    const data = await response.json();
    if (!data || typeof data.sessionToken !== 'string' || data.sessionToken.length === 0) {
      throw new Error('SESSION_EXCHANGE_FAILED');
    }
    if (!scheduleSessionExpiry(data.expiresInSeconds)) {
      throw new Error('SESSION_EXCHANGE_FAILED');
    }
    return data.sessionToken;
  }

  async function fetchStatus() {
    if (!sessionToken) return null;
    const response = await fetch('/api/social/instagram-status', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
      cache: 'no-store'
    });

    if (response.status === 401) {
      denyAccess();
      return null;
    }
    if (!response.ok) throw new Error('STATUS_FAILED');

    const data = await response.json();
    if (!data || !Array.isArray(data.accounts)) throw new Error('STATUS_FAILED');
    return data.accounts;
  }

  function safeText(value, fallback = '—') {
    return typeof value === 'string' && value.length ? value : fallback;
  }

  function formatAccountType(value) {
    if (value === 'BUSINESS') return 'Business';
    if (value === 'MEDIA_CREATOR') return 'Creator';
    return 'Professional';
  }

  function formatDate(value) {
    if (typeof value !== 'string' || !value) return 'Unknown expiry';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown expiry';
    return `Token valid until ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  }

  function renderAccounts(accounts) {
    accountsEl.replaceChildren();
    const connected = accounts.length > 0;
    emptyStateEl.hidden = connected;
    pillEl.textContent = connected ? `${accounts.length} connected` : 'Not connected';
    pillEl.className = connected ? 'pill connected' : 'pill';

    for (const account of accounts) {
      if (!account || typeof account !== 'object') continue;

      const row = document.createElement('div');
      row.className = 'account';

      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'account-name';
      name.textContent = `@${safeText(account.username, 'instagram')}`;

      const meta = document.createElement('div');
      meta.className = 'account-meta';
      meta.textContent = `${formatAccountType(account.accountType)} · ${formatDate(account.tokenExpiresAt)}`;

      left.append(name, meta);

      const status = document.createElement('div');
      status.className = 'account-status';
      status.textContent = safeText(account.status, 'Connected');

      row.append(left, status);
      accountsEl.append(row);
    }
  }

  async function refreshStatus({ quiet = false } = {}) {
    if (!sessionToken) return;
    refreshBtn.disabled = true;
    if (!quiet) setFeedback('Checking Instagram connection…');
    try {
      const accounts = await fetchStatus();
      if (!accounts) return;
      renderAccounts(accounts);
      if (!quiet) setFeedback('Connection status updated.');
    } catch {
      setFeedback('Unable to load Instagram connection status. Try again.', 'error');
    } finally {
      if (sessionToken) refreshBtn.disabled = false;
    }
  }

  function validateAuthorizationUrl(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
    try {
      const url = new URL(value);
      if (url.origin !== INSTAGRAM_AUTH_ORIGIN) return null;
      if (url.pathname !== INSTAGRAM_AUTH_PATH) return null;
      if (url.username || url.password || url.hash) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function stopPopupPolling() {
    if (popupPollTimer) {
      clearInterval(popupPollTimer);
      popupPollTimer = null;
    }
  }

  function startPopupPolling(popup) {
    stopPopupPolling();
    popupPollTimer = setInterval(() => {
      if (popup !== authPopup) {
        stopPopupPolling();
        return;
      }
      let closed = false;
      try { closed = popup.closed; } catch {}
      if (!closed) return;

      stopPopupPolling();
      authPopup = null;
      if (!popupMessageHandled) {
        setFeedback('Instagram window closed. Checking connection status…');
        window.setTimeout(() => refreshStatus({ quiet: true }), 300);
      }
    }, 500);
  }

  async function startInstagramConnect() {
    if (!sessionToken || authPopup) return;

    // Open synchronously inside the user gesture so browsers do not classify
    // the OAuth popup as an unsolicited popup after the network request.
    const popup = window.open('about:blank', '_blank', 'popup=yes,width=560,height=760');
    if (!popup) {
      setFeedback('Your browser blocked the Instagram window. Allow popups for JMN and try again.', 'error');
      return;
    }

    authPopup = popup;
    popupMessageHandled = false;
    connectBtn.disabled = true;
    setFeedback('Preparing secure Instagram connection…');

    try {
      const response = await fetch('/api/social/instagram-connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

      if (response.status === 401) {
        try { popup.close(); } catch {}
        authPopup = null;
        denyAccess();
        return;
      }
      if (!response.ok) throw new Error('CONNECT_START_FAILED');

      const data = await response.json();
      const authorizationUrl = validateAuthorizationUrl(data && data.authorizationUrl);
      if (!authorizationUrl) throw new Error('CONNECT_START_FAILED');

      popup.location.replace(authorizationUrl);
      startPopupPolling(popup);
      setFeedback('Complete the Instagram authorization in the new window.');
    } catch {
      try { popup.close(); } catch {}
      if (popup === authPopup) authPopup = null;
      stopPopupPolling();
      setFeedback('Unable to start Instagram connection. Try again.', 'error');
    } finally {
      if (sessionToken && !authPopup) connectBtn.disabled = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (!authPopup || event.source !== authPopup) return;

    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    if (data.type !== MESSAGE_TYPE || data.platform !== PLATFORM) return;
    if (!ALLOWED_RESULTS.has(data.result)) return;

    popupMessageHandled = true;
    stopPopupPolling();
    try { authPopup.close(); } catch {}
    authPopup = null;
    if (sessionToken) connectBtn.disabled = false;

    if (data.result === 'connected') {
      setFeedback('Instagram connected. Confirming account status…', 'success');
      window.setTimeout(() => refreshStatus({ quiet: true }), 150);
      return;
    }
    if (data.result === 'declined') {
      setFeedback('Instagram connection was cancelled. Nothing was changed.');
      return;
    }
    setFeedback('Instagram connection failed. Try again.', 'error');
  });

  connectBtn.addEventListener('click', startInstagramConnect);
  refreshBtn.addEventListener('click', () => refreshStatus());

  async function authenticateAndStart() {
    let bootstrapToken = consumeBootstrapTokenFromHash();
    if (!bootstrapToken) {
      denyAccess();
      return;
    }

    try {
      sessionToken = await exchangeBootstrapToken(bootstrapToken);
    } catch {
      bootstrapToken = null;
      denyAccess();
      return;
    }
    bootstrapToken = null;

    showApp();
    await refreshStatus({ quiet: true });
  }

  authenticateAndStart();
})();
