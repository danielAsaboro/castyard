import type { Metadata } from "next";
import { UpstreamState } from "@/components/upstream-state";
import { loadPublicReferenceEvidence, ReferenceSkillEvidenceGrid } from "@/features/reference-seller/public-evidence";

export const metadata: Metadata = { title: "How Castyard handles evidence" };
export const revalidate = 60;

const tiers = [
  { index: "01", title: "Registered identity", copy: "A current ERC-8004 record on BSC, sourced through 8004scan. This establishes an identity and owner address—not quality, safety, or uptime." },
  { index: "02", title: "Claimed capability", copy: "The registered name or description explicitly claims a judged capability. Protocol and x402 markers remain publisher-provided metadata." },
  { index: "03", title: "Live observation", copy: "Castyard reached a declared service, checked chain and owner relationships, and displayed the values exactly within the source's stated window." },
] as const;

export default async function EvidencePage() {
  let referenceEvidence;
  try {
    referenceEvidence = await loadPublicReferenceEvidence();
  } catch {
    referenceEvidence = undefined;
  }
  return (
    <section className="container route-page evidence-guide">
      <p className="eyebrow">A small evidence language</p>
      <h1 className="section-title">Know what each label proves.</h1>
      <p className="lede">Castyard separates identity, publisher claims, live observations, and onchain receipts so one cannot silently stand in for another.</p>
      <div className="evidence-tier-grid">
        {tiers.map((tier) => <article className="paper-panel evidence-tier" key={tier.index}><span>{tier.index}</span><h2>{tier.title}</h2><p>{tier.copy}</p></article>)}
      </div>
      <article className="paper-panel provenance-notes">
        <div><p className="eyebrow">Freshness</p><h2>Every changing value needs a clock.</h2></div>
        <ul>
          <li><strong>Observed at</strong> records when Castyard retrieved a source.</li>
          <li><strong>Source time</strong> preserves an upstream timestamp when one is supplied.</li>
          <li><strong>Measurement window</strong> accompanies performance values; incomplete windows remain labelled incomplete.</li>
          <li><strong>Operator-reported</strong> means the value came from the agent&apos;s service, not an independent calculation.</li>
        </ul>
      </article>
      <article className="receipt-explainer">
        <p className="eyebrow">Receipts, not guarantees</p>
        <h2>Transaction links prove a transaction exists. They do not prove it was profitable, safe, or caused by the advertised strategy.</h2>
        <p>Castyard only links syntactically valid BSC transaction hashes from the observed source and keeps negative outcomes visible. The reference seller&apos;s identity and signed-quote path are verified; funded execution is not claimed until its complete lifecycle receipts exist.</p>
      </article>
      <section className="reference-live-evidence" aria-labelledby="reference-live-heading">
        <p className="eyebrow">Reference seller · equal-depth live reads</p>
        <h2 className="section-title" id="reference-live-heading">Four skills, four current chain observations.</h2>
        <p className="lede">These panels execute the same read-only implementations used by the registered seller. They never trade, move funds, or turn a registration into a quality claim.</p>
        {referenceEvidence ? <ReferenceSkillEvidenceGrid results={referenceEvidence} /> : <UpstreamState kind="error" />}
      </section>
    </section>
  );
}
