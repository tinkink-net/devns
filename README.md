# DevNS

DevNS is a lightweight local DNS server for development purposes, it listens on UDP and TCP port 53 (configurable) and answers DNS queries by resolving them via Node's built-in `dns` module, with support for local hosts file overrides.

> DevNS is developed by AI. Also a [Tinkink](https://tink.ink) project.

## Features

- **Lightweight & Fast**: Minimal dependencies, built on Node.js built-in modules
- **UDP & TCP DNS Server**: Listens for DNS queries on a configurable UDP and TCP port, with TCP fallback for large answers
- **Web UI**: Tiny built-in UI to define your own fake DNS records, open by default
- **Custom Records**: Serve A, AAAA, CNAME, MX, NS, PTR, SRV and TXT records you define
- **Hosts Import**: Paste or upload a hosts file and turn it into A/AAAA records
- **Hosts File Support**: Reads and watches system hosts file for local overrides
- **Multiple Record Types**: Supports A, AAAA, CNAME, MX, NS, PTR, SRV, TXT, and ANY queries
- **Standard Logging**: Clean console output with clear server status messages
- **Error Handling**: Graceful error handling with automatic retry mechanisms
- **Production Ready**: Suitable for both development and production environments

## Installation

### Global Installation (Recommended)
```bash
npm install -g devns
```

### Local Installation
```bash
npm install devns
```

### From Source
```bash
git clone <repository-url>
cd dns-server
npm install
npm run build
```

## Usage

### Command Line Options

```bash
devns [options]

Options:
  -p, --port <port>       UDP/TCP port to listen on (default: 53)
  -H, --host <host>       Host/IP to bind (default: 0.0.0.0)
  --ttl <seconds>         TTL for synthesized answers (default: 300)
  --web-port <port>       Web UI port (default: 5380)
  --web-host <host>       Web UI bind host (default: 127.0.0.1)
  --records <path>        Records JSON file (default: ~/.devns/records.json)
  --no-web                Disable the web UI
  --no-open               Do not open the browser automatically
  -h, --help              Show help
```

### Examples

#### Development (Non-privileged port)
```bash
# Start server on port 1053 (no sudo required)
npx devns --port 1053

# Or if installed globally
devns --port 1053
```

Test with dig:
```bash
dig @127.0.0.1 -p 1053 example.com A
dig @127.0.0.1 -p 1053 google.com AAAA
```

#### Production (Port 53 requires elevated privileges)
```bash
# Start server on standard DNS port (requires sudo)
sudo devns --host 0.0.0.0 --port 53
```

#### Custom Host and TTL
```bash
devns --host 127.0.0.1 --port 5353 --ttl 600
```

### Development Mode

If you're working on the source code:

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload on changes)
npm run dev -- --port 1053

# Build for production
npm run build

# Run built version
npm start -- --port 1053
```

## Supported DNS Record Types

The server supports the following DNS query types:

- **A**: IPv4 address records
- **AAAA**: IPv6 address records
- **CNAME**: Canonical name records
- **MX**: Mail exchange records
- **NS**: Name server records
- **PTR**: Pointer records (reverse DNS)
- **SRV**: Service records
- **TXT**: Text records
- **ANY**: Returns all available record types

## Hosts File Support

The server automatically reads and watches your system's hosts file:

- **Linux/macOS**: `/etc/hosts`
- **Windows**: `C:/Windows/System32/drivers/etc/hosts`

Any entries in the hosts file will override external DNS resolution. The server watches for changes and reloads the hosts file automatically.

## Web UI & Custom Records

DevNS ships with a tiny web UI (on by default at http://127.0.0.1:5380) for defining your own fake DNS records. The browser opens automatically on startup; pass `--no-open` to prevent that or `--no-web` to disable the UI entirely.

Records are shown and edited in a table with `Name`, `Type`, fields and `TTL` columns. Complex types expose each component as its own input, so you never need to remember the underlying format:

| Type  | Fields                              | Example values                          |
| ----- | ----------------------------------- | --------------------------------------- |
| A     | Address                             | `10.0.0.5`                              |
| AAAA  | Address                             | `2001:db8::1`                           |
| CNAME | Target                              | `api.internal`                          |
| NS    | Name server                         | `ns1.internal`                          |
| PTR   | Target                              | `host.internal`                         |
| MX    | Priority, Mail server               | `10`, `mail.internal`                   |
| SRV   | Priority, Weight, Port, Target      | `10`, `60`, `5060`, `sip.internal`      |
| TXT   | Text                                | `hello world`                           |

DevNS composes these fields into the canonical record value when writing and parses the stored value back into fields when reading. The JSON file therefore stays in the standard space-separated form:

```json
{ "name": "dev.local", "type": "MX", "value": "10 mail.internal" }
```

Records saved with a pre-composed `value` (for example, hand-edited files) are still parsed into fields when loaded.

Custom records take precedence over the hosts file and the system resolver. Wildcards are supported: a record named `*.dev.local` answers any single-or-multi-label subdomain such as `foo.dev.local`.

Records are persisted to `~/.devns/records.json` (override with `--records <path>`). Edits to that file made outside the UI are picked up automatically.

### Importing a hosts file

Click **Import hosts** in the UI and paste (or choose) a `/etc/hosts`-style file. IPv4 entries become `A` records and IPv6 entries become `AAAA` records. The parsed records are added to the table so you can review them before saving.

```
127.0.0.1   api.dev.local web.dev.local
::1         api.dev.local
```

## Technical Details

- **Protocol**: UDP and TCP (RFC 7766), on the same port
- **EDNS(0)**: Advertised UDP payload size is honored (up to 4096 bytes), so large TXT records such as DKIM keys fit without truncation
- **TCP Fallback**: Answers too large for UDP are served over TCP with the standard 2-byte length prefix
- **TXT Records**: Values longer than 255 bytes are split into multiple DNS character-strings automatically
- **Recursive Resolver**: Sets RA flag and copies RD from requests
- **Error Handling**: Returns appropriate DNS response codes (NXDOMAIN, SERVFAIL, etc.)
- **Logging**: Clean console output with server status and query information

## Requirements

- Node.js 16.0.0 or higher
- UDP and TCP port access (port 53 for standard DNS, or any available port for development)

## Security Notes

- Running on port 53 requires elevated privileges (sudo/admin access)
- The server responds to both UDP and TCP DNS queries on the same port
- Hosts file entries take precedence over external DNS resolution
- No authentication or access control - ensure proper firewall configuration

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
