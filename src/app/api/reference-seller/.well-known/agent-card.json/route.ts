import { env } from "cloudflare:workers";

import { createReferenceSellerCard } from "@/features/reference-seller/a2a";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agentId = typeof env.REFERENCE_SELLER_AGENT_ID === "string"
    ? env.REFERENCE_SELLER_AGENT_ID
    : undefined;
  return Response.json(createReferenceSellerCard(new URL(request.url).origin, agentId), {
    headers: { "cache-control": "public, max-age=60" },
  });
}
