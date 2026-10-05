import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RecordStore,
    composeValue,
    coerceRecord,
    parseHostsContent,
    parseValue,
    toWire,
} from '../src/records';

const tempRecordsPath = (): { dir: string; file: string } => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devns-test-'));
    return { dir, file: path.join(dir, 'records.json') };
};

test('composeValue joins MX fields into the canonical value', () => {
    assert.equal(composeValue('MX', { priority: '10', target: 'mail.dev.local' }), '10 mail.dev.local');
});

test('composeValue joins SRV fields into the canonical value', () => {
    assert.equal(
        composeValue('SRV', { priority: '10', weight: '60', port: '5060', target: 'sip.dev.local' }),
        '10 60 5060 sip.dev.local',
    );
});

test('composeValue keeps a single-field TXT value verbatim, including spaces', () => {
    assert.equal(composeValue('TXT', { text: 'hello world' }), 'hello world');
});

test('parseValue splits MX and SRV values into named fields', () => {
    assert.deepEqual(parseValue('MX', '10 mail.dev.local'), { priority: '10', target: 'mail.dev.local' });
    assert.deepEqual(parseValue('SRV', '10 60 5060 sip.dev.local'), {
        priority: '10',
        weight: '60',
        port: '5060',
        target: 'sip.dev.local',
    });
});

test('parseValue treats single-field types as opaque text', () => {
    assert.deepEqual(parseValue('TXT', 'hello world'), { text: 'hello world' });
    assert.deepEqual(parseValue('A', '10.0.0.5'), { address: '10.0.0.5' });
});

test('compose/parse round-trips every multi-field type', () => {
    for (const type of ['MX', 'SRV'] as const) {
        const value = type === 'MX' ? '10 mail.dev.local' : '10 60 5060 sip.dev.local';
        assert.equal(composeValue(type, parseValue(type, value)), value);
    }
});

test('coerceRecord composes fields into the stored value and normalizes the name', () => {
    const record = coerceRecord({
        name: 'Dev.Local.',
        type: 'MX',
        fields: { priority: '10', target: 'mail.dev.local' },
    });
    assert.ok(record);
    assert.equal(record.name, 'dev.local');
    assert.equal(record.value, '10 mail.dev.local');
    assert.equal(record.ttl, undefined);
});

test('coerceRecord accepts a pre-composed value (hand-edited files)', () => {
    const record = coerceRecord({ name: 'api.dev.local', type: 'A', value: '  10.0.0.5  ' });
    assert.equal(record?.value, '10.0.0.5');
});

test('coerceRecord rejects incomplete fields, unknown types and empty values', () => {
    assert.equal(coerceRecord({ name: 'bad.dev.local', type: 'MX', fields: { priority: '10' } }), null);
    assert.equal(coerceRecord({ name: 'x.dev.local', type: 'SOA', value: 'ns. x. 1 2 3 4 5' }), null);
    assert.equal(coerceRecord({ name: 'x.dev.local', type: 'A', value: '' }), null);
    assert.equal(coerceRecord(null), null);
});

test('parseHostsContent turns IPv4 into A records and IPv6 into AAAA records', () => {
    const records = parseHostsContent(
        ['# a comment', '127.0.0.1   api.dev.local web.dev.local', '::1         api.dev.local', ''].join('\n'),
    );
    const v4 = records
        .filter((r) => r.type === 'A')
        .map((r) => `${r.name}=${r.value}`)
        .sort();
    const v6 = records
        .filter((r) => r.type === 'AAAA')
        .map((r) => `${r.name}=${r.value}`)
        .sort();
    assert.deepEqual(v4, ['api.dev.local=127.0.0.1', 'web.dev.local=127.0.0.1']);
    assert.deepEqual(v6, ['api.dev.local=::1']);
});

test('RecordStore persists records as canonical values and reloads them', () => {
    const { dir, file } = tempRecordsPath();
    try {
        const store = new RecordStore(file);
        store.replace([{ name: 'api.dev.local', type: 'A', fields: { address: '10.0.0.5' } }]);
        assert.ok(fs.existsSync(file));

        const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(onDisk[0].value, '10.0.0.5');

        const reloaded = new RecordStore(file);
        reloaded.load();
        assert.equal(reloaded.get().length, 1);
        assert.equal(reloaded.get()[0].name, 'api.dev.local');
        assert.equal(reloaded.get()[0].value, '10.0.0.5');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('RecordStore only reloads when the file changed on disk', () => {
    const { dir, file } = tempRecordsPath();
    try {
        const store = new RecordStore(file);
        store.replace([{ name: 'a.dev.local', type: 'A', value: '1.1.1.1' }]);
        store.reloadIfChanged();
        assert.equal(store.get().length, 1);

        const external = JSON.parse(fs.readFileSync(file, 'utf8'));
        external.push({ name: 'b.dev.local', type: 'A', value: '2.2.2.2' });
        fs.writeFileSync(file, JSON.stringify(external, null, 2));
        store.reloadIfChanged();
        assert.equal(store.get().length, 2);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('RecordStore.lookup matches exact names, is type-aware, and supports wildcards', () => {
    const { dir, file } = tempRecordsPath();
    try {
        const store = new RecordStore(file);
        store.replace([
            { name: 'api.dev.local', type: 'A', value: '10.0.0.5' },
            { name: '*.wild.dev.local', type: 'A', value: '1.2.3.4' },
        ]);

        assert.equal(store.lookup('api.dev.local', 'A').length, 1);
        assert.equal(store.lookup('api.dev.local', 'AAAA').length, 0);
        assert.equal(store.lookup('foo.wild.dev.local', 'A').length, 1);
        assert.equal(store.lookup('deep.foo.wild.dev.local', 'A').length, 1);
        // A wildcard does not match its own apex.
        assert.equal(store.lookup('wild.dev.local', 'A').length, 0);
        // 'ANY' matches every type.
        assert.equal(store.lookup('api.dev.local', 'ANY').length, 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('toWire exposes parsed fields alongside the canonical value', () => {
    const wire = toWire({ id: '1', name: 'dev.local', type: 'MX', value: '10 mail.dev.local' });
    assert.equal(wire.value, '10 mail.dev.local');
    assert.deepEqual(wire.fields, { priority: '10', target: 'mail.dev.local' });
});
