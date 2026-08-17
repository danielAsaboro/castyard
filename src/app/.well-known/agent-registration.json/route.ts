import { env } from "cloudflare:workers";

import { createReferenceSellerRegistration } from "@/features/reference-seller/a2a";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agentId = typeof env.REFERENCE_SELLER_AGENT_ID === "string"
    ? env.REFERENCE_SELLER_AGENT_ID
    : undefined;
  if (!agentId) {
    return Response.json({ error: "ERC-8004 registration is not configured" }, { status: 503 });
  }
  return Response.json(createReferenceSellerRegistration(new URL(request.url).origin, agentId), {
    headers: { "cache-control": "public, max-age=60" },
  });
}
