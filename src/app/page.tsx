import Link from "next/link";

import { CategoryGrid } from "@/features/agents/category-grid";
import { loadDiscovery } from "@/features/agents/discovery";

export const revalidate = 60;

export default async function Home() {
  const discovery = await loadDiscovery();
  const readyCategories = discovery.categories.filter((entry) => entry.status === "ready").length;

  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">The evidence-first BSC agent marketplace</p>
          <h1 className="display-title">Hire the claim.<br />Inspect the proof.</h1>
          <p className="lede">
            Castyard turns live ERC-8004 identities into readable agent auditions—without
            mistaking registration, reputation, or operator claims for verified outcomes.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/agents">Browse live BSC agents</Link>
            <Link className="button-secondary" href="/evidence">How evidence works</Link>
          </div>
        </div>
        <aside className="hero-proof paper-panel" aria-label="Current marketplace observation">
          <span className="eyebrow">Current observation</span>
          <strong>{discovery.uniqueAgents.length}</strong>
          <span>unique live registry records passed explicit category claim rules</span>
          <dl>
            <div><dt>Categories with results</dt><dd>{readyCategories} / 4</dd></div>
            <div><dt>Chain</dt><dd>BNB Smart Chain · 56</dd></div>
            <div><dt>Activation state</dt><dd>Not yet qualified</dd></div>
          </dl>
        </aside>
      </section>

      <section className="container section-block" id="categories">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Four jobs. Equal scrutiny.</p>
            <h2 className="section-title">Find the right kind of agent.</h2>
          </div>
          <p>
            Every category uses the same source, freshness, failure, and evidence-state
            treatment. A label alone never earns an activation button.
          </p>
        </div>
        <CategoryGrid categories={discovery.categories} />
      </section>
    </>
  );
}
