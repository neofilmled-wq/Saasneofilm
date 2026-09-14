import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * SSRF guard: refuse an outbound URL that points at an internal / private
 * address, so a user-supplied URL can't make the server knock on internal
 * services. DNS is resolved and every resolved IP checked (anti DNS-rebinding).
 * (audit M6)
 */

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, ''); // unwrap IPv4-mapped IPv6
  if (v.includes(':')) {
    // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10)
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  return (
    /^127\./.test(v) ||           // loopback
    /^10\./.test(v) ||            // private A
    /^192\.168\./.test(v) ||      // private C
    /^169\.254\./.test(v) ||      // link-local / cloud metadata
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(v) || // private B
    /^0\./.test(v) ||             // "this host"
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(v) // CGNAT 100.64/10 (Tailscale)
  );
}

/**
 * Throws if the URL is not a public http(s) target. Call it right before a
 * server-side fetch of a user-controlled URL.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http(s) is allowed');
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new Error('internal host blocked');
  }

  let ips: string[];
  if (isIP(host)) {
    ips = [host];
  } else {
    const resolved = await lookup(host, { all: true });
    ips = resolved.map((r) => r.address);
    if (ips.length === 0) throw new Error('host does not resolve');
  }
  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error('URL resolves to a private/internal address');
    }
  }
}
