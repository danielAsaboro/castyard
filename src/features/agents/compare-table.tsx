import Link from "next/link";

import { EvidenceBadge } from "@/components/evidence-badge";
import type { Comparison } from "./compare";

export function CompareTable({ comparison }: { comparison: Comparison }) {
  return (
    <div className="comparison-scroll">
      <table className="comparison-table" aria-label="Agent evidence comparison">
        <thead>
          <tr>
            <th scope="col">Evidence field</th>
            {comparison.agents.map((agent) => (
              <th scope="col" key={agent.identity.agentId}>
                <Link href={`/agents/${agent.identity.agentId}`}>{agent.identity.name}</Link>
                <span>Agent #{agent.identity.erc8004AgentTokenId}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row"><strong>{row.label}</strong><span>{row.definition}</span></th>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${comparison.agents[index].identity.agentId}`}>
                  <EvidenceBadge state={cell.evidenceState} />
                  <p>{cell.value}</p>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
