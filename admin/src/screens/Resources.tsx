import { oneOf, usePersistentState } from "../persist"
import type { Source } from "../types"
import { Discovery } from "./Discovery"
import { Explore } from "./Explore"
import { Sources } from "./Sources"

export type ResourcePane = "discovery" | "explore" | "sources"

const PANES: Array<{ id: ResourcePane; label: string }> = [
  { id: "discovery", label: "Discovery" },
  { id: "explore", label: "Исследовать" },
  { id: "sources", label: "Источники" },
]

export function Resources({
  onOpenCompanyJobs,
  onOpenSourceJobs,
}: {
  onOpenCompanyJobs: (company: { company_key: string }) => void
  onOpenSourceJobs: (source: Source) => void
}) {
  const [pane, setPane] = usePersistentState<ResourcePane>(
    "resources.pane",
    "discovery",
    oneOf("discovery", "explore", "sources"),
  )

  return (
    <>
      <div className="subtabs" role="tablist" aria-label="Ресурсы">
        {PANES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="subtab"
            id={`resources-tab-${item.id}`}
            aria-selected={pane === item.id}
            aria-controls={`resources-panel-${item.id}`}
            onClick={() => setPane(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="resources-panel"
        role="tabpanel"
        id={`resources-panel-${pane}`}
        aria-labelledby={`resources-tab-${pane}`}
      >
        {pane === "discovery" ? <Discovery onOpenJobs={onOpenCompanyJobs} /> : null}
        {pane === "explore" ? <Explore onOpenJobs={onOpenCompanyJobs} /> : null}
        {pane === "sources" ? <Sources onOpenJobs={onOpenSourceJobs} /> : null}
      </div>
    </>
  )
}
