// The browser must only ever see a public, keyless RPC. Provider URLs carry keys in the userinfo, the query
// or a long opaque path segment (infura /v3/<key>, alchemy /v2/<key>, …); treat all three as keyed.
export function looksKeyed(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password) return true;
  // viem's public signature-lookup URL is a query, not an RPC credential.
  if (u.hostname === '4byte.sourcify.dev' && [...u.searchParams.keys()].every((k) => k === 'q'))
    return false;
  if (u.search) return true;
  // Public documentation/repository slugs are not provider credentials.
  if (
    [
      'github.com',
      'etherscan.io',
      'stockereum.com',
      'vitalik.eth.limo',
      'viem.sh',
      'docs.metamask.io',
    ].includes(u.hostname)
  )
    return false;
  return u.pathname
    .split('/')
    .some(
      (seg) => seg.length >= 20 && /^[A-Za-z0-9_-]+$/.test(seg) && !/^0x[0-9a-fA-F]+$/.test(seg),
    );
}
