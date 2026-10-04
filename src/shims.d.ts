declare module 'dns-packet' {
    export const RECURSION_DESIRED: number;
    export const RECURSION_AVAILABLE: number;
    export const TRUNCATED_RESPONSE: number;
    export const AUTHORITATIVE_ANSWER: number;

    export interface DNSQuestion {
        type: any;
        name: string;
        class?: string;
    }

    export interface DNSAnswer {
        type: any;
        name: string;
        ttl?: number;
        data: any;
    }

    export interface DNSPacket {
        id?: number;
        type: 'query' | 'response';
        flags?: number;
        questions?: DNSQuestion[];
        answers?: DNSAnswer[];
        additionals?: any[];
        authorities?: any[];
    }

    const packet: {
        encode(pkt: DNSPacket): Buffer;
        decode(buf: Buffer): DNSPacket;
        RECURSION_DESIRED: number;
        RECURSION_AVAILABLE: number;
        TRUNCATED_RESPONSE: number;
        AUTHORITATIVE_ANSWER: number;
    };
    export default packet;
}
