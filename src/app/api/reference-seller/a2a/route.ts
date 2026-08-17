import { env } from "cloudflare:workers";
import { isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { handleA2aRequest } from "@/features/reference-seller/a2a";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return Response.json({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32002, message },
  }, { status: 503, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_768) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large" } }, { status: 413 });
  }

  const agentId = env.REFERENCE_SELLER_AGENT_ID;
  const privateKey = env.REFERENCE_SELLER_PRIVATE_KEY;
  if (typeof agentId !== "string" || !agentId) return unavailable("Reference seller is not registered yet");
  if (typeof privateKey !== "string" || !isHex(privateKey, { strict: true }) || privateKey.length !== 66) {
    return unavailable("Reference seller signing service is unavailable");
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 32_768) throw new Error("Request body too large");
    body = JSON.parse(text);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const response = await handleA2aRequest(body, {
    account: privateKeyToAccount(privateKey),
    agentId,
  });
  return Response.json(response, { headers: { "cache-control": "no-store" } });
}
