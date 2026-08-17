import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentPassportNotFoundError, loadAgentPassport } from "@/features/agents/passport";
import { PassportView } from "@/features/agents/passport-view";

export const revalidate = 30;

function decodeAgentId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function getPassport(rawAgentId: string) {
  try {
    return await loadAgentPassport(decodeAgentId(rawAgentId));
  } catch (error) {
    if (error instanceof AgentPassportNotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ agentId: string }> }): Promise<Metadata> {
  const { agentId } = await params;
  const passport = await getPassport(agentId);
  const title = `${passport.identity.name} Agent Passport`;
  const description = passport.identity.description || "Live BSC ERC-8004 Agent Passport.";
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function AgentPassportPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return (
    <section className="container route-page">
      <PassportView passport={await getPassport(agentId)} />
    </section>
  );
}
