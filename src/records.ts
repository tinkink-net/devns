import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type RecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'PTR' | 'SRV' | 'TXT';

export const RECORD_TYPES: RecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SRV', 'TXT'];

export interface FieldSpec {
    key: string;
    label: string;
    placeholder: string;
    kind?: 'text' | 'number';
}

/**
 * How each record type is presented to the user as individual fields.
 * Complex types (MX/SRV) hide the space-separated wire format behind named inputs.
 */
export const TYPE_FIELDS: Record<RecordType, FieldSpec[]> = {
    A: [{ key: 'address', label: 'Address', placeholder: '192.0.2.10' }],
    AAAA: [{ key: 'address', label: 'Address', placeholder: '2001:db8::1' }],
    CNAME: [{ key: 'target', label: 'Target', placeholder: 'target.example.com' }],
    NS: [{ key: 'target', label: 'Name server', placeholder: 'ns1.example.com' }],
    PTR: [{ key: 'target', label: 'Target', placeholder: 'host.example.com' }],
    MX: [
        { key: 'priority', label: 'Priority', placeholder: '10', kind: 'number' },
        { key: 'target', label: 'Mail server', placeholder: 'mail.example.com' },
    ],
    SRV: [
        { key: 'priority', label: 'Priority', placeholder: '10', kind: 'number' },
        { key: 'weight', label: 'Weight', placeholder: '60', kind: 'number' },
        { key: 'port', label: 'Port', placeholder: '5060', kind: 'number' },
        { key: 'target', label: 'Target', placeholder: 'sip.example.com' },
    ],
    TXT: [{ key: 'text', label: 'Text', placeholder: 'hello world' }],
};

/** Compose named fields into the canonical stored value. */
export const composeValue = (type: RecordType, fields: Record<string, unknown>): string => {
    const specs = TYPE_FIELDS[type];
    if (!specs) return '';
    // Single-field types (incl. TXT) keep their value verbatim so spaces survive.
    if (specs.length === 1) {
        const only = fields[specs[0].key];
        return only == null ? '' : String(only).trim();
    }
    return specs
        .map((spec) => {
            const v = fields[spec.key];
            return v == null ? '' : String(v).trim();
        })
        .join(' ')
        .trim();
};

/** Parse a canonical stored value back into named fields. */
export const parseValue = (type: RecordType, value: string): Record<string, string> => {
    const specs = TYPE_FIELDS[type];
    if (!specs) return {};
    const text = value == null ? '' : String(value);
    if (specs.length === 1) return { [specs[0].key]: text };
    const parts = text.trim().split(/\s+/);
    const out: Record<string, string> = {};
    specs.forEach((spec, i) => {
        out[spec.key] = parts[i] ?? '';
    });
    return out;
};

export interface CustomRecord {
    id: string;
    name: string;
    type: RecordType;
    value: string;
    ttl?: number;
}

/** Wire shape returned to the web UI: canonical value plus parsed fields. */
export const toWire = (record: CustomRecord): CustomRecord & { fields: Record<string, string> } => ({
    ...record,
    fields: parseValue(record.type, record.value),
});

export const DEFAULT_RECORDS_PATH = path.join(os.homedir(), '.devns', 'records.json');

const normalizeName = (name: string): string => name.trim().replace(/\.$/, '').toLowerCase();

const isRecordType = (t: unknown): t is RecordType => typeof t === 'string' && (RECORD_TYPES as string[]).includes(t);

const parseTtl = (ttl: unknown): number | undefined => {
    if (ttl === undefined || ttl === null || ttl === '') return undefined;
    const n = Number(ttl);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
};

export const coerceRecord = (raw: any): CustomRecord | null => {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? normalizeName(raw.name) : '';
    const type = raw.type;
    if (!name || !isRecordType(type)) return null;
    // Prefer structured `fields` (written by the UI); fall back to a raw `value`.
    let value: string;
    if (raw.fields && typeof raw.fields === 'object') {
        const specs = TYPE_FIELDS[type];
        const incomplete = specs.some((spec) => {
            const v = raw.fields[spec.key];
            return v == null || String(v).trim() === '';
        });
        if (incomplete) return null;
        value = composeValue(type, raw.fields);
    } else {
        value = typeof raw.value === 'string' ? raw.value.trim() : '';
    }
    if (!value) return null;
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
        name,
        type,
        value,
        ttl: parseTtl(raw.ttl),
    };
};

const sortRecords = (records: CustomRecord[]): CustomRecord[] =>
    [...records].sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));

// -------------------- Hosts file import --------------------

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

export const parseHostsContent = (content: string): CustomRecord[] => {
    const records: CustomRecord[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*/, '').trim();
        if (!line) continue;
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const ip = parts[0];
        const isV4 = IPV4_RE.test(ip);
        const isV6 = !isV4 && ip.includes(':') && IPV6_RE.test(ip);
        if (!isV4 && !isV6) continue;
        const type: RecordType = isV4 ? 'A' : 'AAAA';
        for (const host of parts.slice(1)) {
            const name = normalizeName(host);
            if (!name) continue;
            records.push({ id: crypto.randomUUID(), name, type, value: ip });
        }
    }
    return records;
};

// -------------------- Record store --------------------

export class RecordStore {
    private records: CustomRecord[] = [];
    private mtimeMs = 0;

    constructor(public readonly file: string) {}

    get(): CustomRecord[] {
        return this.records;
    }

    private persist(): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.records, null, 2) + '\n', 'utf8');
        try {
            this.mtimeMs = fs.statSync(this.file).mtimeMs;
        } catch {
            /* ignore */
        }
    }

    load(): void {
        try {
            const stat = fs.statSync(this.file);
            this.mtimeMs = stat.mtimeMs;
            const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
            this.records = sortRecords(list.map(coerceRecord).filter((r: CustomRecord | null): r is CustomRecord => r !== null));
        } catch (e: any) {
            if (e?.code !== 'ENOENT') {
                console.warn(`[DevNS] Unable to read records file ${this.file}: ${e?.message || e}`);
            }
            this.records = [];
        }
    }

    /** Reload from disk only when the file changed underneath us. */
    reloadIfChanged(): void {
        try {
            const stat = fs.statSync(this.file);
            if (stat.mtimeMs === this.mtimeMs) return;
            this.load();
        } catch {
            /* ignore */
        }
    }

    replace(rawRecords: any[]): CustomRecord[] {
        const list = Array.isArray(rawRecords) ? rawRecords : [];
        this.records = sortRecords(list.map(coerceRecord).filter((r: CustomRecord | null): r is CustomRecord => r !== null));
        this.persist();
        return this.records;
    }

    add(rawRecords: any[]): CustomRecord[] {
        const incoming = (Array.isArray(rawRecords) ? rawRecords : [])
            .map(coerceRecord)
            .filter((r: CustomRecord | null): r is CustomRecord => r !== null);
        this.records = sortRecords([...this.records, ...incoming]);
        this.persist();
        return this.records;
    }

    lookup(name: string, type: RecordType | 'ANY'): CustomRecord[] {
        const qname = normalizeName(name);
        const matches = (candidate: string, record: CustomRecord): boolean => {
            if (record.type !== type && type !== 'ANY') return false;
            if (record.name === qname) return true;
            // Wildcard support: "*.example.com" answers "foo.example.com"
            if (record.name.startsWith('*.')) {
                const suffix = record.name.slice(1); // ".example.com"
                return qname.endsWith(suffix) && qname.length > suffix.length;
            }
            return false;
        };
        return this.records.filter((record) => matches(qname, record));
    }
}
