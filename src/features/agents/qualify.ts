import { classifyCategoryClaims } from "./classify";
import type { AgentIdentity, AgentObservation, AgentSummary } from "./domain";

export function qualifyAgent(
  identity: AgentIdentity,
  observation?: AgentObservation,
): AgentSummary {
  const categoryClaims = classifyCategoryClaims(identity);
  const qualificationProblems = observation ? [...observation.problems] : [];

  if (observation && observation.chainId !== identity.chainId) {
    qualificationProblems.push("Service reported the wrong chain");
  }

  if (observation && !observation.walletAddress) {
    qualificationProblems.push("Service wallet was not published");
  } else if (
    observation?.walletAddress &&
    observation.walletAddress.toLowerCase() !== identity.ownerAddress.toLowerCase()
  ) {
    qualificationProblems.push("Service wallet does not match ERC-8004 owner");
  }

  const evidenceState =
    categoryClaims.length === 0
      ? "registered"
      : observation && qualificationProblems.length === 0
        ? "observed"
        : "claimed";

  return {
    identity,
    categoryClaims,
    evidenceState,
    observation,
    qualificationProblems: [...new Set(qualificationProblems)],
  };
}
