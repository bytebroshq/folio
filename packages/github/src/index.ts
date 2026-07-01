/**
 * GitHub OAuth + App integration helpers.
 *
 * These functions are designed to run inside a Cloudflare Worker.
 * Callers pass the necessary secrets and tokens explicitly.
 */

type GitHubTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

type GitHubUser = {
  id: number;
  login: string;
};

type GitHubInstallationRepos = {
  repositories: { full_name: string; private: boolean }[];
};

/**
 * Exchange an OAuth authorization code for an access token.
 */
export async function exchangeOAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GitHubTokenResponse> {
  const resp = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    },
  );
  return resp.json<GitHubTokenResponse>();
}

/**
 * Fetch the authenticated GitHub user.
 */
export async function fetchUser(accessToken: string): Promise<GitHubUser> {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return resp.json<GitHubUser>();
}

/**
 * List the user's GitHub App installations.
 * GET /user/installations requires a user-to-server token scoped for the app.
 */
export async function fetchInstallations(
  accessToken: string,
): Promise<{ id: number; account: { id: number; login: string } }[]> {
  const resp = await fetch("https://api.github.com/user/installations", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json<{ installations: unknown[] }>();
  return (data.installations || []) as { id: number; account: { id: number; login: string } }[];
}

/**
 * List repositories accessible to a given installation.
 */
export async function fetchInstallationRepos(
  installationId: number,
  appId: string,
  privateKey: string,
): Promise<string[]> {
  const token = await mintInstallationToken(installationId, appId, privateKey);
  const resp = await fetch(
    `https://api.github.com/installation/repositories`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await resp.json<GitHubInstallationRepos>();
  return (data.repositories || []).map((r) => r.full_name);
}

/**
 * Check whether an installation can reach a specific repo.
 * Returns the installation id if access is granted, null otherwise.
 */
export async function checkRepoAccess(
  owner: string,
  repo: string,
  installationId: number,
  appId: string,
  privateKey: string,
): Promise<boolean> {
  const token = await mintInstallationToken(installationId, appId, privateKey);
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.ok;
}

/**
 * Mint an installation access token for the GitHub App.
 * Uses the app private key to authenticate as the GitHub App.
 */
export async function mintInstallationToken(
  installationId: number,
  appId: string,
  privateKey: string,
): Promise<string> {
  const jwt = await signAppJwt(appId, privateKey);
  const resp = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  const data = await resp.json<{ token: string }>();
  return data.token;
}

/**
 * Sign a short-lived JWT to authenticate as a GitHub App.
 * Uses RS256 with the app's private key.
 */
async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  // In Cloudflare Workers, we need Web Crypto API for RSA signing.
  // The private key is a PEM string stored in Cloudflare Secrets.
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };

  // The jwt payload needs iat (issued at), exp (10 min max) and iss (app id)
  const payload = {
    iat: now - 60, // 1 min leeway for clock drift
    exp: now + 600, // 10 min max for GitHub
    iss: appId,
  };

  const encoder = new TextEncoder();

  // Import the PEM key
  const pemHeader = "-----BEGIN RSA PRIVATE KEY-----";
  const pemFooter = "-----END RSA PRIVATE KEY-----";
  const pemContent = privateKeyPem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as any,
    false,
    ["sign"],
  ) as CryptoKey;

  // Encode header + payload
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const message = `${b64(header)}.${b64(payload)}`;

  // Sign
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" } as any,
    key,
    encoder.encode(message),
  );

  const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${message}.${b64sig}`;
}
