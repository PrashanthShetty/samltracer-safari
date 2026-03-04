// SAML Tracer - Content Script
// Intercepts form submissions to capture SAML data before it's sent

(function() {
  'use strict';

  // Override XMLHttpRequest to catch SAML in XHR posts
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._method === 'POST' && body && typeof body === 'string') {
      if (body.includes('SAMLRequest=') || body.includes('SAMLResponse=')) {
        const params = new URLSearchParams(body);
        const samlData = params.get('SAMLRequest') || params.get('SAMLResponse');
        const samlType = params.get('SAMLRequest') ? 'SAMLRequest' : 'SAMLResponse';

        if (samlData) {
          chrome.runtime.sendMessage({
            action: 'xhrSAML',
            samlType,
            samlData,
            relayState: params.get('RelayState'),
            url: this._url
          }).catch(() => {});
        }
      }
    }
    return originalXHRSend.apply(this, arguments);
  };

  // Also intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (init && init.method === 'POST' && init.body) {
      const body = init.body;
      let bodyStr = typeof body === 'string' ? body : null;

      if (bodyStr && (bodyStr.includes('SAMLRequest=') || bodyStr.includes('SAMLResponse='))) {
        const params = new URLSearchParams(bodyStr);
        const samlData = params.get('SAMLRequest') || params.get('SAMLResponse');
        const samlType = params.get('SAMLRequest') ? 'SAMLRequest' : 'SAMLResponse';

        if (samlData) {
          chrome.runtime.sendMessage({
            action: 'xhrSAML',
            samlType,
            samlData,
            relayState: params.get('RelayState'),
            url: typeof input === 'string' ? input : input.url
          }).catch(() => {});
        }
      }
    }
    return originalFetch.apply(this, arguments);
  };
})();
