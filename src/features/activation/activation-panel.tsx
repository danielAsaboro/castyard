"use client";

import { useState, type FormEvent } from "react";
import { formatUnits, type Address } from "viem";

import { verifySignedQuote, type ReferenceSellerTask, type SignedQuote } from "./quote";

type Skill = ReferenceSellerTask["skill"];

const skillOptions: { value: Skill; label: string }[] = [
  { value: "rebalancing", label: "Rebalancing" },
  { value: "grid-trading", label: "Grid trading" },
  { value: "yield-optimisation", label: "Yield optimisation" },
  { value: "health-factor-monitoring", label: "Health-factor monitoring" },
];

function requiredString(data: FormData, key: string): string {
  const value = String(data.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requiredNumber(data: FormData, key: string): number {
  const value = Number(requiredString(data, key));
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function taskFromForm(skill: Skill, data: FormData): unknown {
  switch (skill) {
    case "rebalancing":
      return {
        skill,
        parameters: {
          poolAddress: requiredString(data, "poolAddress"),
          rangeWidthBps: requiredNumber(data, "rangeWidthBps"),
        },
      };
    case "grid-trading":
      return {
        skill,
        parameters: {
          poolAddress: requiredString(data, "poolAddress"),
          lowerPrice: requiredNumber(data, "lowerPrice"),
          upperPrice: requiredNumber(data, "upperPrice"),
          levels: requiredNumber(data, "levels"),
        },
      };
    case "yield-optimisation":
      return {
        skill,
        parameters: {
          markets: requiredString(data, "markets").split(/[\s,]+/).filter(Boolean),
        },
      };
    case "health-factor-monitoring":
      return {
        skill,
        parameters: {
          comptrollerAddress: requiredString(data, "comptrollerAddress"),
          account: requiredString(data, "account"),
        },
      };
  }
}

function extractQuote(value: unknown): SignedQuote {
  const body = value as {
    error?: { message?: unknown };
    result?: { message?: { parts?: Array<{ data?: { action?: unknown; quote?: unknown } }> } };
  };
  if (body.error) throw new Error(typeof body.error.message === "string" ? body.error.message : "Quote request failed");
  const part = body.result?.message?.parts?.find((entry) => entry.data?.action === "quote");
  if (!part?.data?.quote || typeof part.data.quote !== "object") throw new Error("Seller returned no signed quote");
  return part.data.quote as SignedQuote;
}

function SkillFields({ skill }: { skill: Skill }) {
  if (skill === "rebalancing") {
    return <>
      <label>PancakeSwap V3 pool<input name="poolAddress" required placeholder="0x…" /></label>
      <label>Target range width (bps)<input name="rangeWidthBps" required min="1" max="10000" type="number" /></label>
    </>;
  }
  if (skill === "grid-trading") {
    return <>
      <label>PancakeSwap V3 pool<input name="poolAddress" required placeholder="0x…" /></label>
      <label>Lower price<input name="lowerPrice" required min="0" step="any" type="number" /></label>
      <label>Upper price<input name="upperPrice" required min="0" step="any" type="number" /></label>
      <label>Grid levels<input name="levels" required min="2" max="100" type="number" /></label>
    </>;
  }
  if (skill === "yield-optimisation") {
    return <label className="activation-wide">Venus market addresses<textarea name="markets" required placeholder="One to twenty 0x… addresses, separated by commas" /></label>;
  }
  return <>
    <label>Comptroller address<input name="comptrollerAddress" required placeholder="0x…" /></label>
    <label>Account to inspect<input name="account" required placeholder="0x…" /></label>
  </>;
}

export function ActivationPanel({ agentId, expectedProvider }: { agentId: string; expectedProvider: Address }) {
  const [skill, setSkill] = useState<Skill>("rebalancing");
  const [quote, setQuote] = useState<SignedQuote>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setQuote(undefined);
    try {
      const task = taskFromForm(skill, new FormData(event.currentTarget));
      const response = await fetch("/api/reference-seller/a2a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "castyard-quote",
          method: "message/send",
          params: {
            message: {
              messageId: crypto.randomUUID(),
              role: "ROLE_USER",
              parts: [{ data: { action: "quote", task } }],
            },
          },
        }),
      });
      const body = await response.json();
      const received = extractQuote(body);
      const verified = await verifySignedQuote(received, {
        expectedProvider,
        now: Math.floor(Date.now() / 1000),
        usedNonces: new Set(),
      });
      if (verified.agentId !== agentId) throw new Error("Quote agent does not match this passport");
      setQuote(verified);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quote request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="activation-panel paper-panel" aria-labelledby="activation-heading">
      <div className="activation-panel-heading">
        <div>
          <p className="eyebrow">Activation · quote review</p>
          <h2 id="activation-heading">Define a read-only job</h2>
        </div>
        <span className="activation-network">BSC testnet · ERC-8183</span>
      </div>
      <p className="activation-intro">
        Requesting a quote does not connect a wallet or move funds. Castyard verifies the seller signature,
        registered provider, task commitment, payment token, amount, and expiry before showing terms.
      </p>
      <form className="activation-form" onSubmit={requestQuote}>
        <label className="activation-wide">Analysis skill
          <select value={skill} onChange={(event) => { setSkill(event.target.value as Skill); setQuote(undefined); setError(undefined); }}>
            {skillOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <SkillFields skill={skill} />
        <div className="activation-wide activation-submit-row">
          <button className="button-primary" disabled={loading} type="submit">{loading ? "Verifying…" : "Get signed quote"}</button>
          <span>10-minute quote · exact task commitment · no trade execution</span>
        </div>
      </form>
      {error ? <p className="activation-error" role="alert">{error}</p> : null}
      {quote ? (
        <div className="quote-review" aria-live="polite">
          <div className="quote-review-title"><strong>Signature verified</strong><span>Expires {new Date(quote.expiresAt * 1000).toLocaleTimeString()}</span></div>
          <dl>
            <div><dt>Price</dt><dd>{formatUnits(BigInt(quote.amount), 18)} U</dd></div>
            <div><dt>Provider</dt><dd>{quote.provider}</dd></div>
            <div><dt>Payment token</dt><dd>{quote.paymentToken}</dd></div>
            <div><dt>Task commitment</dt><dd>{quote.taskCommitment}</dd></div>
          </dl>
          <p>
            The quote is ready for the standard create → register → budget → approve → fund lifecycle.
            Browser wallet writes remain unavailable until that path has its own verified end-to-end receipt.
          </p>
        </div>
      ) : null}
    </section>
  );
}
