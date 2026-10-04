import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_UDP_PAYLOAD,
    MIN_UDP_PAYLOAD,
    RCODE,
    buildCustomAnswers,
    buildResponse,
    extractTcpMessages,
    frameTcpResponse,
    negotiateMaxPayload,
    splitTxt,
} from '../src/dns';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packet: any = require('dns-packet');

const byteLengths = (chunks: string[]): number[] => chunks.map((chunk) => Buffer.byteLength(chunk));

const makeRequest = (name: string, options: { edns?: number; type?: string } = {}): any => {
    const query: any = {
        type: 'query',
        id: 0x1234,
        flags: packet.RECURSION_DESIRED,
        questions: [{ type: options.type ?? 'TXT', name }],
    };
    if (options.edns) {
        query.additionals = [{ name: '.', type: 'OPT', udpPayloadSize: options.edns }];
    }
    return packet.decode(packet.encode(query));
};

const longTxtAnswers = (name: string): any[] => [
    { type: 'TXT', name, ttl: 300, data: splitTxt('k'.repeat(600)) },
];

// -------------------- splitTxt --------------------

test('splitTxt keeps a short value as a single character-string', () => {
    assert.deepEqual(splitTxt('v=spf1 -all'), ['v=spf1 -all']);
});

test('splitTxt returns a single empty character-string for an empty value', () => {
    assert.deepEqual(splitTxt(''), ['']);
});

test('splitTxt chunks at 255 bytes and reassembles losslessly', () => {
    const value = 'x'.repeat(600);
    const chunks = splitTxt(value);
    assert.deepEqual(byteLengths(chunks), [255, 255, 90]);
    assert.equal(chunks.join(''), value);
    assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk) <= 255));
});

test('splitTxt handles exact multiples of the chunk size', () => {
    assert.deepEqual(byteLengths(splitTxt('x'.repeat(255))), [255]);
    assert.deepEqual(byteLengths(splitTxt('x'.repeat(510))), [255, 255]);
});

test('splitTxt does not split multi-byte characters across chunks', () => {
    // 254 ASCII bytes then a 2-byte character straddles the 255-byte boundary.
    const value = 'a'.repeat(254) + 'é' + 'b'.repeat(40);
    const chunks = splitTxt(value);
    assert.deepEqual(byteLengths(chunks), [254, 42]);
    assert.equal(chunks.join(''), value);
});

// -------------------- buildCustomAnswers --------------------

test('buildCustomAnswers encodes MX, SRV and TXT records', () => {
    const server = 'sip.dev.local';
    const [mx] = buildCustomAnswers([{ id: '1', name: 'dev.local', type: 'MX', value: '10 mail.dev.local' }], 'dev.local', 300);
    assert.deepEqual(mx, { type: 'MX', name: 'dev.local', ttl: 300, data: { preference: 10, exchange: 'mail.dev.local' } });

    const [srv] = buildCustomAnswers(
        [{ id: '2', name: '_sip._tcp.dev.local', type: 'SRV', value: `10 60 5060 ${server}` }],
        '_sip._tcp.dev.local',
        300,
    );
    assert.deepEqual(srv.data, { priority: 10, weight: 60, port: 5060, target: server });

    const [txt] = buildCustomAnswers([{ id: '3', name: 'big.dev.local', type: 'TXT', value: 'k'.repeat(300) }], 'big.dev.local', 300);
    assert.deepEqual(byteLengths(txt.data), [255, 45]);
});

test('buildCustomAnswers skips malformed MX/SRV values', () => {
    const answers = buildCustomAnswers(
        [
            { id: '1', name: 'dev.local', type: 'MX', value: '10' },
            { id: '2', name: '_sip._tcp.dev.local', type: 'SRV', value: '10 60 5060' },
        ],
        'dev.local',
        300,
    );
    assert.equal(answers.length, 0);
});

// -------------------- EDNS negotiation --------------------

test('negotiateMaxPayload clamps the advertised EDNS(0) size', () => {
    assert.equal(negotiateMaxPayload(makeRequest('x', { edns: 1232 }), 'udp'), 1232);
    assert.equal(negotiateMaxPayload(makeRequest('x', { edns: 65535 }), 'udp'), MAX_UDP_PAYLOAD);
    assert.equal(negotiateMaxPayload(makeRequest('x', { edns: 128 }), 'udp'), MIN_UDP_PAYLOAD);
    assert.equal(negotiateMaxPayload(makeRequest('x'), 'udp'), MIN_UDP_PAYLOAD);
    assert.equal(negotiateMaxPayload(makeRequest('x'), 'tcp'), 0xffff);
});

// -------------------- buildResponse --------------------

test('buildResponse honors EDNS(0) and keeps a large UDP answer intact', () => {
    const req = makeRequest('big.dev.local', { edns: 4096 });
    const buf = buildResponse(req, longTxtAnswers('big.dev.local'), { transport: 'udp' });
    const res = packet.decode(buf);

    assert.equal(res.flags & packet.TRUNCATED_RESPONSE, 0);
    assert.equal(res.answers.length, 1);
    assert.ok(res.additionals.some((a: any) => a.type === 'OPT'));
    assert.ok(buf.length > MIN_UDP_PAYLOAD, 'response should exceed the non-EDNS limit');
});

test('buildResponse truncates and sets TC for large UDP answers without EDNS', () => {
    const req = makeRequest('big.dev.local');
    const buf = buildResponse(req, longTxtAnswers('big.dev.local'), { transport: 'udp' });
    const res = packet.decode(buf);

    assert.ok(res.flags & packet.TRUNCATED_RESPONSE, 'TC flag should be set');
    assert.equal(res.answers.length, 0);
});

test('buildResponse never truncates over TCP', () => {
    const req = makeRequest('big.dev.local');
    const buf = buildResponse(req, longTxtAnswers('big.dev.local'), { transport: 'tcp' });
    const res = packet.decode(buf);

    assert.equal(res.flags & packet.TRUNCATED_RESPONSE, 0);
    assert.equal(res.answers.length, 1);
});

test('buildResponse preserves the request id and sets the response code', () => {
    const req = makeRequest('missing.dev.local');
    const buf = buildResponse(req, [], { transport: 'udp', rcode: RCODE.NXDOMAIN });
    const res = packet.decode(buf);

    assert.equal(res.id, req.id);
    assert.equal(res.flags & 0x0f, RCODE.NXDOMAIN);
    assert.equal(res.type, 'response');
    assert.ok(res.flag_qr, 'QR bit should be set');
});

// -------------------- TCP framing --------------------

test('frameTcpResponse round-trips through extractTcpMessages', () => {
    const stream = Buffer.concat([frameTcpResponse(Buffer.from('hello')), frameTcpResponse(Buffer.from('world!!'))]);
    const { messages, rest } = extractTcpMessages(stream);

    assert.deepEqual(
        messages.map((m) => m.toString()),
        ['hello', 'world!!'],
    );
    assert.equal(rest.length, 0);
});

test('extractTcpMessages buffers a partially received frame', () => {
    const framed = frameTcpResponse(Buffer.from('abc'));

    const first = extractTcpMessages(framed.subarray(0, 1));
    assert.equal(first.messages.length, 0);
    assert.deepEqual(first.rest, framed.subarray(0, 1));

    const second = extractTcpMessages(Buffer.concat([first.rest, framed.subarray(1)]));
    assert.equal(second.messages.length, 1);
    assert.equal(second.messages[0].toString(), 'abc');
    assert.equal(second.rest.length, 0);
});

test('extractTcpMessages leaves trailing bytes in the buffer', () => {
    const framed = frameTcpResponse(Buffer.from('abc'));
    const withTail = Buffer.concat([framed, Buffer.from([0xff])]);
    const { messages, rest } = extractTcpMessages(withTail);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].toString(), 'abc');
    assert.deepEqual(rest, Buffer.from([0xff]));
});
