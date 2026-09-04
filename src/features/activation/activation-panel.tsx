"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatUnits, getAddress, type Address } from "viem";

import {
  advanceBrowserActivation,
  nextBrowserActivationAction,
  type BrowserActivationDependencies,
  type BrowserActivationReceipt,
} from "./browser-lifecycle";
import {
  connectBrowserActivation,
  createInitialBrowserReceipt,
  loadBrowserActivationReceipt,
  saveBrowserActivationReceipt,
} from "./browser-wallet";
import { verifySignedQuote, type ReferenceSellerTask, type SignedQuote } from "./quote";

type Skill = ReferenceSellerTask["skill"];

const skillOptions: { value: Skill; label: string }[] = [
  { value: "rebalancing", label: "Rebalancing" },
  { value: "grid-trading", label: "Grid trading" },
  { value: "yield-optimisation", label: "Yield optimisation" },
  { value: "health-factor-monitoring", label: "Health-factor monitoring" },
];

const actionLabels = {
  createJob: "1. Create ERC-8183 job",
  registerJob: "2. Register evaluation policy",
  setBudget: "3. Set exact job budget",
  approve: "4. Approve exact U amount",
  fund: "5. Fund escrow",
  notifySeller: "6. Notify seller and verify delivery",
  waitToSettle: "7. Settle after dispute window",
  complete: "Lifecycle complete",
  recover: "Recover from chain state",
} as const;

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
  const [receipt, setReceipt] = useState<BrowserActivationReceipt>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [walletDependencies, setWalletDependencies] = useState<BrowserActivationDependencies>();
  const [currentTime, setCurrentTime] = useState<number>();

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const restored = loadBrowserActivationReceipt(agentId);
      if (restored) {
        const submitted = restored.stage === "submitted" || restored.stage === "completed";
        const verifyAt = submitted
          ? Math.min(Math.floor(Date.now() / 1_000), restored.quote.expiresAt)
          : Math.floor(Date.now() / 1_000);
        void verifySignedQuote(restored.quote, {
          expectedProvider,
          now: verifyAt,
          usedNonces: new Set(),
        }).then((verified) => {
          if (verified.agentId !== agentId) throw new Error("Saved receipt agent does not match this passport");
          setReceipt({ ...restored, quote: verified });
          setQuote(verified);
        }).catch((caught) => {
          setError(caught instanceof Error ? `Saved receipt rejected: ${caught.message}` : "Saved receipt rejected");
        });
      }
    }, 0);
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => {
      window.clearTimeout(restoreTimer);
      window.clearInterval(clock);
    };
  }, [agentId, expectedProvider]);

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
      setReceipt(undefined);
      setWalletDependencies(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quote request failed");
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    if (!quote) return;
    setLoading(true);
    setError(undefined);
    try {
      const connected = await connectBrowserActivation(expectedProvider);
      const nextReceipt = receipt?.quote.nonce === quote.nonce
        ? receipt
        : createInitialBrowserReceipt(quote, connected.buyer);
      if (getAddress(nextReceipt.buyer) !== connected.buyer) {
        throw new Error(`Reconnect the original buyer wallet ${nextReceipt.buyer} to resume this receipt`);
      }
      setWalletDependencies(connected.dependencies);
      saveBrowserActivationReceipt(nextReceipt);
      setReceipt(nextReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Browser wallet connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function advanceLifecycle() {
    if (!receipt || !walletDependencies) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextReceipt = await advanceBrowserActivation(receipt, walletDependencies);
      saveBrowserActivationReceipt(nextReceipt);
      setReceipt(nextReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERC-8183 activation step failed");
    } finally {
      setLoading(false);
    }
  }

  const nextAction = receipt ? nextBrowserActivationAction(receipt) : undefined;
  const settlementReady = nextAction !== "waitToSettle"
    || (receipt?.settleAfter && currentTime
      ? BigInt(Math.floor(currentTime / 1_000)) > BigInt(receipt.settleAfter)
      : false);

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
            Each numbered write opens a separate browser-wallet approval. Castyard preflights the call and records
            only confirmed transaction receipts; the seller is notified only after escrow is funded.
          </p>
          {!receipt || !walletDependencies ? (
            <button className="button-primary activation-wallet-button" disabled={loading} onClick={connectWallet} type="button">
              {receipt ? "Reconnect wallet to resume" : "Connect wallet and start"}
            </button>
          ) : nextAction && nextAction !== "complete" ? (
            <button
              className="button-primary activation-wallet-button"
              disabled={loading || !settlementReady}
              onClick={advanceLifecycle}
              type="button"
            >
              {loading ? "Waiting for confirmation…" : actionLabels[nextAction]}
            </button>
          ) : null}
          {receipt ? (
            <div className="activation-receipt" aria-live="polite">
              <strong>Receipt state: {receipt.stage}</strong>
              <span>Buyer {receipt.buyer}</span>
              {receipt.jobId ? <span>ERC-8183 job #{receipt.jobId}</span> : null}
              {receipt.settleAfter && !settlementReady
                ? <span>Settlement unlocks after {new Date(Number(receipt.settleAfter) * 1_000).toLocaleString()}</span>
                : null}
              <ol>
                {Object.entries(receipt.transactions).map(([step, hash]) => (
                  <li key={step}>
                    <span>{step}</span>
                    <a href={`https://testnet.bscscan.com/tx/${hash}`} rel="noreferrer" target="_blank">{hash}</a>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
