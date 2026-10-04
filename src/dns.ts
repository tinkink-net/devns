import { CustomRecord, parseValue } from './records';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packet: any = require('dns-packet');

export const MIN_UDP_PAYLOAD = 512;
export const MAX_UDP_PAYLOAD = 4096;
export const TCP_MAX_PAYLOAD = 0xffff;

export const RCODE = {
    NOERROR: 0,
    FORMERR: 1,
    SERVFAIL: 2,
    NXDOMAIN: 3,
    NOTIMP: 4,
    REFUSED: 5,
} as const;

/** Split a TXT value into DNS character-strings of at most 255 bytes (UTF-8 safe). */
export const splitTxt = (value: string, max = 255): string[] => {
    const chunks: string[] = [];
    let current = '';
    let bytes = 0;
    for (const char of value) {
        const size = Buffer.byteLength(char);
        if (bytes + size > max && current) {
            chunks.push(current);
            current = '';
            bytes = 0;
        }
        current += char;
        bytes += size;
    }
    chunks.push(current);
    return chunks;
};

/** Turn stored custom records into `dns-packet` answer objects. */
export const buildCustomAnswers = (records: CustomRecord[], qname: string, ttl: number): any[] =>
    records
        .map((rec) => {
            const recTtl = rec.ttl ?? ttl;
            switch (rec.type) {
                case 'A':
                case 'AAAA':
                case 'CNAME':
                case 'NS':
                case 'PTR':
                    return { type: rec.type, name: qname, ttl: recTtl, data: rec.value };
                case 'MX': {
                    const fields = parseValue('MX', rec.value);
                    if (!fields.target) return null;
                    return {
                        type: 'MX',
                        name: qname,
                        ttl: recTtl,
                        data: { preference: Number(fields.priority) || 0, exchange: fields.target },
                    };
                }
                case 'SRV': {
                    const fields = parseValue('SRV', rec.value);
                    if (!fields.target) return null;
                    return {
                        type: 'SRV',
                        name: qname,
                        ttl: recTtl,
                        data: {
                            priority: Number(fields.priority) || 0,
                            weight: Number(fields.weight) || 0,
                            port: Number(fields.port) || 0,
                            target: fields.target,
                        },
                    };
                }
                case 'TXT':
                    return { type: 'TXT', name: qname, ttl: recTtl, data: splitTxt(rec.value) };
                default:
                    return null;
            }
        })
        .filter((answer): answer is any => answer !== null);

const findEdns = (req: any): any | undefined =>
    Array.isArray(req?.additionals)
        ? req.additionals.find((a: any) => a && String(a.type).toUpperCase() === 'OPT')
        : undefined;

/** Largest response we may send, based on the transport and the client's EDNS(0) advertisement. */
export const negotiateMaxPayload = (req: any, transport: 'udp' | 'tcp'): number => {
    if (transport === 'tcp') return TCP_MAX_PAYLOAD;
    const reqOpt = findEdns(req);
    const advertised = reqOpt ? Number(reqOpt.udpPayloadSize) : 0;
    return advertised >= MIN_UDP_PAYLOAD ? Math.min(advertised, MAX_UDP_PAYLOAD) : MIN_UDP_PAYLOAD;
};

export interface BuildResponseOptions {
    transport: 'udp' | 'tcp';
    rcode?: number;
}

/** Encode a DNS response, negotiating EDNS(0) and truncating only when UDP requires it. */
export const buildResponse = (req: any, answers: any[], options: BuildResponseOptions): Buffer => {
    const { transport } = options;
    const maxSize = negotiateMaxPayload(req, transport);
    const reqOpt = findEdns(req);

    // Set header flags: RA=1, RD copied, plus the response code. (The QR bit is
    // derived from `type: 'response'` by dns-packet, not from a flag value.)
    const RD = (req.flags || 0) & packet.RECURSION_DESIRED ? packet.RECURSION_DESIRED : 0;
    const flags = RD | packet.RECURSION_AVAILABLE | (options.rcode ?? 0);

    const baseResp: any = {
        id: req.id,
        type: 'response',
        flags,
        questions: req.questions,
        answers,
        additionals: [],
        authorities: [],
    };

    // Advertise EDNS(0) back when the client used it, so large answers fit in UDP.
    if (reqOpt) {
        baseResp.additionals = [
            {
                name: '.',
                type: 'OPT',
                udpPayloadSize: transport === 'tcp' ? MAX_UDP_PAYLOAD : Math.max(maxSize, MIN_UDP_PAYLOAD),
                extendedRcode: 0,
                ednsVersion: 0,
                flags: 0,
                options: [],
            },
        ];
    }

    let buf = packet.encode(baseResp);
    // UDP only: truncate (and set TC) when the response exceeds the negotiated size.
    if (transport === 'udp' && buf.length > maxSize) {
        baseResp.flags |= packet.TRUNCATED_RESPONSE;
        // naive truncation: drop answers until it fits
        while (baseResp.answers && baseResp.answers.length && packet.encode(baseResp).length > maxSize) {
            baseResp.answers.pop();
        }
        buf = packet.encode(baseResp);
    }
    return buf;
};

/** Prefix a DNS message with its 2-byte length for DNS-over-TCP (RFC 7766). */
export const frameTcpResponse = (response: Buffer): Buffer => {
    const framed = Buffer.allocUnsafe(2 + response.length);
    framed.writeUInt16BE(response.length, 0);
    response.copy(framed, 2);
    return framed;
};

/** Pull complete length-prefixed DNS messages out of a TCP stream buffer. */
export const extractTcpMessages = (buffer: Buffer): { messages: Buffer[]; rest: Buffer } => {
    const messages: Buffer[] = [];
    let offset = 0;
    while (buffer.length - offset >= 2) {
        const length = buffer.readUInt16BE(offset);
        if (buffer.length - offset < 2 + length) break;
        messages.push(buffer.subarray(offset + 2, offset + 2 + length));
        offset += 2 + length;
    }
    return { messages, rest: buffer.subarray(offset) };
};
