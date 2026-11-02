import { useState } from 'react';
import type {
  SankeyGraph,
  SankeyInspection,
  SankeyNode,
  SankeySubject,
} from '../src/index.js';
import './linked-table.css';

const format = (value: number, unit?: string) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit ?? 'units'}`;

const sameSubject = (a: SankeySubject | null | undefined, b: SankeySubject) =>
  !!a && a.kind === b.kind && a.key === b.key;

const placementLabel = (placement: SankeyNode['placement']) =>
  placement.stage !== undefined ? placement.stage : `Edge · ${placement.edge}`;

const nodePlacement = (node: SankeyNode) =>
  node.placement.stage !== undefined
    ? node.placement.stage
    : `Edge · ${node.placement.edge}`;

/**
 * The linked-table example uses the unitless Distribution fixture. Its derived
 * totals mirror the model rule: the total covers the larger side of the node.
 */
const derivedTotal = (node: SankeyNode, graph: SankeyGraph) => {
  let incoming = 0;
  let outgoing = 0;
  for (const link of graph.links) {
    if (link.to === node.key) incoming += link.amount;
    if (link.from === node.key) outgoing += link.amount;
  }
  return Math.max(incoming, outgoing);
};

interface Row {
  subject: SankeySubject;
  name: string;
  kind: 'Node' | 'Link';
  placement: string;
  value: string;
  note: string;
  color: string;
}

const rowsFor = (graph: SankeyGraph): Row[] => {
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const rows: Row[] = graph.nodes.map((node) => {
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
      note = 'declared / automatic';
    } else {
      value = format(derivedTotal(node, graph), graph.defaultUnit);
      note = 'derived total';
    }
    return {
      subject: { kind: 'node', key: node.key },
      name: node.title,
      kind: 'Node',
      placement: nodePlacement(node),
      value,
      note,
      color: node.color ?? '#7b879b',
    };
  });

  for (const link of graph.links) {
    const from = byKey.get(link.from);
    const to = byKey.get(link.to);
    const inputUnit = link.inputUnit ?? graph.defaultUnit;
    const outputUnit = link.outputUnit ?? graph.defaultUnit ?? inputUnit;
    const output = link.amount * (link.conversionRate ?? 1);
    const converted =
      link.inputUnit !== link.outputUnit || (link.conversionRate ?? 1) !== 1;
    rows.push({
      subject: { kind: 'link', key: link.key },
      name: `${from?.title ?? link.from} → ${to?.title ?? link.to}`,
      kind: 'Link',
      placement: `${from ? placementLabel(from.placement) : link.from} → ${
        to ? placementLabel(to.placement) : link.to
      }`,
      value: format(link.amount, inputUnit),
      note: converted
        ? `→ ${format(output, outputUnit)} output`
        : 'input amount',
      color: link.color ?? to?.color ?? from?.color ?? '#7b879b',
    });
  }

  return rows;
};

function LinkedRow({
  row,
  tableActive,
  chartActive,
  onEnter,
  onLeave,
}: {
  row: Row;
  tableActive: boolean;
  chartActive: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const active = tableActive || chartActive;
  return (
    <tr
      tabIndex={0}
      data-linked-row=""
      data-linked-kind={row.subject.kind}
      data-linked-key={row.subject.key}
      data-linked-active={active ? 'true' : 'false'}
      data-table-active={tableActive ? 'true' : 'false'}
      data-chart-active={chartActive ? 'true' : 'false'}
      aria-current={active ? 'true' : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={(event) => {
        if (document.activeElement !== event.currentTarget) onLeave();
      }}
      onFocus={onEnter}
      onBlur={(event) => {
        if (!event.currentTarget.matches(':hover')) onLeave();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onLeave();
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
  const rows = rowsFor(graph);
  const label = (subject: SankeySubject) =>
    rows.find((row) => sameSubject(subject, row.subject))?.name ?? subject.key;

  const setTableSubject = (subject: SankeySubject | null) => {
    setHovered(subject);
    onHighlightChange(subject);
  };

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
            className={hovered ? 'is-on' : undefined}
            data-linked-table-state={hovered ? hovered.key : ''}
          >
            Table row · <b>{hovered ? label(hovered) : 'none'}</b>
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
      <div className="linked-table-scroll">
        <table aria-describedby="linked-table-instructions">
          <caption>
            Distribution nodes and links. Every row is keyboard focusable;
            hovering or focusing a row emphasizes the matching subject and its
            one-hop neighborhood in the chart. A chart inspection marks the same
            row without changing the controlled selection.
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
            {rows.map((row) => (
              <LinkedRow
                key={`${row.subject.kind}:${row.subject.key}`}
                row={row}
                tableActive={!!hovered && sameSubject(hovered, row.subject)}
                chartActive={sameSubject(inspection?.subject, row.subject)}
                onEnter={() => setTableSubject(row.subject)}
                onLeave={() => setTableSubject(null)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="linked-table-footer" aria-hidden="true">
        <span className="linked-table-legend">
          <i className="linked-table-legend-swatch" />
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
