import { useState } from 'react';
import { validateGraph, type SankeyGraph } from '../src/index.js';

type VariantKey = 'valid' | 'cycle' | 'unknown-endpoint' | 'total-too-small';
interface Variant {
  readonly key: VariantKey;
  readonly label: string;
  readonly graph: unknown;
}

const variants = (graph: SankeyGraph): readonly Variant[] => [
  { key: 'valid', label: 'Valid graph', graph },
  {
    key: 'cycle',
    label: 'Directed cycle',
    graph: {
      ...graph,
      links: [
        ...graph.links,
        {
          key: 'cycle-back',
          from: 'allocated',
          to: 'available',
          amount: 100,
        },
      ],
    },
  },
  {
    key: 'unknown-endpoint',
    label: 'Unknown endpoint',
    graph: {
      ...graph,
      links: [
        ...graph.links,
        {
          key: 'missing-target',
          from: 'available',
          to: 'missing',
          amount: 100,
        },
      ],
    },
  },
  {
    key: 'total-too-small',
    label: 'Total too small',
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.key === 'available' ? { ...node, total: 100 } : node,
      ),
    },
  },
];

export function ValidationPanel({ graph }: { graph: SankeyGraph }) {
  const [selected, setSelected] = useState<VariantKey>('valid');
  const options = variants(graph);
  const variant = options.find((option) => option.key === selected)!;
  const issues = validateGraph(variant.graph);
  return (
    <section className="validation-panel" aria-labelledby="validation-title">
      <div className="validation-header">
        <div>
          <h3 id="validation-title">
            Preflight with <code>validateGraph</code>
          </h3>
          <p>
            Select a variant to run the same validation rules used by the
            component. The function returns issues instead of throwing, so
            untrusted JSON and form data can be checked before rendering.
          </p>
        </div>
        <label className="validation-variant">
          Variant
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value as VariantKey)}
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="validation-summary" aria-live="polite">
        <strong>{variant.label}:</strong>{' '}
        {issues.length === 0
          ? 'no issues. This variant is safe to render.'
          : `${issues.length} issue${issues.length === 1 ? '' : 's'} returned instead of throwing.`}
      </p>
      {issues.length > 0 && (
        <ul className="validation-issues">
          {issues.map((issue, index) => (
            <li className="validation-issue" key={`${issue.code}-${index}`}>
              <code>{issue.code}</code>
              <span>{issue.message}</span>
              {issue.nodeKey && <small>node: {issue.nodeKey}</small>}
              {issue.linkKey && <small>link: {issue.linkKey}</small>}
            </li>
          ))}
        </ul>
      )}
      <p className="validation-note">
        Invalid variants are never passed to the chart. The diagram on this page
        always renders the valid example.
      </p>
    </section>
  );
}
