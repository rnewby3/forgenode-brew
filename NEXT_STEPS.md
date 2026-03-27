# forgenode-brew — Next Steps

## 1. brew.link Integration (Fellow Auth)

Currently brew.link generation is broken — the third-party Cloud Run service we were using is unreliable. The fix is to go direct to Fellow's API using the user's own credentials (same approach as aidenator.coffee).

### How it works
- Fellow's Aiden app talks to an AWS API: `https://l8qtmnc692.execute-api.us-west-2.amazonaws.com/v1`
- Auth is email/password → Bearer token (30-min TTL, refreshable)
- Creating a profile + sharing it generates a `https://brew.link/p/XXXX` URL

### Implementation plan

**Frontend (index.html)**
- Add a "Fellow Account" panel (collapsed by default) with email/password inputs
- On connect: POST credentials to a new `/api/auth` edge function → get back accessToken + refreshToken
- Store both tokens in localStorage with expiry timestamp
- Show connected state ("Connected as user@email.com") with a disconnect option
- On each brew generation, read token from localStorage and include it in the POST to `/api/brew`

**Backend (api/brew.js)**
- Add token refresh logic: if token is expired, use refreshToken to get a new one before the Fellow API call
- After Claude generates the profile JSON, POST it to Fellow API:
  1. `GET /devices` → get deviceId
  2. `POST /devices/{deviceId}/profiles` → create profile, get profileId
  3. `GET /profiles/{profileId}/share` (or equivalent) → get brew.link URL
- Return brewLink in the existing response shape (no frontend changes needed beyond token passing)

**New file: api/auth.js**
- Edge function that accepts `{email, password}`, calls `POST /v1/auth/login`, returns tokens
- Never logs or stores credentials — just proxies to Fellow API

### Key API details
- Base URL: `https://l8qtmnc692.execute-api.us-west-2.amazonaws.com/v1`
- Login: `POST /auth/login` → `{accessToken, refreshToken}`
- Devices: `GET /devices` (Bearer token required)
- Create profile: `POST /devices/{id}/profiles` (Bearer token required)
- Share endpoint: TBD — need to verify exact path (check `9b/fellow-aiden` Python lib's `generate_share_link` method for reference)

### Reference
- Python library with full API coverage: https://github.com/9b/fellow-aiden
- Userscript showing auth + profile push flow: https://greasyfork.org/en/scripts/524547-brew-link-to-aiden/code

---

## 2. Tasting Notes Accuracy

Claude is currently hallucinating tasting notes instead of faithfully reading them from the product page. The web_search tool is being used but the extracted data doesn't match what's on the page.

### Fix options
- **Tighten the prompt**: Explicitly instruct Claude to quote tasting notes verbatim from the page, and to flag if it could not retrieve the page rather than guess
- **Validate the web search result**: Check whether Claude actually performed a search (look for `tool_use` blocks in the response) vs. just generating from the coffee name/origin
- **Two-step approach**: Separate the "extract from page" and "generate brew profile" into two distinct Claude calls so extraction can be verified before profile generation
