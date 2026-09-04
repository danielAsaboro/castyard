"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatUnits, getAddress, type Address } from "viem";

import {
  advanceBrowserActivation,
  cancelOpenBrowserActivation,
  claimExpiredBrowserActivationRefund,
  nextBrowserActivationAction,
  reconcileExpiredBrowserActivation,
  type BrowserActivationDependencies,
  type BrowserActivationReceipt,
} from "./browser-lifecycle";
import {
  browserActivationReceiptFilename,
  connectBrowserActivation,
  createInitialBrowserReceipt,
  loadBrowserActivationReceipt,
  saveBrowserActivationReceipt,
  serializeBrowserActivationReceipt,
} from "./browser-wallet";
import { verifySignedQuote, type ReferenceSellerTask, type SignedQuote } from "./quote";

type Skill = ReferenceSellerTask["skill"];

const skillOptions: { value: Skill; label: string }[] = [
  { value: "rebalancing", label: "Rebalancing" },
  { value: "grid-trading", label: "Grid trading" },
  { value: "yield-optimisation", label: "Yield optimisation" },
  { value: "health-factor-monitoring", label: "Health-factor monitoring" },
];

const VERIFIED_EXAMPLES = {
  pancakePool: "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df",
  venusMarket: "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7",
  venusComptroller: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  account: "0x74258A428e94294F14a8c8308CE21259223A0187",
} as const;

const actionLabels = {
  createJob: "1. Create ERC-8183 job",
  registerJob: "2. Register evaluation policy",
  setBudget: "3. Set exact job budget",
  approve: "4. Approve exact U amount",
  fund: "5. Fund escrow",
  notifySeller: "6. Notify seller and verify delivery",
  waitToSettle: "7. Settle after dispute window",
  complete: "Lifecycle complete",
  recover: "Reconcile router after refund",
} as const;

function hasActiveOnchainJob(receipt: BrowserActivationReceipt | undefined): boolean {
  return Boolean(receipt && receipt.stage !== "quoted"
    && !["completed", "cancelled", "refunded", "failed"].includes(receipt.stage));
}

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
      <label>PancakeSwap V3 pool<input defaultValue={VERIFIED_EXAMPLES.pancakePool} name="poolAddress" required placeholder="0x…" /></label>
      <label>Target range width (bps)<input defaultValue="1000" name="rangeWidthBps" required min="1" max="10000" type="number" /></label>
    </>;
  }
  if (skill === "grid-trading") {
    return <>
      <label>PancakeSwap V3 pool<input defaultValue={VERIFIED_EXAMPLES.pancakePool} name="poolAddress" required placeholder="0x…" /></label>
      <label>Lower price<input defaultValue="0.9" name="lowerPrice" required min="0" step="any" type="number" /></label>
      <label>Upper price<input defaultValue="1.1" name="upperPrice" required min="0" step="any" type="number" /></label>
      <label>Grid levels<input defaultValue="5" name="levels" required min="2" max="100" type="number" /></label>
    </>;
  }
  if (skill === "yield-optimisation") {
    return <label className="activation-wide">Venus market addresses<textarea defaultValue={VERIFIED_EXAMPLES.venusMarket} name="markets" required placeholder="One to twenty 0x… addresses, separated by commas" /></label>;
  }
  return <>
    <label>Comptroller address<input defaultValue={VERIFIED_EXAMPLES.venusComptroller} name="comptrollerAddress" required placeholder="0x…" /></label>
    <label>Account to inspect<input defaultValue={VERIFIED_EXAMPLES.account} name="account" required placeholder="0x…" /></label>
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
        // Once createJob has a confirmed receipt, the quote is historical evidence:
        // re-check its signature at the validity boundary, then let the lifecycle's
        // authoritative onchain reads decide which recovery/write actions are safe.
        const anchoredOnchain = restored.stage !== "quoted";
        const verifyAt = anchoredOnchain
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
    if (hasActiveOnchainJob(receipt)) {
      setError("Finish, cancel, or refund the active job before requesting another quote.");
      return;
    }
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
      const nextReceipt = receipt.stage === "refundClaimed"
        ? await reconcileExpiredBrowserActivation(receipt, walletDependencies)
        : await advanceBrowserActivation(receipt, walletDependencies);
      saveBrowserActivationReceipt(nextReceipt);
      setReceipt(nextReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERC-8183 activation step failed");
    } finally {
      setLoading(false);
    }
  }

  async function cancelLifecycle() {
    if (!receipt || !walletDependencies) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextReceipt = await cancelOpenBrowserActivation(receipt, walletDependencies);
      saveBrowserActivationReceipt(nextReceipt);
      setReceipt(nextReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERC-8183 cancellation failed");
    } finally {
      setLoading(false);
    }
  }

  async function claimRefund() {
    if (!receipt || !walletDependencies) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextReceipt = await claimExpiredBrowserActivationRefund(receipt, walletDependencies);
      saveBrowserActivationReceipt(nextReceipt);
      setReceipt(nextReceipt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERC-8183 refund failed");
    } finally {
      setLoading(false);
    }
  }

  const nextAction = receipt ? nextBrowserActivationAction(receipt) : undefined;
  const activeOnchainJob = hasActiveOnchainJob(receipt);
  const settlementReady = nextAction !== "waitToSettle"
    || (receipt?.settleAfter && currentTime
      ? BigInt(Math.floor(currentTime / 1_000)) > BigInt(receipt.settleAfter)
      : false);
  const currentUnix = currentTime ? BigInt(Math.floor(currentTime / 1_000)) : undefined;
  const quoteExpired = currentUnix !== undefined && currentUnix > BigInt(quote?.expiresAt ?? 0);
  const canCancel = receipt ? ["open", "registered", "budgeted", "approved"].includes(receipt.stage) : false;
  const refundReady = receipt?.stage === "funded" && receipt.expiredAt && currentUnix !== undefined
    ? currentUnix > BigInt(receipt.expiredAt)
    : false;
  const primaryDisabled = loading || !settlementReady || (Boolean(receipt) && quoteExpired
    && !["submitted", "refundClaimed", "completed", "cancelled", "refunded"].includes(receipt.stage));

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
        registered provider, task commitment, payment token, amount, and expiry before showing terms. Each skill
        starts with a verified BSC testnet example that you can replace.
      </p>
      <form className="activation-form" onSubmit={requestQuote}>
        <label className="activation-wide">Analysis skill
          <select value={skill} onChange={(event) => { setSkill(event.target.value as Skill); setQuote(undefined); setError(undefined); }}>
            {skillOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <SkillFields key={skill} skill={skill} />
        <div className="activation-wide activation-submit-row">
          <button className="button-primary" disabled={loading || activeOnchainJob} type="submit">{loading ? "Verifying…" : "Get signed quote"}</button>
          <span>10-minute quote · exact task commitment · no trade execution</span>
        </div>
      </form>
      {activeOnchainJob ? <p>Finish, cancel, or refund the active job before requesting another quote.</p> : null}
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
          <p className="activation-funding-help">
            Live writes require your own funded BSC testnet wallet. The browser path has passed a read-only live
            contract preflight; Castyard does not claim a completed browser lifecycle until its receipts exist. Funds:
            {" "}<a href="https://www.bnbchain.org/en/testnet-faucet" rel="noreferrer" target="_blank">tBNB faucet</a>
            {" · "}<a href="https://united-coin-u.github.io/u-faucet/" rel="noreferrer" target="_blank">official U faucet</a>.
          </p>
          {!receipt || !walletDependencies ? (
            <button className="button-primary activation-wallet-button" disabled={loading} onClick={connectWallet} type="button">
              {receipt ? "Reconnect wallet to resume" : "Connect wallet and start"}
            </button>
          ) : nextAction && nextAction !== "complete" ? (
            <button
              className="button-primary activation-wallet-button"
              disabled={primaryDisabled || refundReady}
              onClick={advanceLifecycle}
              type="button"
            >
              {loading ? "Waiting for confirmation…" : actionLabels[nextAction]}
            </button>
          ) : null}
          {receipt && walletDependencies && canCancel ? (
            <button className="button-secondary activation-wallet-button" disabled={loading} onClick={cancelLifecycle} type="button">
              Cancel unfunded job
            </button>
          ) : null}
          {receipt && walletDependencies && refundReady ? (
            <button className="button-secondary activation-wallet-button" disabled={loading} onClick={claimRefund} type="button">
              Claim expired escrow refund
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
              {receipt.expiredAt ? <span>Job expiry {new Date(Number(receipt.expiredAt) * 1_000).toLocaleString()}</span> : null}
              {quoteExpired && canCancel ? <span>The quote expired. Cancel this unfunded job before requesting a new quote.</span> : null}
              <ol>
                {Object.entries(receipt.transactions).map(([step, hash]) => (
                  <li key={step}>
                    <span>{step}</span>
                    <a href={`https://testnet.bscscan.com/tx/${hash}`} rel="noreferrer" target="_blank">{hash}</a>
                  </li>
                ))}
              </ol>
              <a
                className="button-secondary"
                download={browserActivationReceiptFilename(receipt)}
                href={`data:application/json;charset=utf-8,${encodeURIComponent(serializeBrowserActivationReceipt(receipt))}`}
              >
                Download receipt JSON
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
