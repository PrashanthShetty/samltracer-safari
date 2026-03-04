// SAML Tracer - Popup UI Logic

let allRequests = [];
let selectedId = null;
let activeTab = 'overview';

// DOM refs
const requestList = document.getElementById('requestList');
const sidebarEmpty = document.getElementById('sidebarEmpty');
const countBadge = document.getElementById('countBadge');
const tabsBar = document.getElementById('tabsBar');
const noSelection = document.getElementById('noSelection');
const detailContent = document.getElementById('detailContent');

// Load existing requests
chrome.runtime.sendMessage({ action: 'getSAMLRequests' }, (res) => {
  if (res && res.requests) {
    allRequests = res.requests;
    renderSidebar();
    if (allRequests.length > 0) {
      selectRequest(allRequests[0].id);
    }
  }
});

// Listen for new SAML messages
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'newSAML') {
    allRequests.unshift(msg.entry);
    renderSidebar();
    if (!selectedId) {
      selectRequest(msg.entry.id);
    }
    // Flash new item
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${msg.entry.id}"]`);
      if (el) el.classList.add('new');
    }, 50);
  }
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearSAMLRequests' }, () => {
    allRequests = [];
    selectedId = null;
    renderSidebar();
    showNoSelection();
  });
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
}

function renderSidebar() {
  const count = allRequests.length;
  countBadge.textContent = `${count} captured`;
  countBadge.classList.toggle('has-items', count > 0);

  if (count === 0) {
    sidebarEmpty.style.display = '';
    requestList.innerHTML = '';
    requestList.appendChild(sidebarEmpty);
    return;
  }

  sidebarEmpty.style.display = 'none';
  
  // Remove old items (keep sidebarEmpty node)
  Array.from(requestList.children).forEach(c => {
    if (c !== sidebarEmpty) c.remove();
  });

  allRequests.forEach(req => {
    const item = document.createElement('div');
    const typeClass = getTypeClass(req.type, req.parsed);
    const statusClass = getStatusClass(req);

    item.className = `request-item ${typeClass}`;
    item.dataset.id = req.id;
    if (req.id === selectedId) item.classList.add('active');

    const shortUrl = new URL(req.url).hostname || req.url;
    const timeStr = new Date(req.timestamp).toLocaleTimeString();
    const label = getLabel(req);

    item.innerHTML = `
      <div class="req-type ${typeClass}">${label}</div>
      <div class="req-url">${escapeHtml(shortUrl)}</div>
      <div class="req-time">
        <span class="req-status ${statusClass}"></span>
        ${timeStr}
      </div>
    `;

    item.addEventListener('click', () => selectRequest(req.id));
    requestList.appendChild(item);
  });
}

function getLabel(req) {
  if (!req.parsed) return req.type;
  const t = req.parsed.messageType;
  if (!t) return req.type;
  return t;
}

function getTypeClass(type, parsed) {
  const mt = parsed && parsed.messageType;
  if (type === 'SAMLRequest' || mt === 'AuthnRequest') return 'type-request saml-request';
  if (type === 'SAMLResponse') return 'type-response saml-response';
  if (mt && mt.includes('Logout')) return 'saml-logout';
  return 'type-request';
}

function getStatusClass(req) {
  if (!req.parsed || !req.parsed.status) return 'unknown';
  return req.parsed.status.success ? 'success' : 'failure';
}

function selectRequest(id) {
  selectedId = id;
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  // Update sidebar selection
  document.querySelectorAll('.request-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  tabsBar.style.display = 'flex';
  noSelection.style.display = 'none';

  renderOverview(req);
  renderClaims(req);
  renderXML(req);
  switchTab(activeTab);
}

function showNoSelection() {
  tabsBar.style.display = 'none';
  noSelection.style.display = '';
}

function renderOverview(req) {
  const p = req.parsed;
  const el = document.getElementById('overviewContent');

  if (!p) {
    el.innerHTML = `<div class="info-section"><p style="color:var(--text3);font-size:12px">Could not parse SAML data.</p></div>`;
    return;
  }

  let statusHtml = '';
  if (p.status) {
    const cls = p.status.success ? 'success' : 'failure';
    statusHtml = `<span class="status-badge ${cls}">
      ${p.status.success ? '✓' : '✗'} ${escapeHtml(p.status.label || p.status.code)}
    </span>`;
  }

  el.innerHTML = `
    <div class="info-section">
      <div class="info-section-title">Message Info</div>
      <div class="info-rows">
        ${p.messageType ? infoRow('Type', p.messageType) : ''}
        ${p.id ? infoRow('Message ID', p.id, 'code') : ''}
        ${p.issueInstant ? infoRow('Issued At', formatDate(p.issueInstant)) : ''}
        ${req.type ? infoRow('SAML Param', req.type) : ''}
      </div>
    </div>

    <div class="info-section">
      <div class="info-section-title">Endpoints</div>
      <div class="info-rows">
        ${infoRow('URL', req.url, 'url')}
        ${p.destination ? infoRow('Destination', p.destination, 'url') : ''}
      </div>
    </div>

    <div class="info-section">
      <div class="info-section-title">Identity</div>
      <div class="info-rows">
        ${p.issuer ? infoRow('Issuer', p.issuer, 'issuer') : ''}
        ${p.nameID ? infoRow('NameID', p.nameID, 'nameid') : ''}
        ${p.nameIDFormat ? infoRow('NameID Format', p.nameIDFormat.split(':').pop()) : ''}
        ${p.sessionIndex ? infoRow('Session Index', p.sessionIndex, 'code') : ''}
      </div>
    </div>

    ${p.status ? `
    <div class="info-section">
      <div class="info-section-title">Status</div>
      <div class="info-rows">
        <div class="info-row">
          <span class="info-label">Status</span>
          <span>${statusHtml}</span>
        </div>
        ${infoRow('Status Code', p.status.code)}
      </div>
    </div>` : ''}

    ${(p.conditions.notBefore || p.conditions.notOnOrAfter || p.conditions.audience) ? `
    <div class="info-section">
      <div class="info-section-title">Conditions</div>
      <div class="info-rows">
        ${p.conditions.notBefore ? infoRow('Not Before', formatDate(p.conditions.notBefore)) : ''}
        ${p.conditions.notOnOrAfter ? infoRow('Not On Or After', formatDate(p.conditions.notOnOrAfter)) : ''}
        ${p.conditions.audience ? infoRow('Audience', p.conditions.audience, 'url') : ''}
      </div>
    </div>` : ''}

    ${p.authnContext ? `
    <div class="info-section">
      <div class="info-section-title">Authentication</div>
      <div class="info-rows">
        ${infoRow('Authn Context', p.authnContext)}
      </div>
    </div>` : ''}

    ${req.relayState ? `
    <div class="info-section">
      <div class="info-section-title">Relay State</div>
      <div class="info-rows">
        ${infoRow('RelayState', req.relayState, 'code')}
      </div>
    </div>` : ''}
  `;
}

function renderClaims(req) {
  const el = document.getElementById('claimsContent');
  const p = req.parsed;

  if (!p || p.attributes.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="height:auto;padding:40px 20px">
        <div class="empty-icon">🏷️</div>
        <div class="empty-title">No Claims Found</div>
        <div class="empty-desc">
          ${p && p.messageType !== 'Response' 
            ? 'Claims are only present in SAML Responses (Assertions)'
            : 'This message contains no SAML Attribute claims'}
        </div>
      </div>
    `;
    return;
  }

  const cards = p.attributes.map(attr => `
    <div class="claim-card">
      <div class="claim-header">
        <span class="claim-name">${escapeHtml(attr.name)}</span>
        <span class="claim-count">${attr.values.length} value${attr.values.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="claim-values">
        ${attr.values.map(v => `<div class="claim-value">${escapeHtml(v)}</div>`).join('')}
      </div>
    </div>
  `).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:0.05em;text-transform:uppercase">
        ${p.attributes.length} Claim${p.attributes.length !== 1 ? 's' : ''} found
      </span>
      <button class="btn" id="copyClaimsBtn">Copy JSON</button>
    </div>
    <div class="claims-grid">${cards}</div>
  `;

  document.getElementById('copyClaimsBtn').addEventListener('click', () => {
    const json = JSON.stringify(
      p.attributes.reduce((acc, a) => ({ ...acc, [a.name]: a.values.length === 1 ? a.values[0] : a.values }), {}),
      null, 2
    );
    navigator.clipboard.writeText(json);
    document.getElementById('copyClaimsBtn').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('copyClaimsBtn').textContent = 'Copy JSON'; }, 1500);
  });
}

function renderXML(req) {
  const el = document.getElementById('xmlContent');
  const rawXml = req.decoded || req.raw;

  // Pretty-print XML
  let pretty = rawXml;
  try {
    pretty = formatXML(rawXml);
  } catch(e) {}

  el.innerHTML = `
    <div class="xml-container">
      <div class="xml-toolbar">
        <button class="btn" id="copyXmlBtn">Copy XML</button>
        <button class="btn" id="copyB64Btn">Copy Base64</button>
      </div>
      <div class="xml-content" id="xmlPre">${syntaxHighlightXML(pretty)}</div>
    </div>
  `;

  document.getElementById('copyXmlBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(pretty);
    document.getElementById('copyXmlBtn').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('copyXmlBtn').textContent = 'Copy XML'; }, 1500);
  });

  document.getElementById('copyB64Btn').addEventListener('click', () => {
    navigator.clipboard.writeText(req.raw);
    document.getElementById('copyB64Btn').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('copyB64Btn').textContent = 'Copy Base64'; }, 1500);
  });
}

// Helpers
function infoRow(label, value, cls = '') {
  return `
    <div class="info-row">
      <span class="info-label">${escapeHtml(label)}</span>
      <span class="info-value ${cls}">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch(e) { return iso; }
}

function formatXML(xml) {
  let formatted = '';
  let indent = 0;
  const tab = '  ';
  xml.replace(/(>)(<)(\/*)/g, '$1\n$2$3').split('\n').forEach(node => {
    if (node.match(/.+<\/\w[^>]*>$/)) {
      formatted += tab.repeat(indent) + node + '\n';
    } else if (node.match(/^<\/\w/)) {
      if (indent > 0) indent--;
      formatted += tab.repeat(indent) + node + '\n';
    } else if (node.match(/^<\w([^>]*[^\/])?>.*$/)) {
      formatted += tab.repeat(indent) + node + '\n';
      if (!node.match(/\/>/)) indent++;
    } else {
      formatted += tab.repeat(indent) + node + '\n';
    }
  });
  return formatted.trim();
}

function syntaxHighlightXML(xml) {
  return escapeHtml(xml)
    .replace(/&lt;(\/?[\w:.-]+)/g, '<span class="tag">&lt;$1</span>')
    .replace(/&gt;/g, '<span class="tag">&gt;</span>')
    .replace(/([\w:.-]+)=&quot;([^&]*)&quot;/g, 
      '<span class="attr-name">$1</span>=<span class="attr-value">&quot;$2&quot;</span>');
}
