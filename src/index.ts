#!/usr/bin/env node
import dgram from 'node:dgram';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { promises as dns } from 'node:dns';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packet: any = require('dns-packet');

type QType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'PTR' | 'SRV' | 'TXT' | 'ANY';

interface ServerOptions {
    host: string;
    port: number;
    ttl: number;
}

const DEFAULTS: ServerOptions = {
    host: process.env.DNS_HOST || '0.0.0.0',
    port: Number(process.env.DNS_PORT || 53),
    ttl: Number(process.env.DNS_TTL || 300),
};

const parseArgs = (): Partial<ServerOptions> => {
    const args = process.argv.slice(2);
    const opts: Partial<ServerOptions> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--port' || a === '-p') {
            const v = args[++i];
            if (v) opts.port = Number(v);
        } else if (a === '--host' || a === '-H') {
            const v = args[++i];
            if (v) opts.host = v;
        } else if (a === '--ttl') {
            const v = args[++i];
            if (v) opts.ttl = Number(v);
        } else if (a === '--help' || a === '-h') {
            // eslint-disable-next-line no-console
            console.log(
                `dns-server - Lightweight UDP DNS resolver\n\nUsage: dns-server [options]\n\nOptions:\n  -p, --port <port>   UDP port to listen on (default: 53)\n  -H, --host <host>   Host/IP to bind (default: 0.0.0.0)\n  --ttl <seconds>     TTL for synthesized answers (default: 300)\n  -h, --help          Show help`,
            );
            process.exit(0);
        }
    }
    return opts;
};

const toRecordType = (t: QType): QType => t;

// -------------------- Hosts file support --------------------
const RCODE = {
    NOERROR: 0,
    FORMERR: 1,
    SERVFAIL: 2,
    NXDOMAIN: 3,
    NOTIMP: 4,
    REFUSED: 5,
} as const;

type HostsCache = {
    v4: Map<string, string[]>; // hostname -> IPv4 list
    v6: Map<string, string[]>; // hostname -> IPv6 list
    rev4: Map<string, string[]>; // 1.0.168.192.in-addr.arpa -> host list
    rev6: Map<string, string[]>; // ip6.arpa -> host list
    mtimeMs: number;
};

const normalizeName = (name: string): string => name.replace(/\.$/, '').toLowerCase();

const HOSTS_PATH = (() => {
    if (process.platform === 'win32') return 'C:/Windows/System32/drivers/etc/hosts';
    return '/etc/hosts';
})();

let hostsCache: HostsCache = {
    v4: new Map(),
    v6: new Map(),
    rev4: new Map(),
    rev6: new Map(),
    mtimeMs: 0,
};

const ipToArpa4 = (ip: string): string | null => {
    // naive: a.b.c.d -> d.c.b.a.in-addr.arpa
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    return `${m[4]}.${m[3]}.${m[2]}.${m[1]}.in-addr.arpa`;
};

const ipToArpa6 = (ip: string): string | null => {
    // compress and expand to nibbles
    try {
        // Use URL to normalize IPv6? Node doesn't ship an easy expander; keep simple best-effort
        const parts = ip.toLowerCase().replace(/\s+/g, '').split('::');
        const left = parts[0].split(':').filter(Boolean);
        const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
        const fill = 8 - (left.length + right.length);
        if (fill < 0) return null;
        const full = [...left, ...Array(fill).fill('0'), ...right].map((h) => h.padStart(4, '0')).join('');
        const nibbles = full.split('');
        return `${nibbles.reverse().join('.')}.ip6.arpa`;
    } catch {
        return null;
    }
};

const parseHostsContent = (content: string): HostsCache => {
    const v4 = new Map<string, string[]>();
    const v6 = new Map<string, string[]>();
    const rev4 = new Map<string, string[]>();
    const rev6 = new Map<string, string[]>();

    const push = (map: Map<string, string[]>, key: string, value: string) => {
        const list = map.get(key) || [];
        if (!list.includes(value)) list.push(value);
        map.set(key, list);
    };

    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.replace(/#.*/, '').trim();
        if (!line) continue;
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const ip = parts[0];
        const hosts = parts.slice(1).map((h) => normalizeName(h));
        const isV6 = ip.includes(':');

        for (const h of hosts) {
            if (isV6) push(v6, h, ip);
            else push(v4, h, ip);
        }

        // Build reverse maps
        if (isV6) {
            const arpa = ipToArpa6(ip);
            if (arpa) for (const h of hosts) push(rev6, arpa, h);
        } else {
            const arpa = ipToArpa4(ip);
            if (arpa) for (const h of hosts) push(rev4, arpa, h);
        }
    }

    return { v4, v6, rev4, rev6, mtimeMs: Date.now() };
};

const loadHosts = async (): Promise<void> => {
    try {
        const stat = await fs.promises.stat(HOSTS_PATH);
        const mtimeMs = stat.mtimeMs;
        if (mtimeMs === hostsCache.mtimeMs) return;
        const content = await fs.promises.readFile(HOSTS_PATH, 'utf8');
        hostsCache = { ...parseHostsContent(content), mtimeMs };
        console.log(`[DNS Server] Loaded hosts file from ${HOSTS_PATH} (${content.length} bytes)`);
    } catch (e: any) {
        // If missing or unreadable, just keep empty cache
        console.warn(`[DNS Server] Unable to read hosts file ${HOSTS_PATH}: ${e?.message || e}`);
        hostsCache = { v4: new Map(), v6: new Map(), rev4: new Map(), rev6: new Map(), mtimeMs: 0 };
    }
};

const watchHosts = () => {
    try {
        fs.watch(path.dirname(HOSTS_PATH), { persistent: true }, (event, filename) => {
            if (!filename) return;
            if (
                path.resolve(path.dirname(HOSTS_PATH), filename) !== HOSTS_PATH &&
                filename !== path.basename(HOSTS_PATH)
            )
                return;
            // Debounce by reloading after a short delay
            setTimeout(() => {
                loadHosts().catch(() => {});
            }, 200);
        });
    } catch (e: any) {
        console.warn(`[DNS Server] Failed to watch hosts file: ${e?.message || e}`);
    }
};

const lookupFromHosts = (qname: string, type: QType, ttl: number): any[] | null => {
    const name = normalizeName(qname);
    const answers: any[] = [];
    if (type === 'A') {
        const ips = hostsCache.v4.get(name);
        if (ips && ips.length) return ips.map((ip) => ({ type: 'A', name: qname, ttl, data: ip }));
        return null;
    }
    if (type === 'AAAA') {
        const ips = hostsCache.v6.get(name);
        if (ips && ips.length) return ips.map((ip) => ({ type: 'AAAA', name: qname, ttl, data: ip }));
        return null;
    }
    if (type === 'PTR') {
        const hosts = hostsCache.rev4.get(name) || hostsCache.rev6.get(name);
        if (hosts && hosts.length) return hosts.map((h) => ({ type: 'PTR', name: qname, ttl, data: h }));
        return null;
    }
    if (type === 'ANY') {
        const a = lookupFromHosts(qname, 'A', ttl) || [];
        const aaaa = lookupFromHosts(qname, 'AAAA', ttl) || [];
        if (a.length || aaaa.length) return [...a, ...aaaa];
        return null;
    }
    return null;
};

const mapResolve = async (name: string, type: QType): Promise<any[]> => {
    const ttl = DEFAULTS.ttl;
    const answers: any[] = [];

    const add = (ans: any | any[]) => {
        if (Array.isArray(ans)) answers.push(...ans);
        else answers.push(ans);
    };

    try {
        // 1) Hosts override
        const hostsAns = lookupFromHosts(name, type, ttl);
        if (hostsAns) return hostsAns;

        // 2) System resolver
        switch (type) {
            case 'A': {
                const ips = (await dns.resolve4(name)).slice(0, 20);
                add(ips.map((ip) => ({ type: 'A', name, ttl, data: ip })));
                break;
            }
            case 'AAAA': {
                const ips = (await dns.resolve6(name)).slice(0, 20);
                add(ips.map((ip) => ({ type: 'AAAA', name, ttl, data: ip })));
                break;
            }
            case 'CNAME': {
                const cnames = await dns.resolveCname(name);
                add(cnames.map((c) => ({ type: 'CNAME', name, ttl, data: c })));
                break;
            }
            case 'MX': {
                const mx = await dns.resolveMx(name);
                add(mx.map((m) => ({ type: 'MX', name, ttl, data: { preference: m.priority, exchange: m.exchange } })));
                break;
            }
            case 'NS': {
                const ns = await dns.resolveNs(name);
                add(ns.map((n) => ({ type: 'NS', name, ttl, data: n })));
                break;
            }
            case 'PTR': {
                const ptrs = await dns.resolvePtr(name);
                add(ptrs.map((p) => ({ type: 'PTR', name, ttl, data: p })));
                break;
            }
            case 'SRV': {
                const srvs = await dns.resolveSrv(name);
                add(
                    srvs.map((s) => ({
                        type: 'SRV',
                        name,
                        ttl,
                        data: { priority: s.priority, weight: s.weight, port: s.port, target: s.name },
                    })),
                );
                break;
            }
            case 'TXT': {
                const txt = await dns.resolveTxt(name);
                add(txt.map((parts) => ({ type: 'TXT', name, ttl, data: parts.join('') })));
                break;
            }
            case 'ANY': {
                // Best-effort: gather common types
                const [a, aaaa, cname, mx, ns, txt] = await Promise.allSettled([
                    dns.resolve4(name),
                    dns.resolve6(name),
                    dns.resolveCname(name),
                    dns.resolveMx(name),
                    dns.resolveNs(name),
                    dns.resolveTxt(name),
                ]);
                // Include hosts results if any
                const aHosts = lookupFromHosts(name, 'A', ttl) || [];
                const aaaaHosts = lookupFromHosts(name, 'AAAA', ttl) || [];
                add(aHosts);
                add(aaaaHosts);
                if (a.status === 'fulfilled') add(a.value.map((ip) => ({ type: 'A', name, ttl, data: ip })));
                if (aaaa.status === 'fulfilled') add(aaaa.value.map((ip) => ({ type: 'AAAA', name, ttl, data: ip })));
                if (cname.status === 'fulfilled') add(cname.value.map((c) => ({ type: 'CNAME', name, ttl, data: c })));
                if (mx.status === 'fulfilled')
                    add(
                        mx.value.map((m) => ({
                            type: 'MX',
                            name,
                            ttl,
                            data: { preference: m.priority, exchange: m.exchange },
                        })),
                    );
                if (ns.status === 'fulfilled') add(ns.value.map((n) => ({ type: 'NS', name, ttl, data: n })));
                if (txt.status === 'fulfilled')
                    add(txt.value.map((parts) => ({ type: 'TXT', name, ttl, data: parts.join('') })));
                break;
            }
            default:
                throw Object.assign(new Error(`Not implemented type ${type}`), { code: 'NOTIMP' });
        }
        return answers;
    } catch (err: any) {
        throw err;
    }
};

const start = async () => {
    const override = parseArgs();
    const opts: ServerOptions = { ...DEFAULTS, ...override } as ServerOptions;
    const isIPv6 = opts.host.includes(':');
    const sock = dgram.createSocket(isIPv6 ? 'udp6' : 'udp4');

    sock.on('error', (err) => {
        console.error(`[DNS Server] Socket error: ${err.message}`);
    });

    sock.on('message', async (msg, rinfo) => {
        let req: any;
        try {
            req = packet.decode(msg);
        } catch (e: any) {
            console.warn(`[DNS Server] Failed to decode DNS packet from ${rinfo.address}:${rinfo.port} - ${e.message}`);
            return;
        }

        const q = req.questions?.[0];
        if (!q) {
            return;
        }

        const qname = q.name;
        const qtype = toRecordType(q.type as QType);

        console.log(`[DNS Server] Query id=${req.id} ${qtype} ${qname} from ${rinfo.address}:${rinfo.port}`);

        const baseResp: any = {
            id: req.id,
            type: 'response',
            flags: req.flags ?? 0,
            questions: req.questions,
            answers: [],
            additionals: [],
            authorities: [],
        };

        // Set header flags: QR=1, RA=1, RD copied
        const RD = (req.flags || 0) & packet.RECURSION_DESIRED ? packet.RECURSION_DESIRED : 0;
        let flags = packet.RESPONSE | RD | packet.RECURSION_AVAILABLE;

        try {
            const answers = await mapResolve(qname, qtype);
            baseResp.answers = answers;
            flags |= 0; // NOERROR
        } catch (e: any) {
            const code = e?.code as string | undefined;
            let rcode: number = RCODE.NOERROR;
            if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
                rcode = RCODE.NXDOMAIN;
            } else if (code === 'NOTIMP') {
                rcode = RCODE.NOTIMP;
            } else {
                rcode = RCODE.SERVFAIL;
            }
            flags |= rcode;
            console.warn(`[DNS Server] Resolution failed for ${qtype} ${qname}: ${e?.message || e} (${code})`);
        }

        baseResp.flags = flags;

        let buf = packet.encode(baseResp);
        // Truncate if exceeds 512 bytes (no EDNS support)
        if (buf.length > 512) {
            baseResp.flags = (baseResp.flags || 0) | packet.TRUNCATED_RESPONSE;
            // naive truncation: drop answers until fits
            while (baseResp.answers && baseResp.answers.length && packet.encode(baseResp).length > 512) {
                baseResp.answers.pop();
            }
            buf = packet.encode(baseResp);
        }

        sock.send(buf, rinfo.port, rinfo.address, (err) => {
            if (err) {
                console.error(`[DNS Server] Failed to send DNS response: ${err.message}`);
            }
        });
    });

    sock.on('listening', () => {
        const addr = sock.address();
        const bind = typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`;
        console.log(`[DNS Server] Listening on udp://${bind}`);
    });

    process.on('SIGINT', () => {
        console.log('[DNS Server] Shutting down...');
        sock.close(() => process.exit(0));
    });

    // Load hosts once and start a watcher
    await loadHosts();
    watchHosts();

    const attemptBind = () => {
        try {
            sock.bind(opts.port, opts.host);
        } catch (e: any) {
            const code = e?.code;
            if (code === 'EACCES') {
                console.error(`[DNS Server] Permission denied binding to ${opts.host}:${opts.port}. You can use --port 1053 for testing. Will retry in 5s...`);
            } else if (code === 'EADDRINUSE') {
                console.error(`[DNS Server] Port ${opts.port} already in use on ${opts.host}. Will retry in 5s...`);
            } else {
                console.error(`[DNS Server] Bind error for ${opts.host}:${opts.port}: ${e?.message || e}. Will retry in 5s...`);
            }
            setTimeout(attemptBind, 5000);
        }
    };

    attemptBind();
};

// Do not exit the process on error; keep the dev process alive
start().catch((err) => {
    console.error(`[DNS Server] Startup error: ${err?.message || err}`);
});
