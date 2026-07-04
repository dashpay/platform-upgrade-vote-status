// Minimal gRPC-Web (application/grpc-web+proto) client for the unproved DAPI
// calls the dashboard needs: Platform.getCurrentQuorumsInfo and Platform.getStatus.
//
// Hand-rolled to avoid pulling the full @dashevo/dapi-grpc dependency tree into
// a static site. Field numbers mirror packages/dapi-grpc/protos/platform/v0/platform.proto.

import type { CurrentQuorumsInfo, MasternodeEntry, Network, ValidatorMember, ValidatorSet } from '../types';

// Evonodes serve gRPC-Web over HTTPS with IP-SAN certificates on the platform
// port (443 on mainnet, 1443 on testnet) — the same endpoints the WASM SDK uses.
function dapiEndpoints(network: Network, masternodes: MasternodeEntry[]): string[] {
  const port = network === 'mainnet' ? '' : ':1443';
  return masternodes
    .filter((m) => m.status === 'ENABLED' && m.versionCheck === 'success')
    .map((m) => `https://${m.address.replace(/:\d+$/, '')}${port}`);
}

// --- protobuf reader -------------------------------------------------------

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  get eof(): boolean {
    return this.pos >= this.buf.length;
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = this.buf[this.pos++];
      if (b === undefined) throw new Error('varint past end of buffer');
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
    }
  }

  tag(): { field: number; wire: number } {
    const t = Number(this.varint());
    return { field: t >>> 3, wire: t & 7 };
  }

  bytes(): Uint8Array {
    const len = Number(this.varint());
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  skip(wire: number): void {
    switch (wire) {
      case 0:
        this.varint();
        break;
      case 1:
        this.pos += 8;
        break;
      case 2:
        this.bytes();
        break;
      case 5:
        this.pos += 4;
        break;
      default:
        throw new Error(`unsupported wire type ${wire}`);
    }
  }
}

// --- hash display helpers --------------------------------------------------

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Core-style display of a hash (byte order reversed, like txids/proTxHashes). */
export const displayHash = (b: Uint8Array): string => hex(Uint8Array.from(b).reverse());

export const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
};

// --- message parsers -------------------------------------------------------

function parseValidator(buf: Uint8Array): ValidatorMember {
  const r = new Reader(buf);
  let proTxHashBytes = new Uint8Array();
  let nodeIp = '';
  let isBanned = false;
  while (!r.eof) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) proTxHashBytes = Uint8Array.from(r.bytes());
    else if (field === 2 && wire === 2) nodeIp = r.string();
    else if (field === 3 && wire === 0) isBanned = r.varint() !== 0n;
    else r.skip(wire);
  }
  return { proTxHashBytes, proTxHash: displayHash(proTxHashBytes), nodeIp, isBanned };
}

function parseValidatorSet(buf: Uint8Array): ValidatorSet {
  const r = new Reader(buf);
  let quorumHashHex = '';
  let coreHeight = 0;
  const members: ValidatorMember[] = [];
  while (!r.eof) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) quorumHashHex = hex(r.bytes());
    else if (field === 2 && wire === 0) coreHeight = Number(r.varint());
    else if (field === 3 && wire === 2) members.push(parseValidator(r.bytes()));
    else r.skip(wire);
  }
  members.sort((a, b) => compareBytes(a.proTxHashBytes, b.proTxHashBytes));
  return { quorumHashHex, coreHeight, members };
}

function parseResponseV0(buf: Uint8Array): CurrentQuorumsInfo {
  const r = new Reader(buf);
  const quorumHashes: string[] = [];
  let currentQuorumHash = '';
  const validatorSets: ValidatorSet[] = [];
  let lastBlockProposerBytes = new Uint8Array();
  const metadata = {
    height: 0n,
    timeMs: 0n,
    epoch: 0,
    protocolVersion: 0,
    chainId: '',
  };
  while (!r.eof) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) quorumHashes.push(hex(r.bytes()));
    else if (field === 2 && wire === 2) currentQuorumHash = hex(r.bytes());
    else if (field === 3 && wire === 2) validatorSets.push(parseValidatorSet(r.bytes()));
    else if (field === 4 && wire === 2) lastBlockProposerBytes = Uint8Array.from(r.bytes());
    else if (field === 5 && wire === 2) {
      const m = new Reader(r.bytes());
      while (!m.eof) {
        const t = m.tag();
        if (t.field === 1 && t.wire === 0) metadata.height = m.varint();
        else if (t.field === 3 && t.wire === 0) metadata.epoch = Number(m.varint());
        else if (t.field === 4 && t.wire === 0) metadata.timeMs = m.varint();
        else if (t.field === 5 && t.wire === 0) metadata.protocolVersion = Number(m.varint());
        else if (t.field === 6 && t.wire === 2) metadata.chainId = m.string();
        else m.skip(t.wire);
      }
    } else r.skip(wire);
  }
  return {
    quorumHashes,
    currentQuorumHash,
    validatorSets,
    lastBlockProposer: displayHash(lastBlockProposerBytes),
    lastBlockProposerBytes,
    metadata,
  };
}

// --- gRPC-Web transport ----------------------------------------------------

function grpcWebFrames(body: Uint8Array): Uint8Array {
  // Data frames only (flag 0x00); trailer frames (flag 0x80) are ignored.
  const chunks: Uint8Array[] = [];
  let pos = 0;
  while (pos + 5 <= body.length) {
    const flag = body[pos];
    const len =
      (body[pos + 1] << 24) | (body[pos + 2] << 16) | (body[pos + 3] << 8) | body[pos + 4];
    const payload = body.subarray(pos + 5, pos + 5 + len);
    pos += 5 + len;
    if (flag === 0) chunks.push(payload);
  }
  if (chunks.length === 1) return chunks[0];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Call a unary Platform method whose request is `{ v0: {} }` and return the response's v0 bytes. */
async function callUnaryV0(endpoint: string, method: string): Promise<Uint8Array> {
  // Request { v0: {} } → field 1, empty embedded message.
  const request = new Uint8Array([0x0a, 0x00]);
  const framed = new Uint8Array(5 + request.length);
  framed[3] = 0; // 4-byte BE length
  framed[4] = request.length;
  framed.set(request, 5);

  const res = await fetch(`${endpoint}/org.dash.platform.dapi.v0.Platform/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
    },
    body: framed,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  const grpcStatus = res.headers.get('grpc-status');
  if (grpcStatus && grpcStatus !== '0') {
    throw new Error(`${endpoint}: grpc-status ${grpcStatus} ${res.headers.get('grpc-message') ?? ''}`);
  }
  const body = new Uint8Array(await res.arrayBuffer());
  const message = grpcWebFrames(body);

  // Response { v0 = 1 }
  const r = new Reader(message);
  while (!r.eof) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) return r.bytes();
    r.skip(wire);
  }
  throw new Error(`${endpoint}: empty ${method} response`);
}

/** Try random evonode endpoints until one answers. */
async function withEndpoints<T>(
  network: Network,
  masternodes: MasternodeEntry[],
  call: (endpoint: string) => Promise<T>,
): Promise<T> {
  const endpoints = dapiEndpoints(network, masternodes).sort(() => Math.random() - 0.5);
  let lastError: unknown;
  for (const endpoint of endpoints.slice(0, 8)) {
    try {
      return await call(endpoint);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('no DAPI endpoint reachable');
}

export function fetchCurrentQuorumsInfo(
  network: Network,
  masternodes: MasternodeEntry[],
): Promise<CurrentQuorumsInfo> {
  return withEndpoints(network, masternodes, async (endpoint) =>
    parseResponseV0(await callUnaryV0(endpoint, 'getCurrentQuorumsInfo')),
  );
}

/** Drive protocol-version state from Platform.getStatus. */
export interface DriveProtocolStatus {
  latest: number; // highest version the responding node's software supports
  current: number; // version in force this epoch
  nextEpoch: number; // version that will be used next epoch — the lock-in signal
}

// GetStatusResponseV0: Version(1) → Protocol(2) → Drive(2) → { latest=3, current=4, next_epoch=5 }
function parseStatusV0(buf: Uint8Array): DriveProtocolStatus {
  const status: DriveProtocolStatus = { latest: 0, current: 0, nextEpoch: 0 };
  const v0 = new Reader(buf);
  while (!v0.eof) {
    const t = v0.tag();
    if (t.field !== 1 || t.wire !== 2) {
      v0.skip(t.wire);
      continue;
    }
    const version = new Reader(v0.bytes());
    while (!version.eof) {
      const vt = version.tag();
      if (vt.field !== 2 || vt.wire !== 2) {
        version.skip(vt.wire);
        continue;
      }
      const protocol = new Reader(version.bytes());
      while (!protocol.eof) {
        const pt = protocol.tag();
        if (pt.field !== 2 || pt.wire !== 2) {
          protocol.skip(pt.wire);
          continue;
        }
        const drive = new Reader(protocol.bytes());
        while (!drive.eof) {
          const dt = drive.tag();
          if (dt.field === 3 && dt.wire === 0) status.latest = Number(drive.varint());
          else if (dt.field === 4 && dt.wire === 0) status.current = Number(drive.varint());
          else if (dt.field === 5 && dt.wire === 0) status.nextEpoch = Number(drive.varint());
          else drive.skip(dt.wire);
        }
      }
    }
  }
  if (!status.current) throw new Error('getStatus: drive protocol section missing');
  return status;
}

export function fetchDriveStatus(
  network: Network,
  masternodes: MasternodeEntry[],
): Promise<DriveProtocolStatus> {
  return withEndpoints(network, masternodes, async (endpoint) =>
    parseStatusV0(await callUnaryV0(endpoint, 'getStatus')),
  );
}
