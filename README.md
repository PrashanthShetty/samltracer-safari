# SAML Tracer – Safari Browser Extension

A developer tool for tracing, parsing, and inspecting SAML 2.0 requests and responses in real-time.

---

## Features

- 🔍 **Auto-detects** SAML Requests and Responses in form POSTs, XHR, and Fetch
- 📋 **Parses** Assertions, NameID, Issuer, Destination, Status, Conditions
- 🏷️ **Extracts Claims** (Attribute Statements) with all values
- 🔐 **Raw XML viewer** with syntax highlighting
- 📋 **Copy** claims as JSON or raw Base64/XML
- ✅ **Status indicators** for success/failure responses
- ⏱️ **Session history** – captures last 100 SAML messages

---

## Installation (Safari on macOS)

Safari extensions must be packaged as a macOS app using Xcode.

### Prerequisites
- macOS 13+ (Ventura or later)
- Xcode 15+
- Apple Developer account (free works for local use)

### Steps

#### 1. Create the Xcode project

1. Open **Xcode**
2. File → New → Project
3. Choose **macOS** → **Safari Extension App**
4. Name it `SAMLTracer`
5. Bundle ID: `com.yourname.samltracer`
6. Language: **Swift**, uncheck "Include SwiftUI"

#### 2. Replace the extension resources

Replace the contents of `SAMLTracer Extension/Resources/` with the files in this folder:

```
SAMLTracer Extension/Resources/
├── manifest.json
├── background.js
├── content.js
├── popup.html
└── popup.js
```

#### 3. Configure the extension target

In Xcode, select the `SAMLTracer Extension` target:

- **General** → Deployment Target: macOS 13.0
- **Signing & Capabilities** → Team: your Apple ID

In `Info.plist` of the extension target, ensure:
```xml
<key>SFSafariWebExtensionToolbarItem</key>
<dict>
    <key>Label</key>
    <string>SAML Tracer</string>
    <key>Image</key>
    <string>ToolbarItemIcon</string>
</dict>
```

#### 4. Build and run

1. Select **My Mac** as target device
2. Press `Cmd+R` to build and run
3. The macOS app opens — click **"Enable in Safari"**
4. Safari → Settings → Extensions → Enable **SAML Tracer**

#### 5. Grant permissions

When first using the extension:
- Click the SAML Tracer icon in Safari toolbar
- Safari will ask for permission to access websites
- Click **"Always Allow on Every Website"**

---

## Usage

1. Click the **SAML Tracer** icon in the Safari toolbar
2. Navigate to any website that uses SAML SSO (e.g., Okta, Azure AD, Salesforce)
3. Perform a login — SAML messages appear in the left panel
4. Click any message to inspect:
   - **Overview** – Message metadata, issuer, NameID, status, conditions
   - **Claims** – All SAML Attribute claims with values (copy as JSON)
   - **Raw XML** – Decoded, formatted XML (copy XML or original Base64)

---

## How it works

| Component | Role |
|-----------|------|
| `background.js` | Service worker that intercepts `webRequest` POSTs containing `SAMLRequest` or `SAMLResponse` form parameters |
| `content.js` | Overrides `XMLHttpRequest.send` and `fetch` to catch SAML in JS-initiated requests |
| `popup.html/js` | The UI – renders captured messages, parses XML, displays claims |

SAML data is Base64-decoded, XML-parsed using regex pattern matching (no external dependencies), and stored in `chrome.storage.session` for the current browser session.

---

## Supported SAML Message Types

- `AuthnRequest` (SP → IdP login request)
- `Response` (IdP → SP assertion)
- `LogoutRequest`
- `LogoutResponse`

---

## Parsed Fields

| Field | Description |
|-------|-------------|
| Message ID | Unique SAML message identifier |
| Issuer | Entity that issued the message |
| Destination | Target endpoint URL |
| IssueInstant | Timestamp of issuance |
| NameID | Subject identifier (user identity) |
| NameID Format | Format of the NameID |
| SessionIndex | IdP session reference |
| Status | Success or failure with status code |
| Conditions | NotBefore, NotOnOrAfter, Audience |
| AuthnContext | Authentication method used |
| Attributes | All SAML claims with values |

---

## Development Notes

- The extension uses **Manifest V3** (required for Safari 16+)
- No external libraries or CDNs — fully self-contained
- XML parsing uses regex (no DOM parser available in MV3 service workers)
- Compatible with both compressed (deflate) and uncompressed SAML

---

## Troubleshooting

**No SAML captured?**
- Ensure the extension has permission for the website
- Check Safari → Settings → Extensions → SAML Tracer → Permissions
- Some IdPs use redirect binding (GET) rather than POST — future version will support URL parameter parsing

**Extension not showing in toolbar?**
- Safari → View → Show Tab Bar
- Right-click toolbar → Customize Toolbar → drag SAML Tracer icon in

**Build errors in Xcode?**
- Clean build: `Shift+Cmd+K`
- Make sure Signing & Capabilities has a valid team selected
