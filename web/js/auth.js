// Microsoft sign-in for a single-page app: authorization code flow with PKCE.
// No client secret and no third-party library; tokens live in sessionStorage for this tab only.
const CFG = window.MINUTEMATE_CONFIG || {};
const SCOPES = "openid profile offline_access User.Read User.ReadBasic.All Calendars.Read Sites.ReadWrite.All";
export const REDIRECT = CFG.redirectUri || location.origin + location.pathname;
const AUTHORITY = `https://login.microsoftonline.com/${CFG.tenantId || "organizations"}/oauth2/v2.0`;

const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }
};

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (n = 64) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); };

export async function signIn() {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(24);
  store.set("mm_pkce", JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    client_id: CFG.clientId, response_type: "code", redirect_uri: REDIRECT, response_mode: "query",
    scope: SCOPES, code_challenge: challenge, code_challenge_method: "S256", state, prompt: "select_account"
  });
  location.assign(`${AUTHORITY}/authorize?${q}`);
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CFG.clientId, scope: SCOPES, ...params })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Sign-in failed");
  const prev = JSON.parse(store.get("mm_token") || "{}");
  store.set("mm_token", JSON.stringify({
    access: data.access_token, refresh: data.refresh_token || prev.refresh, exp: Date.now() + (data.expires_in - 60) * 1000
  }));
}

export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (q.get("error")) throw new Error(q.get("error_description") || q.get("error"));
  if (!q.get("code")) return;
  const saved = JSON.parse(store.get("mm_pkce") || "{}");
  store.del("mm_pkce");
  history.replaceState(null, "", location.pathname);
  if (!saved.state || saved.state !== q.get("state")) throw new Error("Sign-in state didn't match. Please try again.");
  await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT, code_verifier: saved.verifier });
}

export async function accessToken() {
  const t = JSON.parse(store.get("mm_token") || "null");
  if (!t) return null;
  if (Date.now() < t.exp) return t.access;
  if (!t.refresh) return null;
  try { await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh }); }
  catch { store.del("mm_token"); return null; }
  return JSON.parse(store.get("mm_token")).access;
}

export function signOut() {
  store.del("mm_token");
  location.assign(`${AUTHORITY}/logout?post_logout_redirect_uri=${encodeURIComponent(REDIRECT)}`);
}
