import { BlockList, isIPv4, isIPv6 } from 'node:net';

// KI-044: Fastify's `trustProxy` for the Caddy → web → api chain.
//
// Fastify 5 deliberately ignores a bare hop count ("cannot validate the
// immediate peer"), so this returns its function form instead: trust at most
// `hops` addresses, counted from the socket peer, and each only if it is a
// private address (the compose network, loopback). `web` — the peer — is
// trusted; the next address, the rightmost X-Forwarded-For entry Caddy wrote,
// becomes `request.ip`; entries a client forged further left are never read.
// An `api` accidentally reached from a public address keeps its socket
// address as the client, whatever the header says.

const PRIVATE_RANGES = new BlockList();
PRIVATE_RANGES.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_RANGES.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_RANGES.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_RANGES.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_RANGES.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_RANGES.addAddress('::1', 'ipv6');

export function isPrivateAddress(address: string): boolean {
  // A dual-stack socket reports an IPv4 peer as `::ffff:a.b.c.d`.
  const unmapped = address.toLowerCase().startsWith('::ffff:')
    ? address.slice(7)
    : address;
  if (isIPv4(unmapped)) return PRIVATE_RANGES.check(unmapped, 'ipv4');
  if (isIPv6(address)) return PRIVATE_RANGES.check(address, 'ipv6');
  return false;
}

export function createTrustProxy(
  hops: number | undefined,
): false | ((address: string, hop: number) => boolean) {
  if (!hops) return false;
  return (address, hop) => hop < hops && isPrivateAddress(address);
}
