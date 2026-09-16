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
        const prefix = 'token=';
        if (rawHash.startsWith(prefix) && !rawHash.includes('&')) {
          // URLSearchParams follows form-encoding rules and converts "+" to a
          // space. Bootstrap tokens use standard Base64, where "+" is data,
          // so decode the fragment value directly instead.
          const value = decodeURIComponent(rawHash.slice(prefix.length));
          if (value && value.length <= MAX_BOOTSTRAP_LENGTH) {
            token = value;
          }
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
    return `Access expires ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  }

  function renderAccounts(accounts) {
    accountsEl.replaceChildren();
    const connected = accounts.some(account => account?.status === 'active');
    emptyStateEl.hidden = accounts.length > 0;
    pillEl.textContent = connected ? 'Connected' : 'Not connected';
    pillEl.className = connected ? 'pill connected' : 'pill';
    document.querySelector('.connection-settings').open = !connected;
    connectBtn.textContent = connected ? 'Connect another account' : 'Connect Instagram';

    let firstActive = true;
    for (const account of accounts) {
      if (!account || typeof account !== 'object') continue;

      const row = document.createElement('div');
      row.className = 'account';

      const left = document.createElement('div');
      const identity = document.createElement('div');
      identity.className = 'account-identity';
      const avatar = metricNode('div', safeText(account.username, 'IG').slice(0, 2).toUpperCase(), 'account-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      const name = document.createElement('div');
      name.className = 'account-name';
      name.textContent = `@${safeText(account.username, 'instagram')}`;

      const meta = document.createElement('div');
      meta.className = 'account-meta';
      meta.textContent = `${formatAccountType(account.accountType)} account`;
      meta.title = formatDate(account.tokenExpiresAt);

      left.append(name, meta);
      identity.append(avatar, left);

      const status = document.createElement('div');
      status.className = 'account-status';
      status.textContent = safeText(account.status, 'Connected');

      row.append(identity, status);
      const block = document.createElement('div');
      block.className = 'account-block';
      block.append(row);
      accountsEl.append(block);
      if (account.status === 'active') {
        const panel = document.createElement('section');
        panel.className = 'metrics-panel';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.textContent = '↻ Update overview';
        const content = document.createElement('div');
        content.className = 'metrics-content';
        content.setAttribute('aria-live', 'polite');
        row.append(button);
        panel.append(content);
        block.append(panel);
        button.addEventListener('click', () => loadMetrics(account.id, content, button));
        if (firstActive) {
          firstActive = false;
          loadMetrics(account.id, content, button);
        }
      } else {
        block.append(metricNode('p', 'This connection needs attention. Open Manage connection to reconnect your account.', 'metrics-message'));
      }
    }
  }

  function metricNode(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function renderContent(data, content) {
    const section = metricNode('section', '', 'content-section');
    const heading = metricNode('div', '', 'section-heading');
    const title = metricNode('div', '');
    title.append(metricNode('div', 'CONTENT INTELLIGENCE', 'section-kicker'), metricNode('h3', 'Make your next post count.'), metricNode('p', 'Explore your latest content and turn signals into a next step.', 'chart-subtitle'));
    heading.append(title); section.append(heading);
    const posts = Array.isArray(data.recentMedia) ? data.recentMedia : [];
    const valid = n => Number.isSafeInteger(n) && n >= 0;
    const number = n => valid(n) ? n.toLocaleString() : '—';
    const total = p => valid(p.likes) && valid(p.comments) ? p.likes + p.comments : null;
    const ranked = posts.filter(p => total(p) !== null).sort((a,b) => total(b) - total(a));
    const date = p => p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable';
    const label = p => p.caption?.trim() || 'Untitled post';
    const type = p => ({VIDEO:'Video', IMAGE:'Photo', CAROUSEL_ALBUM:'Carousel'}[p.type] || 'Post');
    if (!posts.length) {
      section.append(metricNode('div', data.recentMedia === null ? 'Recent posts are unavailable right now. Update the overview to try again.' : 'Your recent posts will appear here when Instagram returns them.', 'content-empty'));
      content.append(section); return;
    }
    const layout = metricNode('div', '', 'content-analysis');
    const comparison = metricNode('section', '', 'chart-card');
    comparison.append(metricNode('h3', 'Which posts start a conversation?'), metricNode('p', 'Top 5 by likes + comments · among the posts loaded below', 'chart-subtitle'));
    const legend = metricNode('div', '', 'content-legend'); legend.append(metricNode('span','● Likes','likes-key'),metricNode('span','● Comments','comments-key')); comparison.append(legend);
    const ceiling = Math.max(1, ...ranked.map(p => total(p)));
    for (const p of ranked.slice(0,5)) {
      const row = metricNode('div', '', 'comparison-row');
      const name = metricNode('span', label(p), 'comparison-label'); name.title = label(p);
      const bar = metricNode('div', '', 'comparison-track');
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${label(p)}: ${number(p.likes)} likes, ${number(p.comments)} comments`);
      const likes = metricNode('span','','likes-bar'); likes.style.width = `${p.likes / ceiling * 100}%`;
      const comments = metricNode('span','','comments-bar'); comments.style.width = `${p.comments / ceiling * 100}%`;
      bar.append(likes,comments); row.append(name,bar,metricNode('strong',number(total(p)))); comparison.append(row);
    }
    if (!ranked.length) comparison.append(metricNode('p','Interaction counts are not available for these posts.','metrics-note'));
    comparison.append(metricNode('p','Counts are cumulative per post, not a 7-day total. Older posts have had more time to collect interactions.','metrics-note'));
    const advice = metricNode('aside','','recommendations');
    advice.append(metricNode('div','✦ YOUR NEXT MOVES','section-kicker'),metricNode('h3','Small signals. Useful direction.'));
    const addAdvice = (n, title, copy) => {
      const item = metricNode('div','','recommendation'); item.append(metricNode('span',n,'recommendation-number'));
      const body = metricNode('div',''); body.append(metricNode('h4',title),metricNode('p',copy)); item.append(body); advice.append(item);
    };
    const top = ranked[0];
    if (top && total(top) > 0) addAdvice('01','Revisit your strongest idea', `Your ${type(top).toLowerCase()} from ${date(top)} has ${number(total(top))} likes + comments, the highest count in this sample. Try a follow-up with a fresh angle.`);
    else addAdvice('01','Give people a reason to respond','Try a post that answers one specific customer question, then invite a reply. Compare its results here after publishing.');
    const formats = [...new Set(posts.map(p => type(p)))];
    addAdvice('02',formats.length === 1 ? 'Test another format' : 'Compare the message, too', formats.length === 1 ? `All ${posts.length} loaded posts are ${formats[0].toLowerCase()} content. Try the same useful idea in another format and compare the response.` : `This sample includes ${formats.join(', ').toLowerCase()}. Compare similar topics before attributing differences to the format.`);
    addAdvice('03','Turn comments into your next brief','Open a post below, read the questions people ask, and use one as the starting point for your next post.');
    advice.append(metricNode('p',`Suggestions based on ${posts.length} loaded posts. These are experiments to try, not performance forecasts.`,'metrics-note'));
    layout.append(comparison,advice); section.append(layout);
    const galleryHead = metricNode('div','','section-heading gallery-heading');
    const galleryTitle = metricNode('div',''); galleryTitle.append(metricNode('h3','Your content, at a glance'),metricNode('p',`${posts.length} recent posts · thumbnail previews from Instagram`,'chart-subtitle'));
    const sort = metricNode('select','','content-sort'); sort.setAttribute('aria-label','Sort recent posts');
    for(const [value,text] of [['recent','Newest first'],['top','Most interactions']]) { const option = metricNode('option',text);option.value=value;sort.append(option); }
    galleryHead.append(galleryTitle,sort);section.append(galleryHead);
    const gallery = metricNode('div','','post-grid');
    const more = metricNode('button','','btn btn-secondary show-posts'); more.type='button';
    let expanded = false;
    function draw() {
      gallery.replaceChildren();
      const ordered = [...posts].sort(sort.value === 'top' ? (a,b) => (total(b) ?? -1) - (total(a) ?? -1) : (a,b) => (Date.parse(b.timestamp)||0) - (Date.parse(a.timestamp)||0));
      for (const p of ordered.slice(0, expanded ? 12 : 6)) {
        const card = metricNode('article','','post-card');
        const preview = metricNode('div','','post-preview');
        const placeholder = metricNode('span',type(p),'post-placeholder');preview.append(placeholder);
        if (p.thumbnailUrl) { const img=document.createElement('img');img.alt=label(p).slice(0,150);img.loading='lazy';img.referrerPolicy='no-referrer';img.src=p.thumbnailUrl;img.addEventListener('error',()=>img.remove(),{once:true});preview.append(img); }
        preview.append(metricNode('span',type(p),'post-type'));
        const body = metricNode('div','','post-body');
        const caption=metricNode('h4',label(p));caption.title=label(p);
        body.append(metricNode('span',date(p),'post-date'),caption);
        const stats=metricNode('div','','post-stats');stats.append(metricNode('span',`♡ ${number(p.likes)} likes`),metricNode('span',`◌ ${number(p.comments)} comments`));body.append(stats);
        if (p.permalink) {const link=metricNode('a','View on Instagram ↗','post-link');link.href=p.permalink;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}
        card.append(preview,body);gallery.append(card);
      }
      more.hidden=posts.length<=6;more.textContent=expanded?'Show fewer posts':`Show all ${posts.length} posts`;more.setAttribute('aria-expanded',String(expanded));
    }
    sort.addEventListener('change',draw);more.addEventListener('click',()=>{expanded=!expanded;draw();});draw();section.append(gallery,more);content.append(section);
  }

  function renderMetrics(data, content) {
    content.replaceChildren();
    const isCount = value => Number.isSafeInteger(value) && value >= 0;
    const number = value => isCount(value) ? value.toLocaleString() : '—';
    const points = (Array.isArray(data.dailyReach) ? data.dailyReach : [])
      .filter(point => point && Number.isFinite(Date.parse(point.endTime)))
      .sort((a, b) => a.endTime.localeCompare(b.endTime)).slice(-7);
    const available = points.filter(point => isCount(point.value));
    const peak = available.length ? Math.max(...available.map(point => point.value)) : null;
    const best = available.find(point => point.value === peak);
    const shortDate = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endDate = value => new Date(value).toISOString().slice(0,16).replace('T',' ') + ' UTC';
    const grid = metricNode('div', '', 'metrics-grid');
    for (const item of [
      ['Followers', data.profile?.followers, 'Your current audience', '↗'],
      ['Following', data.profile?.following, 'Accounts you follow', '◎'],
      ['Peak daily reach', peak, best ? `Period ending ${shortDate(best.endTime)}` : 'Waiting for data', '⌁'],
    ]) {
      const card = metricNode('div', '', 'metric-card');
      const glyph = metricNode('span', item[3], 'metric-glyph'); glyph.setAttribute('aria-hidden', 'true');
      card.append(metricNode('div', item[0], 'metric-label'), metricNode('div', number(item[1]), 'metric-value'), metricNode('div', item[2], 'metric-caption'), glyph);
      grid.append(card);
    }
    content.append(grid);
    const layout = metricNode('div', '', 'overview-layout');
    const chart = metricNode('section', '', 'chart-card');
    chart.setAttribute('aria-label', 'Daily Instagram reach');
    const heading = metricNode('div', '', 'chart-heading');
    const title = metricNode('div', '');
    title.append(metricNode('h3', 'How far your content travels'), metricNode('p', 'Daily reach · unique accounts', 'chart-subtitle'));
    heading.append(title, metricNode('span', 'Last 7 days', 'chart-period'));
    chart.append(heading);
    if (points.length && available.length) {
      const reading = metricNode('div', '', 'chart-reading');
      reading.setAttribute('aria-live', 'polite');
      const frame = metricNode('div', '', 'chart-frame');
      const axis = metricNode('div', '', 'chart-axis'); axis.setAttribute('aria-hidden', 'true');
      const ceiling = Math.max(2, peak);
      axis.append(metricNode('span', ceiling.toLocaleString()), metricNode('span', Math.round(ceiling / 2).toLocaleString()), metricNode('span', '0'));
      const plot = metricNode('div', '', 'chart-plot');
      plot.style.gridTemplateColumns = `repeat(${points.length}, minmax(0, 1fr))`;
      plot.setAttribute('role', 'group'); plot.setAttribute('aria-label', 'Choose a day to see its reach');
      const buttons = [];
      const select = index => {
        const point = points[index];
        for (const [i, button] of buttons.entries()) {
          button.classList.toggle('selected', i === index);
          button.setAttribute('aria-pressed', String(i === index));
        }
        reading.replaceChildren(metricNode('strong', number(point.value)), metricNode('span', ` ${point.value === 1 ? 'account' : 'accounts'} reached · ${shortDate(point.endTime)}`));
        if (!isCount(point.value)) reading.replaceChildren(metricNode('span', `No data available · ${shortDate(point.endTime)}`));
      };
      points.forEach((point, index) => {
        const button = metricNode('button', '', 'chart-column'); button.type = 'button';
        button.setAttribute('aria-label', `${isCount(point.value) ? number(point.value) + ' accounts reached' : 'No data'}, 24 hours ending ${endDate(point.endTime)}`);
        button.title = `24 hours ending ${endDate(point.endTime)}: ${number(point.value)}`;
        const track = metricNode('span', '', 'bar-track');
        const bar = metricNode('span', '', 'chart-bar' + (!isCount(point.value) ? ' missing' : point.value === 0 ? ' zero' : ''));
        bar.style.setProperty('--bar-height', `${isCount(point.value) ? point.value / ceiling * 100 : 0}%`);
        track.append(bar); button.append(track, metricNode('span', shortDate(point.endTime), 'bar-label'));
        button.addEventListener('mouseenter', () => select(index));
        button.addEventListener('focus', () => select(index));
        button.addEventListener('click', () => select(index));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[target].focus();
        });
        buttons.push(button); plot.append(button);
      });
      select(points.length - 1);
      frame.append(axis, plot); chart.append(reading, frame);
      chart.append(metricNode('p', 'Choose a day to explore its reach.', 'chart-foot'));
    } else {
      const empty = metricNode('div', '', 'chart-empty');
      empty.append(metricNode('strong', 'Your story is still taking shape.'), metricNode('span', data.dailyReach === null ? 'Reach is unavailable right now. Try updating later.' : 'Instagram has not returned reach for this period yet.'));
      chart.append(empty);
    }
    const insight = metricNode('aside', '', 'insight-card');
    const icon = metricNode('div', '✦', 'insight-icon'); icon.setAttribute('aria-hidden', 'true');
    insight.append(icon, metricNode('div', 'At a glance', 'insight-eyebrow'));
    if (best && peak > 0) {
      insight.append(metricNode('h3', `${shortDate(best.endTime)} led the week.`));
      const stat = metricNode('div', '', 'insight-stat');
      stat.append(metricNode('strong', number(peak)), metricNode('span', peak === 1 ? 'account reached' : 'accounts reached')); insight.append(stat);
      insight.append(metricNode('p', 'Your highest daily reach in the available data. Review what you shared around this period to help plan your next post.', 'insight-copy'));
    } else if (best) {
      insight.append(metricNode('h3', 'A quiet week.'), metricNode('p', 'Instagram reported zero reach for the available days. A useful post for your audience is a practical next step.', 'insight-copy'));
    } else {
      insight.append(metricNode('h3', 'Ready for the next signal.'), metricNode('p', 'Your account is connected. This snapshot will take shape as Instagram makes reach data available.', 'insight-copy'));
    }
    insight.append(metricNode('div', `${available.length} of 7 daily values available · Based on Instagram data`, 'insight-tag'));
    layout.append(chart, insight); content.append(layout);
    if (data.partial) content.append(metricNode('p', 'Some data is temporarily unavailable. Your connection is still saved.', 'metrics-warning'));
    renderContent(data, content);
    const footer = metricNode('div', '', 'overview-footer');
    const details = metricNode('details', '', 'data-details');
    details.append(metricNode('summary', 'View daily values & details'));
    details.append(metricNode('p', 'Dates mark the end of Instagram’s 24-hour reporting periods in UTC. Daily reach counts unique accounts for each period; adding days does not give a unique weekly audience. — means unavailable.', 'metrics-note'));
    if (points.length) {
      const table = metricNode('table', '', 'metrics-table');
      const head = document.createElement('thead'); const tr = document.createElement('tr');
      for (const text of ['Period ending (UTC)', 'Accounts reached']) { const th = metricNode('th', text); th.scope = 'col'; tr.append(th); }
      head.append(tr); const body = document.createElement('tbody');
      for (const point of points) { const row = document.createElement('tr'); row.append(metricNode('td', endDate(point.endTime)), metricNode('td', number(point.value))); body.append(row); }
      table.append(head, body); details.append(table);
    }
    details.append(metricNode('p', 'Data is retrieved on demand and may be delayed by Instagram. A daily history is not saved yet.', 'metrics-note'));
    const fetched = new Date(data.fetchedAt);
    const updated = metricNode('span', Number.isNaN(fetched.getTime()) ? 'Instagram data' : `Updated ${fetched.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, 'updated-label');
    if (!Number.isNaN(fetched.getTime())) updated.title = fetched.toLocaleString();
    footer.append(details, updated); content.append(footer);
  }

  async function loadMetrics(accountId, content, button) {
    if (!sessionToken || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Updating…';
    if (!content.childElementCount) content.replaceChildren(metricNode('p', 'Bringing your audience into focus…', 'metrics-message'));
    content.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/social/instagram-metrics?account=' + encodeURIComponent(accountId), {
        headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store'
      });
      if (response.status === 401) { denyAccess(); return; }
      if (!response.ok) throw new Error(response.status === 409 ? 'RECONNECT' : 'METRICS_FAILED');
      const data = await response.json();
      if (!sessionToken || !content.isConnected) return;
      if (data.accountId !== accountId) throw new Error('METRICS_FAILED');
      renderMetrics(data, content);
    } catch (error) {
      if (sessionToken && content.isConnected) content.replaceChildren(metricNode('p', error.message === 'RECONNECT' ? 'Reconnect Instagram to load metrics.' : 'Unable to load metrics. Try refreshing metrics.', 'metrics-message'));
    } finally {
      button.disabled = !sessionToken;
      button.textContent = '↻ Update overview';
      content.setAttribute('aria-busy', 'false');
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
      setFeedback(accounts.some(account => account?.status === 'active') ? 'Instagram connected.' : 'Connection status updated.', accounts.some(account => account?.status === 'active') ? 'success' : '');
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
      if (sessionToken) connectBtn.disabled = false;
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
