# LuxeOracle MCP Server

An MCP (Model Context Protocol) server that gives AI agents the ability to monitor real-time luxury goods inventory on Hermès.

Powered by [x402](https://x402.org) — agents pay per query with USDC, zero gas.

## Quick Start

### Claude Desktop / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "luxeoracle": {
      "command": "npx",
      "args": ["-y", "@luxeoracle/mcp-server"],
      "env": {
        "LUXEORACLE_PRIVATE_KEY": "0x_YOUR_WALLET_PRIVATE_KEY"
      }
    }
  }
}
```

> The private key is used to sign x402 payments (EIP-3009, off-chain, zero gas).  
> Your wallet needs USDC on Base Sepolia. No ETH required.

## Tools

| Tool | Cost | Description |
|---|---|---|
| `browse_inventory` | Free | Browse available products and get product IDs |
| `check_stock` | $0.005 USDC | Check stock status for a specific product by ID |
| `buy_session` | $1.00 USDC | Purchase 200 queries at bulk rate |

## Usage Example

**Agent → "What Hermès bags are available in Taiwan right now?"**

1. Agent calls `browse_inventory(brand="hermes", region="tw")` → gets a list of product IDs (free)
2. Agent calls `check_stock(region="tw", brand="hermes", id="H086962CK0G")` → gets stock status ($0.005)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LUXEORACLE_PRIVATE_KEY` | For paid tools | Wallet private key for x402 payments |
| `LUXEORACLE_BASE_URL` | No | API base URL (default: `https://luxe-oracle.com`) |

## Development

```bash
git clone https://github.com/modely6307-glitch/luxe-oracle-mcp.git
cd luxe-oracle-mcp
npm install
npm run dev
```

## License

MIT
