#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.LUXEORACLE_BASE_URL || 'https://luxe-oracle.com';
const PRIVATE_KEY = process.env.LUXEORACLE_PRIVATE_KEY || '';

// ---------------------------------------------------------------------------
// x402 payment wrapper — lazily initialized
// ---------------------------------------------------------------------------
let _fetchWithPayment: typeof fetch | null = null;

async function getFetchWithPayment(): Promise<typeof fetch> {
  if (_fetchWithPayment) return _fetchWithPayment;

  if (!PRIVATE_KEY) {
    throw new Error(
      'LUXEORACLE_PRIVATE_KEY is not set. Paid endpoints require a wallet private key for x402 payments. ' +
      'Set it in your environment: export LUXEORACLE_PRIVATE_KEY=0x...'
    );
  }

  const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch');
  const { ExactEvmScheme } = await import('@x402/evm/exact/client');
  const { privateKeyToAccount } = await import('viem/accounts');

  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const client = new x402Client();
  client.register('eip155:*', new ExactEvmScheme(account));
  _fetchWithPayment = wrapFetchWithPayment(fetch, client);
  return _fetchWithPayment;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: 'luxeoracle',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tool: browse_inventory (FREE)
// ---------------------------------------------------------------------------
server.registerTool(
  'browse_inventory',
  {
    title: 'Browse Inventory',
    description:
      'Browse available luxury products on the Hermès shelf. ' +
      'Call without region to list supported regions. ' +
      'Call with region to get product IDs you can pass to check_stock. ' +
      'This tool is FREE — no payment required.',
    inputSchema: z.object({
      brand: z.string().default('hermes').describe('Brand to query (default: hermes)'),
      region: z.string().optional().describe('Region code (e.g. tw, sg). Omit to list supported regions.'),
    }),
  },
  async ({ brand, region }) => {
    const params = new URLSearchParams({ brand });
    if (region) params.set('region', region);

    const res = await fetch(`${BASE_URL}/api/v1/inventory?${params}`);
    const data = await res.json();

    if (!region) {
      return {
        content: [{
          type: 'text' as const,
          text: `Supported regions for ${brand}: ${data.supported_regions?.join(', ') || 'none'}.\n` +
                `Call again with a region parameter to see available products.`,
        }],
      };
    }

    const items = data.items || [];
    if (items.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No items found for ${brand} in ${region}. The cache may still be warming up.`,
        }],
      };
    }

    const listing = items
      .map((item: { id: string; name: string; link: string }, i: number) =>
        `[${i}] ${item.id} — ${item.name}\n    ${item.link}`
      )
      .join('\n');

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${data.count} products for ${brand} in ${region}:\n\n${listing}\n\n` +
              `Use the product ID (e.g. ${items[0].id}) with the check_stock tool to query availability.`,
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: check_stock (PAID — $0.005 USDC via x402)
// ---------------------------------------------------------------------------
server.registerTool(
  'check_stock',
  {
    title: 'Check Stock',
    description:
      'Check real-time stock status for a specific Hermès product by ID. ' +
      'The product ID must come from browse_inventory first. ' +
      'COST: $0.005 USDC per query (paid automatically via x402, zero gas).',
    inputSchema: z.object({
      region: z.string().describe('Region code (e.g. tw, sg)'),
      brand: z.string().default('hermes').describe('Brand name (default: hermes)'),
      id: z.string().describe('Product ID from browse_inventory (e.g. H086962CK0G)'),
    }),
  },
  async ({ region, brand, id }) => {
    const paidFetch = await getFetchWithPayment();
    const res = await paidFetch(`${BASE_URL}/api/v1/monitor/${region}/${brand}/${id}`);
    const data = await res.json();

    if (res.status === 404) {
      return {
        content: [{
          type: 'text' as const,
          text: `Product "${id}" not found. Use browse_inventory to see valid IDs for ${brand} in ${region}.`,
        }],
      };
    }

    if (res.status === 503) {
      return {
        content: [{
          type: 'text' as const,
          text: `Data for "${id}" is still being collected. Please try again in a few hours.`,
        }],
      };
    }

    if (data.status !== 'ok') {
      return {
        content: [{
          type: 'text' as const,
          text: `Unexpected response: ${JSON.stringify(data)}`,
        }],
      };
    }

    const stockEmoji = data.in_stock ? '✅ IN STOCK' : '❌ OUT OF STOCK';
    return {
      content: [{
        type: 'text' as const,
        text: `${stockEmoji}\n\n` +
              `Product: ${data.metadata?.title || id}\n` +
              `Region: ${data.region}\n` +
              `Last updated: ${data.last_update}\n` +
              `Source: ${data.metadata?.source_url || 'N/A'}`,
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: buy_session (PAID — $1.00 USDC via x402)
// ---------------------------------------------------------------------------
server.registerTool(
  'buy_session',
  {
    title: 'Buy Session',
    description:
      'Purchase a pre-paid session key for 200 queries at a discounted bulk rate. ' +
      'COST: $1.00 USDC (= $0.005/query × 200). ' +
      'Returns a session token you can set as LUXEORACLE_SESSION_KEY for future queries.',
    inputSchema: z.object({}),
  },
  async () => {
    const paidFetch = await getFetchWithPayment();
    const res = await paidFetch(`${BASE_URL}/api/v1/sessions`, { method: 'POST' });
    const data = await res.json();

    if (res.status === 201 || data.sessionToken) {
      return {
        content: [{
          type: 'text' as const,
          text: `Session purchased successfully!\n\n` +
                `Session Token: ${data.sessionToken}\n` +
                `Credits: ${data.credits}\n` +
                `Expires: ${data.expiresAt}\n\n` +
                `Set this as your LUXEORACLE_SESSION_KEY environment variable to use session-based auth.`,
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `Failed to purchase session: ${JSON.stringify(data)}`,
      }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
