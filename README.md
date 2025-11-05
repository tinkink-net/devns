# DevNS

DevNS is a lightweight local DNS server for development purposes, it listens on UDP port 53 (configurable) and answers DNS queries by resolving them via Node's built-in `dns` module, with support for local hosts file overrides.

> DevNS is developed by AI. Also a [Tinkink](https://tink.ink) project.

## Features

- **Lightweight & Fast**: Minimal dependencies, built on Node.js built-in modules
- **UDP DNS Server**: Listens for DNS queries on configurable UDP port
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
  -p, --port <port>   UDP port to listen on (default: 53)
  -H, --host <host>   Host/IP to bind (default: 0.0.0.0)
  --ttl <seconds>     TTL for synthesized answers (default: 300)
  -h, --help          Show help
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

## Technical Details

- **Protocol**: UDP (TCP not supported)
- **Maximum Response Size**: 512 bytes (no EDNS support)
- **Recursive Resolver**: Sets RA flag and copies RD from requests
- **Error Handling**: Returns appropriate DNS response codes (NXDOMAIN, SERVFAIL, etc.)
- **Logging**: Clean console output with server status and query information

## Requirements

- Node.js 16.0.0 or higher
- UDP port access (port 53 for standard DNS, or any available port for development)

## Security Notes

- Running on port 53 requires elevated privileges (sudo/admin access)
- The server only responds to UDP DNS queries and doesn't support TCP
- Hosts file entries take precedence over external DNS resolution
- No authentication or access control - ensure proper firewall configuration

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
