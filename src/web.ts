import http from 'node:http';
import { spawn } from 'node:child_process';
import { RecordStore, parseHostsContent, toWire } from './records';
import { renderUi } from './ui';

export interface WebContext {
    store: RecordStore;
    dnsHost: string;
    dnsPort: number;
}

export interface WebOptions {
    host: string;
    port: number;
    open: boolean;
}

const readBody = (req: http.IncomingMessage, limit = 1_000_000): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
                reject(Object.assign(new Error('Payload too large'), { code: 'ETOOLARGE' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });

const sendJson = (res: http.ServerResponse, status: number, payload: unknown): void => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
    });
    res.end(body);
};

const parseJson = (raw: string): any => {
    if (!raw.trim()) return {};
    return JSON.parse(raw);
};

export const openBrowser = (url: string): void => {
    const cmd =
        process.platform === 'darwin'
            ? { file: 'open', args: [url] }
            : process.platform === 'win32'
              ? { file: 'cmd', args: ['/c', 'start', '', url] }
              : { file: 'xdg-open', args: [url] };
    try {
        const child = spawn(cmd.file, cmd.args, { stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
    } catch {
        /* best effort */
    }
};

export const startWebServer = (ctx: WebContext, opts: WebOptions): http.Server => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const route = `${req.method} ${url.pathname}`;

        try {
            if (route === 'GET /' || route === 'GET /index.html') {
                const html = renderUi();
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Length': Buffer.byteLength(html),
                    'Cache-Control': 'no-store',
                });
                res.end(html);
                return;
            }

            if (route === 'GET /api/status') {
                sendJson(res, 200, {
                    dnsHost: ctx.dnsHost,
                    dnsPort: ctx.dnsPort,
                    recordsFile: ctx.store.file,
                    count: ctx.store.get().length,
                });
                return;
            }

            if (route === 'GET /api/records') {
                sendJson(res, 200, { records: ctx.store.get().map(toWire) });
                return;
            }

            if (route === 'PUT /api/records') {
                const body = parseJson(await readBody(req));
                const records = ctx.store.replace(body?.records);
                sendJson(res, 200, { records: records.map(toWire) });
                return;
            }

            if (route === 'POST /api/records') {
                const body = parseJson(await readBody(req));
                const records = ctx.store.add(body?.records);
                sendJson(res, 200, { records: records.map(toWire) });
                return;
            }

            if (route === 'POST /api/records/parse-hosts') {
                const body = parseJson(await readBody(req));
                const content = typeof body?.content === 'string' ? body.content : '';
                sendJson(res, 200, { records: parseHostsContent(content).map(toWire) });
                return;
            }

            sendJson(res, 404, { error: 'Not found' });
        } catch (e: any) {
            const status = e?.code === 'ETOOLARGE' ? 413 : 400;
            sendJson(res, status, { error: e?.message || 'Bad request' });
        }
    });

    server.on('error', (err: any) => {
        if (err?.code === 'EADDRINUSE') {
            console.error(`[DevNS] Web UI port ${opts.port} already in use. Use --web-port to change it.`);
        } else {
            console.error(`[DevNS] Web server error: ${err?.message || err}`);
        }
    });

    server.listen(opts.port, opts.host, () => {
        const url = `http://${opts.host === '0.0.0.0' || opts.host === '::' ? 'localhost' : opts.host}:${opts.port}`;
        console.log(`[DevNS] Web UI: ${url}`);
        if (opts.open) openBrowser(url);
    });

    return server;
};
