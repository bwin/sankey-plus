import type {
  SankeyInspection,
  SankeyNode,
  SankeySubject,
} from '../src/index.js';

export function InspectionPanel({
  nodes,
  highlight,
  onHighlightChange,
  inspection,
}: {
  readonly nodes: readonly SankeyNode[];
  readonly highlight: SankeySubject | null;
  readonly onHighlightChange: (subject: SankeySubject | null) => void;
  readonly inspection: SankeyInspection | null;
}) {
  return (
    <div className="inspection-panel" data-inspection-panel="">
      <div className="inspection-panel-copy">
        <h3>External highlight</h3>
        <p>
          Emphasize a node, its links and their endpoints without changing the
          selection.
        </p>
      </div>
      <label className="select-control">
        Highlight
        <select
          aria-label="External highlight"
          value={highlight?.key ?? ''}
          onChange={(event) =>
            onHighlightChange(
              event.target.value
                ? { kind: 'node', key: event.target.value }
                : null,
            )
          }
        >
          <option value="">None</option>
          {nodes.map((node) => (
            <option key={node.key} value={node.key}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <div
        className="inspection-result"
        role="status"
        aria-live={inspection?.modality === 'pointer' ? 'off' : 'polite'}
      >
        <span>onInspectChange</span>
        <b data-inspection-result="">
          {inspection
            ? `${inspection.subject.kind}:${inspection.subject.key} · ${inspection.modality}`
            : 'none'}
        </b>
      </div>
    </div>
  );
}
