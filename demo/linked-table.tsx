import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  SankeyGraph,
  SankeyInspection,
  SankeyPlacement,
  SankeySubject,
} from '../src/index.js';
import { resolveGraph } from '../src/model.js';
import './linked-table.css';

const format = (value: number, unit?: string) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit ?? 'units'}`;

const sameSubject = (a: SankeySubject | null | undefined, b: SankeySubject) =>
  !!a && a.kind === b.kind && a.key === b.key;

const placementLabel = (placement: SankeyPlacement) =>
  placement.stage !== undefined ? placement.stage : `Edge · ${placement.edge}`;

interface Row {
  subject: SankeySubject;
  name: string;
  kind: 'Node' | 'Link';
  placement: string;
  value: string;
  note: string;
  color: string;
  accessibleName: string;
}

const rowsFor = (graph: SankeyGraph): Row[] => {
  const resolved = resolveGraph(graph);
  const rows: Row[] = graph.nodes.map((node) => {
    const facts = resolved.nodes.get(node.key)!;
    let value: string;
    let note: string;
    if (node.total !== undefined) {
      value = format(node.total, graph.defaultUnit);
      note = 'declared total';
    } else if (node.totals && Object.keys(node.totals).length > 0) {
      value = Object.entries(node.totals)
        .map(([unit, total]) =>
          total === 'auto' ? `${unit}: auto` : format(total, unit),
        )
        .join(' · ');
      note =
        facts.totalSource === 'declared'
          ? 'declared total'
          : 'declared / automatic';
    } else {
      value = facts.totals.length
        ? facts.totals.map((row) => format(row.total, row.unit)).join(' · ')
        : format(facts.total, facts.unit ?? graph.defaultUnit);
      note = 'derived total';
    }
    const placement = placementLabel(node.placement);
    return {
      subject: { kind: 'node', key: node.key },
      name: node.title,
      kind: 'Node',
      placement,
      value,
      note,
      color: node.color ?? '#7b879b',
      accessibleName: `Node: ${node.title}, ${placement}, ${value} ${note}`,
    };
  });

  for (const link of graph.links) {
    const facts = resolved.links.get(link.key)!;
    const from = facts.fromNode;
    const to = facts.toNode;
    const placement = `${placementLabel(from.placement)} → ${placementLabel(to.placement)}`;
    const inputUnit = facts.input.unit ?? graph.defaultUnit;
    const outputUnit = facts.output.unit ?? graph.defaultUnit ?? inputUnit;
    const converted =
      facts.input.unit !== facts.output.unit || facts.conversionRate !== 1;
    const value = format(facts.input.amount, inputUnit);
    const note = converted
      ? `→ ${format(facts.output.amount, outputUnit)} output · rate ${facts.conversionRate}`
      : 'input amount';
    rows.push({
      subject: { kind: 'link', key: link.key },
      name: `${from.title} → ${to.title}`,
      kind: 'Link',
      placement,
      value,
      note,
      color: link.color ?? to.color ?? from.color ?? '#7b879b',
      accessibleName: `Link: ${from.title} → ${to.title}, ${placement}, ${value} ${note}`,
    });
  }

  return rows;
};

function LinkedRow({
  row,
  tableHover,
  tableFocus,
  tableActive,
  chartActive,
  onHover,
  onFocus,
  onDismiss,
  rowRef,
}: {
  row: Row;
  tableHover: boolean;
  tableFocus: boolean;
  tableActive: boolean;
  chartActive: boolean;
  onHover: (subject: SankeySubject | null) => void;
  onFocus: (subject: SankeySubject | null) => void;
  onDismiss: () => void;
  rowRef: (element: HTMLTableRowElement | null) => void;
}) {
  const active = tableActive || chartActive;
  return (
    <tr
      ref={rowRef}
      tabIndex={0}
      data-linked-row=""
      data-linked-kind={row.subject.kind}
      data-linked-key={row.subject.key}
      data-linked-active={active ? 'true' : 'false'}
      data-table-hover={tableHover ? 'true' : 'false'}
      data-table-focus={tableFocus ? 'true' : 'false'}
      data-table-active={tableActive ? 'true' : 'false'}
      data-chart-active={chartActive ? 'true' : 'false'}
      aria-label={row.accessibleName}
      aria-current={active ? 'true' : undefined}
      onMouseEnter={() => onHover(row.subject)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onFocus(row.subject)}
      onBlur={() => onFocus(null)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onDismiss();
      }}
    >
      <th scope="row">
        <span className="linked-table-subject">
          <span
            className="linked-table-dot"
            style={{ background: row.color }}
            aria-hidden="true"
          />
          <span>{row.name}</span>
        </span>
      </th>
      <td className="linked-table-kind-cell">
        <span className={`linked-table-kind ${row.subject.kind}`}>
          {row.kind}
        </span>
      </td>
      <td className="linked-table-placement">{row.placement}</td>
      <td className="linked-table-value">
        <strong>{row.value}</strong>
        <span>{row.note}</span>
      </td>
    </tr>
  );
}

export function LinkedTable({
  graph,
  highlight,
  onHighlightChange,
  inspection,
}: {
  readonly graph: SankeyGraph;
  readonly highlight: SankeySubject | null;
  readonly onHighlightChange: (subject: SankeySubject | null) => void;
  readonly inspection: SankeyInspection | null;
}) {
  const [hovered, setHovered] = useState<SankeySubject | null>(null);
  const [focused, setFocused] = useState<SankeySubject | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const rows = useMemo(() => rowsFor(graph), [graph]);
  const tableSubject = hovered ?? focused;
  const inspectionKey = inspection
    ? `${inspection.subject.kind}:${inspection.subject.key}`
    : null;
  const label = (subject: SankeySubject) =>
    rows.find((row) => sameSubject(subject, row.subject))?.name ?? subject.key;
  const inspectionStatus = inspection
    ? `${inspection.subject.kind === 'node' ? 'Node' : 'Link'} inspected: ${label(inspection.subject)} · ${inspection.modality}.`
    : 'No chart inspection.';

  useEffect(() => {
    onHighlightChange(tableSubject);
  }, [tableSubject, onHighlightChange]);

  useEffect(() => {
    // A scroll would dismiss an active pointer inspection, so only reveal
    // keyboard and touch inspections inside the table's own scroll area.
    if (!inspectionKey || inspection?.modality === 'pointer') return;
    const row = rowRefs.current.get(inspectionKey);
    if (!row) return;
    const x = window.scrollX;
    const y = window.scrollY;
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  }, [inspectionKey, inspection?.modality]);

  return (
    <section className="linked-table" data-linked-table="">
      <div className="linked-table-header">
        <div className="linked-table-copy">
          <div className="eyebrow">LINKED VIEWS</div>
          <h2>Flow inventory</h2>
          <p id="linked-table-instructions">
            Hover or focus a row to emphasize its one-hop neighborhood in the
            chart. Inspect a chart node or link to mark its row here. Selection
            stays independent.
          </p>
        </div>
        <div className="linked-table-state" aria-hidden="true">
          <span
            className={tableSubject ? 'is-on' : undefined}
            data-linked-table-state={tableSubject ? tableSubject.key : ''}
          >
            Table row · <b>{tableSubject ? label(tableSubject) : 'none'}</b>
          </span>
          <span
            className={inspection ? 'is-on' : undefined}
            data-linked-chart-state={inspection ? inspection.subject.key : ''}
          >
            Chart inspect ·{' '}
            <b>
              {inspection
                ? `${label(inspection.subject)} · ${inspection.modality}`
                : 'none'}
            </b>
          </span>
        </div>
      </div>
      <p
        className="linked-table-sr-only"
        role="status"
        aria-live={inspection?.modality === 'pointer' ? 'off' : 'polite'}
        aria-atomic="true"
        data-linked-status=""
      >
        {inspectionStatus}
      </p>
      <div className="linked-table-scroll">
        <table aria-describedby="linked-table-instructions">
          <caption>
            Flow nodes and links. Every row is keyboard focusable; hovering or
            focusing a row emphasizes the matching subject and its one-hop
            neighborhood in the chart. A chart inspection marks the same row
            without changing the controlled selection.
          </caption>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col" className="linked-table-kind-cell">
                Kind
              </th>
              <th scope="col">Placement / route</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = `${row.subject.kind}:${row.subject.key}`;
              return (
                <LinkedRow
                  key={rowKey}
                  row={row}
                  rowRef={(element) => {
                    if (element) rowRefs.current.set(rowKey, element);
                    else rowRefs.current.delete(rowKey);
                  }}
                  tableHover={sameSubject(hovered, row.subject)}
                  tableFocus={sameSubject(focused, row.subject)}
                  tableActive={sameSubject(tableSubject, row.subject)}
                  chartActive={sameSubject(inspection?.subject, row.subject)}
                  onHover={setHovered}
                  onFocus={setFocused}
                  onDismiss={() => {
                    setHovered(null);
                    setFocused(null);
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="linked-table-footer">
        <span className="linked-table-legend">
          <i className="linked-table-legend-swatch" aria-hidden="true" />
          Active row
        </span>
        <span>
          {rows.filter((row) => row.subject.kind === 'node').length} nodes ·{' '}
          {rows.filter((row) => row.subject.kind === 'link').length} links
          {highlight ? ` · external highlight: ${label(highlight)}` : ''}
        </span>
      </div>
    </section>
  );
}
