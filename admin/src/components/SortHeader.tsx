export function SortHeader<T extends string>({
  column,
  label,
  sort,
  dir,
  onSort,
  className,
  title,
}: {
  column: T
  label: string
  sort: T
  dir: "asc" | "desc"
  onSort: (column: T) => void
  className?: string
  title?: string
}) {
  const active = sort === column
  return (
    <th className={className} title={title} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`th-sort ${active ? "is-active" : ""}`} onClick={() => onSort(column)}>
        {label}
        <span className="th-arrow" aria-hidden>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  )
}
