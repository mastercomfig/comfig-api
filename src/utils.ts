export function authenticate(request: Request, key: string) {
  const auth = request.headers.get("Authorization") || "";

  // If not authenticated, it's an automatic rejection. The user already knows it is an authenticated resource.
  if (!auth) {
    return false;
  }

  // If there is no key, it cannot be authenticated.
  if (!key) {
    return false;
  }

  let realBearer = `Bearer ${key}`;
  // If the auth and bearer token are not equal length, encode the user's auth as the key so they always get back a result with an encoding time which matches their key.
  let falseSet = false;
  if (auth.length !== realBearer.length) {
    realBearer = auth;
    falseSet = true;
  }

  const encoder = new TextEncoder();

  // a and b must be equal length, or else the encoding time can be used as an attack vector.
  const a = encoder.encode(auth);
  const b = encoder.encode(realBearer);

  // timingSafeEqual will error out if byte lengths are not equal, so let's fake a comparison.
  if (a.byteLength !== b.byteLength) {
    falseSet = true;
    // We use their key to give no information about our key.
    let x = 0;
    realBearer = auth;
    for (let i = 0; i < auth.length; i++) {
      x |= auth.charCodeAt(i) ^ realBearer.charCodeAt(i);
    }
    if (x === 0) {
      return false;
    }
  }

  if (!crypto.subtle.timingSafeEqual(a, b)) {
    return false;
  }

  if (falseSet) {
    return false;
  }

  return true;
}

const allowedFetchSites = new Set(["same-origin", "same-site"]);
const allowedCrossOrigins = new Set([
  "http://localhost:4321",
  "https://staging.mastercomfig-site.pages.dev",
]);
const allowedFetchModes = new Set(["cors", "no-cors", "same-origin"]);
const disallowedFetchDests = new Set(["frame", "iframe", "embed", "object"]);

export function validate(request: Request) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  const fetchMode = request.headers.get("Sec-Fetch-Mode");
  const fetchDest = request.headers.get("Sec-Fetch-Dest");

  if (!fetchSite) {
    return true;
  }

  if (!fetchMode) {
    return true;
  }

  if (!fetchDest) {
    return true;
  }

  if (fetchSite === "cross-site") {
    const origin = request.headers.get("Origin");
    if (!allowedCrossOrigins.has(origin)) {
      return false;
    }
  } else {
    if (!allowedFetchSites.has(fetchSite)) {
      return false;
    }
  }

  if (!allowedFetchModes.has(fetchMode)) {
    return false;
  }

  if (disallowedFetchDests.has(fetchDest)) {
    return false;
  }

  return true;
}
