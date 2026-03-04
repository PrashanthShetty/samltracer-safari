// SAML Tracer - Background Service Worker
// Intercepts HTTP requests and detects SAML messages

let samlRequests = [];
let requestId = 0;

// Listen for form POST requests that may contain SAML
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === "POST" && details.requestBody) {
      const formData = details.requestBody.formData;
      if (formData) {
        let samlData = null;
        let samlType = null;

        if (formData.SAMLRequest) {
          samlData = formData.SAMLRequest[0];
          samlType = "SAMLRequest";
        } else if (formData.SAMLResponse) {
          samlData = formData.SAMLResponse[0];
          samlType = "SAMLResponse";
        }

        if (samlData) {
          const entry = {
            id: ++requestId,
            timestamp: new Date().toISOString(),
            url: details.url,
            type: samlType,
            raw: samlData,
            relayState: formData.RelayState ? formData.RelayState[0] : null,
            tabId: details.tabId
          };

          // Try to decode and parse the SAML
          try {
            entry.decoded = decodeSAML(samlData, samlType);
            entry.parsed = parseSAMLXML(entry.decoded);
          } catch (e) {
            entry.error = e.message;
            entry.decoded = samlData;
          }

          samlRequests.unshift(entry); // newest first

          // Keep only last 100 entries
          if (samlRequests.length > 100) {
            samlRequests = samlRequests.slice(0, 100);
          }

          // Store in session storage
          chrome.storage.session.set({ samlRequests });

          // Notify popup if open
          chrome.runtime.sendMessage({
            action: "newSAML",
            entry
          }).catch(() => {}); // popup may not be open
        }
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

function decodeSAML(data, type) {
  // SAML data is Base64 encoded, and for Requests it may also be deflate compressed
  try {
    // URL decode first
    const urlDecoded = decodeURIComponent(data);
    // Base64 decode
    const binary = atob(urlDecoded.replace(/ /g, '+'));
    return binary;
  } catch (e1) {
    try {
      // Try direct base64
      const binary = atob(data.replace(/ /g, '+'));
      return binary;
    } catch (e2) {
      return data;
    }
  }
}

function parseSAMLXML(xmlString) {
  // Parse key fields from raw XML string (no DOM parser in service worker)
  const result = {
    messageType: null,
    issuer: null,
    destination: null,
    id: null,
    issueInstant: null,
    status: null,
    nameID: null,
    sessionIndex: null,
    attributes: [],
    conditions: {},
    authnContext: null,
    raw: xmlString
  };

  // Detect message type
  if (xmlString.includes('samlp:Response') || xmlString.includes('saml2p:Response')) {
    result.messageType = 'Response';
  } else if (xmlString.includes('samlp:AuthnRequest') || xmlString.includes('saml2p:AuthnRequest')) {
    result.messageType = 'AuthnRequest';
  } else if (xmlString.includes('samlp:LogoutRequest') || xmlString.includes('saml2p:LogoutRequest')) {
    result.messageType = 'LogoutRequest';
  } else if (xmlString.includes('samlp:LogoutResponse') || xmlString.includes('saml2p:LogoutResponse')) {
    result.messageType = 'LogoutResponse';
  }

  // Extract Issuer
  const issuerMatch = xmlString.match(/<(?:saml:|saml2:)?Issuer[^>]*>([^<]+)<\/(?:saml:|saml2:)?Issuer>/);
  if (issuerMatch) result.issuer = issuerMatch[1].trim();

  // Extract ID attribute
  const idMatch = xmlString.match(/\sID="([^"]+)"/);
  if (idMatch) result.id = idMatch[1];

  // Extract Destination
  const destMatch = xmlString.match(/\sDestination="([^"]+)"/);
  if (destMatch) result.destination = destMatch[1];

  // Extract IssueInstant
  const issueMatch = xmlString.match(/\sIssueInstant="([^"]+)"/);
  if (issueMatch) result.issueInstant = issueMatch[1];

  // Extract Status
  const statusMatch = xmlString.match(/StatusCode\s+Value="([^"]+)"/);
  if (statusMatch) {
    const statusCode = statusMatch[1];
    result.status = {
      code: statusCode,
      label: statusCode.split(':').pop(),
      success: statusCode.includes('Success')
    };
  }

  // Extract NameID
  const nameIDMatch = xmlString.match(/<(?:saml:|saml2:)?NameID[^>]*>([^<]+)<\/(?:saml:|saml2:)?NameID>/);
  if (nameIDMatch) result.nameID = nameIDMatch[1].trim();

  // Extract NameID Format
  const nameIDFormatMatch = xmlString.match(/<(?:saml:|saml2:)?NameID[^>]*Format="([^"]+)"/);
  if (nameIDFormatMatch) result.nameIDFormat = nameIDFormatMatch[1];

  // Extract SessionIndex
  const sessionMatch = xmlString.match(/SessionIndex="([^"]+)"/);
  if (sessionMatch) result.sessionIndex = sessionMatch[1];

  // Extract Attributes
  const attrRegex = /<(?:saml:|saml2:)?Attribute\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:saml:|saml2:)?Attribute>/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(xmlString)) !== null) {
    const attrName = attrMatch[1];
    const attrContent = attrMatch[2];
    const valueRegex = /<(?:saml:|saml2:)?AttributeValue[^>]*>([^<]+)<\/(?:saml:|saml2:)?AttributeValue>/g;
    const values = [];
    let valueMatch;
    while ((valueMatch = valueRegex.exec(attrContent)) !== null) {
      values.push(valueMatch[1].trim());
    }
    if (values.length > 0) {
      result.attributes.push({ name: attrName, values });
    }
  }

  // Extract Conditions
  const notBeforeMatch = xmlString.match(/NotBefore="([^"]+)"/);
  const notOnOrAfterMatch = xmlString.match(/NotOnOrAfter="([^"]+)"/);
  if (notBeforeMatch) result.conditions.notBefore = notBeforeMatch[1];
  if (notOnOrAfterMatch) result.conditions.notOnOrAfter = notOnOrAfterMatch[1];

  // Extract Audience
  const audienceMatch = xmlString.match(/<(?:saml:|saml2:)?Audience>([^<]+)<\/(?:saml:|saml2:)?Audience>/);
  if (audienceMatch) result.conditions.audience = audienceMatch[1].trim();

  // Extract AuthnContext
  const authnMatch = xmlString.match(/<(?:saml:|saml2:)?AuthnContextClassRef>([^<]+)<\/(?:saml:|saml2:)?AuthnContextClassRef>/);
  if (authnMatch) result.authnContext = authnMatch[1].trim().split('/').pop();

  return result;
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSAMLRequests") {
    sendResponse({ requests: samlRequests });
  } else if (message.action === "clearSAMLRequests") {
    samlRequests = [];
    requestId = 0;
    chrome.storage.session.set({ samlRequests: [] });
    sendResponse({ success: true });
  }
  return true;
});

// Restore from session storage on startup
chrome.storage.session.get("samlRequests", (result) => {
  if (result.samlRequests) {
    samlRequests = result.samlRequests;
    requestId = samlRequests.length > 0 ? samlRequests[0].id : 0;
  }
});
