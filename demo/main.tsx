import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SankeyDiagram,
  type SankeySubject,
  type SankeyPresentation,
  type SankeyNode,
  type SankeyLink,
  type SankeyGraph,
  type SankeyDiagramHandle,
  type SankeyLayout,
} from '../src/index.js';
import { examples } from './fixtures.js';
import { useExampleTiming } from './useExampleTiming.js';
import './demo.css';
import '../src/style.css';
const format = (value: number, context?: { unit?: string }) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${context?.unit ?? 'units'}`;
const nodeName = (node: SankeyNode, graph: SankeyGraph) =>
  graph.nodes.some(
    (other) => other.key !== node.key && other.title === node.title,
  )
    ? `${node.title} · ${node.placement.stage ?? node.placement.edge}`
    : node.title;
const linkName = (
  link: SankeyLink,
  graph: SankeyGraph,
  formatAmount = format,
) =>
  `${graph.nodes.find((n) => n.key === link.from)?.title} → ${graph.nodes.find((n) => n.key === link.to)?.title} · ${formatAmount(link.amount, { unit: link.inputUnit })}${link.inputUnit !== link.outputUnit || (link.conversionRate ?? 1) !== 1 ? ` → ${formatAmount(link.amount * (link.conversionRate ?? 1), { unit: link.outputUnit })}` : ''}`;
const title = (view: SankeyPresentation) =>
  view.kind === 'node'
    ? view.node.title
    : `${view.fromNode.title} → ${view.toNode.title}`;
const hasCombined = (view: Extract<SankeyPresentation, { kind: 'node' }>) =>
  !!view.converted &&
  (view.totals.length > 1 || view.totals[0]?.unit !== view.converted.unit);
const labels = (view: SankeyPresentation) =>
  view.kind === 'node'
    ? [
        view.node.title,
        ...view.text.totals.map(
          (row) => `${row.total}${row.unit ? '' : ' total'}`,
        ),
        ...(hasCombined(view) ? [`Σ ${view.text.converted!.total}`] : []),
      ]
    : view.input.unit !== view.output.unit ||
        view.input.amount !== view.output.amount
      ? [view.text.amount, `→ ${view.text.outputAmount}`]
      : view.text.amount;
function EndpointDetails({
  node,
  label,
  formatAmount,
  defaultUnit,
}: {
  node: SankeyNode;
  label: string;
  formatAmount: typeof format;
  defaultUnit?: string;
}) {
  const note =
    node.meta &&
    typeof node.meta === 'object' &&
    'note' in node.meta &&
    typeof node.meta.note === 'string'
      ? node.meta.note
      : null;
  return (
    <div className="detail-endpoint">
      <span className="detail-eyebrow">{label}</span>
      <strong>{node.title}</strong>
      <span>
        {node.placement.stage !== undefined
          ? `Stage: ${node.placement.stage}`
          : `Edge: ${node.placement.edge}`}
      </span>
      {node.total !== undefined && (
        <span>
          Declared total: {formatAmount(node.total, { unit: defaultUnit })}
        </span>
      )}
      {Object.entries(node.totals ?? {}).map(([unit, total]) => (
        <span key={unit}>
          {total === 'auto'
            ? `${unit}: automatic`
            : `Declared: ${formatAmount(total, { unit })}`}
        </span>
      ))}
      {note && <span>{note}</span>}
    </div>
  );
}
const details = (
  view: SankeyPresentation,
  formatAmount = format,
  defaultUnit?: string,
) =>
  view.kind === 'node' ? (
    <>
      <span className="detail-eyebrow">NODE DETAILS</span>
      <strong className="flow-tip-title">{title(view)}</strong>
      {view.text.totals.map((row, index) => (
        <div className="flow-tip-balance" key={row.unit ?? ''}>
          {row.unit && (
            <strong>
              {row.unit}{' '}
              <span className="flow-tip-source">
                {view.totals[index].totalSource}
              </span>
            </strong>
          )}
          <dl>
            <dt>Total</dt>
            <dd>{row.total}</dd>
            <dt>Incoming</dt>
            <dd>{row.incoming}</dd>
            <dt>Outgoing</dt>
            <dd>{row.outgoing}</dd>
          </dl>
        </div>
      ))}
      {hasCombined(view) && (
        <div className="flow-tip-balance flow-tip-combined">
          <strong>Combined in {view.converted!.unit}</strong>
          <dl>
            <dt>Total</dt>
            <dd>{view.text.converted!.total}</dd>
            <dt>Incoming</dt>
            <dd>{view.text.converted!.incoming}</dd>
            <dt>Outgoing</dt>
            <dd>{view.text.converted!.outgoing}</dd>
          </dl>
        </div>
      )}
      <p className="detail-note">
        {view.incomingLinks.length} incoming · {view.outgoingLinks.length}{' '}
        outgoing
      </p>
    </>
  ) : (
    <>
      <div className="detail-transfer">
        <div>
          <span className="detail-eyebrow">TRANSFER DETAILS</span>
          <strong className="flow-tip-title">{title(view)}</strong>
        </div>
        <dl className="detail-amount">
          <dt>Input</dt>
          <dd>{view.text.amount}</dd>
          <dt>Output</dt>
          <dd>{view.text.outputAmount}</dd>
          {view.converted && (
            <>
              <dt>Valued input</dt>
              <dd>{view.text.convertedAmount}</dd>
              <dt>Valued output</dt>
              <dd>{view.text.convertedOutputAmount}</dd>
            </>
          )}
        </dl>
      </div>
      {view.text.conversionRate && (
        <div className="flow-tip-rates">
          <span className="detail-eyebrow">TRANSFER RATE</span>
          <div>{view.text.conversionRate}</div>
        </div>
      )}
      {view.text.referenceRates.length > 0 && (
        <div className="flow-tip-rates">
          <span className="detail-eyebrow">REFERENCE VALUATION</span>
          {view.text.referenceRates.map((rate, i) => (
            <div key={i}>{rate}</div>
          ))}
        </div>
      )}
      <div className="detail-endpoints">
        <EndpointDetails
          node={view.fromNode}
          label="Source"
          formatAmount={formatAmount}
          defaultUnit={defaultUnit}
        />
        <EndpointDetails
          node={view.toNode}
          label="Destination"
          formatAmount={formatAmount}
          defaultUnit={defaultUnit}
        />
      </div>
    </>
  );
function App() {
  const diagram = useRef<SankeyDiagramHandle>(null);
  const [example, setExample] = useState('distribution'),
    [selection, setSelection] = useState<SankeySubject | null>(null),
    [viewport, setViewport] = useState('auto'),
    [transitionVariant, setTransitionVariant] = useState(false);
  const [clicksSelect, setClicksSelect] = useState(true),
    [custom, setCustom] = useState(true),
    [events, setEvents] = useState(0),
    [last, setLast] = useState('No clicks yet'),
    [diagnostics, setDiagnostics] = useState<
      SankeyLayout['diagnostics'] | null
    >(null);
  const trackLayout = useCallback((layout: SankeyLayout) => {
    setDiagnostics((old) =>
      old &&
      old.crossings === layout.diagnostics.crossings &&
      old.obstacleCollisions === layout.diagnostics.obstacleCollisions
        ? old
        : layout.diagnostics,
    );
  }, []);
  const downloadSvg = () => {
    const element = diagram.current?.getSvgElement();
    if (!element) return;
    const clone = element.cloneNode(true) as SVGSVGElement,
      root = element.closest<HTMLElement>('.flow-diagram');
    if (root) {
      const computed = getComputedStyle(root);
      for (const name of [
        '--flow-surface',
        '--flow-text',
        '--flow-muted-text',
        '--flow-focus',
      ]) {
        const value = computed.getPropertyValue(name).trim();
        if (value) clone.style.setProperty(name, value);
      }
    }
    const style = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'style',
    );
    style.textContent = `
.flow-canvas{background:var(--flow-surface,#fff)}
.flow-label{fill:var(--flow-text,#24334a);paint-order:stroke;stroke:var(--flow-surface,#fff);stroke-width:3px;stroke-linejoin:round;font-weight:450}
.flow-link-label{font-variant-numeric:tabular-nums}
.flow-overlay{pointer-events:none}
`;
    clone.insertBefore(style, clone.firstChild);
    const markup = new XMLSerializer().serializeToString(clone),
      url = URL.createObjectURL(
        new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = `${example}-sankey.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const current = examples.find((e) => e.key === example)!,
    graph =
      transitionVariant && current.altGraph ? current.altGraph : current.graph;
  const formatAmount = current.formatAmount ?? format;
  const customDetails = useCallback(
    (view: SankeyPresentation) =>
      details(view, formatAmount, graph.defaultUnit),
    [formatAmount, graph.defaultUnit],
  );
  const { hostRef, readyMs } = useExampleTiming(
    `${example}:${viewport}:${custom}:${transitionVariant}`,
  );
  const selectedName =
    selection?.kind === 'node'
      ? (() => {
          const n = graph.nodes.find((n) => n.key === selection.key);
          return n ? nodeName(n, graph) : undefined;
        })()
      : selection?.kind === 'link'
        ? (() => {
            const f = graph.links.find((f) => f.key === selection.key);
            return f ? linkName(f, graph, formatAmount) : undefined;
          })()
        : undefined;
  const clicked = (subject: SankeySubject, name: string) => {
    setEvents((n) => n + 1);
    setLast(`${subject.kind === 'node' ? 'Node' : 'Link'} clicked: ${name}`);
    if (clicksSelect) setSelection(subject);
  };
  const chooseExample = (key: string) => {
    setExample(key);
    setSelection(null);
    setTransitionVariant(false);
    setDiagnostics(null);
  };
  const navigateExamples = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? examples.length - 1
          : (index + delta + examples.length) % examples.length;
    chooseExample(examples[next].key);
    document.getElementById(`example-tab-${examples[next].key}`)?.focus();
  };
  return (
    <main className="demo-shell">
      <header className="page-header">
        <div className="wordmark">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M4 7h8c8 0 4 18 12 18h4M4 25h8c8 0 4-18 12-18h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
            />
          </svg>
          Sankey Plus
        </div>
        <span className="header-note">
          Interactive Sankey diagrams for React
        </span>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">FOLLOW THE FLOW</div>
          <h1>Every connection, in context.</h1>
          <p>
            Trace incoming and outgoing links. Keep a selection in view as you
            explore.
          </p>
        </div>
        <div className="intro-stat">
          <b>{graph.nodes.length}</b>
          <span>nodes</span>
          <i> / </i>
          <b>{graph.links.length}</b>
          <span>links</span>
          <span
            className="render-timing"
            data-render-time=""
            title="Approximate elapsed time from the demo update to a complete diagram and a paint opportunity. Includes chunk scheduling and frame waits; excludes downloads. Hover and selection do not restart it."
          >
            {readyMs === null
              ? 'Rendering…'
              : `Ready in ~${Math.round(readyMs)} ms`}
          </span>
        </div>
      </section>
      <section className="workspace">
        <div className="workspace-toolbar">
          <div className="example-tabs" role="tablist" aria-label="Examples">
            {examples.map((e, index) => (
              <button
                key={e.key}
                id={`example-tab-${e.key}`}
                role="tab"
                aria-selected={example === e.key}
                aria-controls="example-panel"
                tabIndex={example === e.key ? 0 : -1}
                onClick={() => chooseExample(e.key)}
                onKeyDown={(event) => navigateExamples(event, index)}
              >
                {e.name}
              </button>
            ))}
          </div>
          <label className="viewport-control">
            Canvas
            <select
              aria-label="Canvas width"
              value={viewport}
              onChange={(e) => setViewport(e.target.value)}
            >
              <option value="auto">Fit container</option>
              {[1440, 960, 600, 360, 260].map((n) => (
                <option key={n} value={n}>
                  {n} px
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          role="tabpanel"
          id="example-panel"
          aria-labelledby={`example-tab-${example}`}
        >
          <div className="chart-heading">
            <div>
              <h2>{current.name}</h2>
              <p>{current.description}</p>
            </div>
            <span className="interaction-hint">
              <span />
              Hover to trace · click to select
            </span>
          </div>
          <div
            className={`canvas-stage${example === 'distribution' ? ' canvas-stage--dark' : ''}`}
          >
            <div
              ref={hostRef}
              className="canvas-host"
              style={{
                width: viewport === 'auto' ? '100%' : `${viewport}px`,
                maxWidth: '100%',
              }}
              data-demo-host=""
            >
              <SankeyDiagram
                ref={diagram}
                className={
                  example === 'distribution' ? 'distribution-dark' : undefined
                }
                graph={graph}
                accessibleName={`${current.name} diagram`}
                plotHeight={current.plotHeight ?? 336}
                minLinkWidth={current.minLinkWidth}
                transition={current.transition}
                selection={selection}
                formatAmount={formatAmount}
                getLabel={custom ? (current.getLabel ?? labels) : undefined}
                renderTooltip={custom ? customDetails : undefined}
                renderOverlay={current.overlay}
                onLayout={example === 'layout' ? trackLayout : undefined}
                onNodeClick={(f) =>
                  clicked(
                    { kind: 'node', key: f.node.key },
                    nodeName(f.node, graph),
                  )
                }
                onLinkClick={(f) =>
                  clicked(
                    { kind: 'link', key: f.link.key },
                    linkName(f.link, graph, formatAmount),
                  )
                }
              />
            </div>
          </div>
          <footer className="chart-footer">
            <div className="selected-summary">
              <span className="selection-icon" />
              <span>Selected</span>
              <b data-selected-name="">{selectedName ?? 'Nothing selected'}</b>
            </div>
            <div className="chart-actions">
              {example === 'layout' && diagnostics ? (
                <span className="layout-diagnostics" data-layout-diagnostics="">
                  {diagnostics.crossings} crossings ·{' '}
                  {diagnostics.obstacleCollisions} obstacle collisions
                </span>
              ) : null}
              {current.altGraph && (
                <button
                  className="clear-button"
                  aria-pressed={transitionVariant}
                  onClick={() => setTransitionVariant((value) => !value)}
                >
                  Swap data
                </button>
              )}
              <button className="clear-button" onClick={downloadSvg}>
                Download SVG
              </button>
              <button
                className="clear-button"
                onClick={() => setSelection(null)}
                disabled={!selection}
              >
                Clear selection
              </button>
            </div>
          </footer>
        </div>
      </section>
      <section className="integration-panel">
        <div>
          <h3>Controlled by the host</h3>
          <p>Choose a selection here or attach your own click action.</p>
        </div>
        <label className="select-control">
          Selection
          <select
            aria-label="External selection"
            value={selection ? JSON.stringify(selection) : ''}
            onChange={(e) =>
              setSelection(
                e.target.value
                  ? (JSON.parse(e.target.value) as SankeySubject)
                  : null,
              )
            }
          >
            <option value="">None</option>
            <optgroup label="Nodes">
              {graph.nodes.map((n) => (
                <option
                  key={n.key}
                  value={JSON.stringify({
                    kind: 'node',
                    key: n.key,
                  })}
                >
                  {nodeName(n, graph)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Links">
              {graph.links.map((f) => (
                <option
                  key={f.key}
                  value={JSON.stringify({
                    kind: 'link',
                    key: f.key,
                  })}
                >
                  {linkName(f, graph, formatAmount)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={clicksSelect}
              onChange={(e) => setClicksSelect(e.target.checked)}
            />
            Clicks update selection
          </label>
          <label>
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => setCustom(e.target.checked)}
            />
            Custom labels and tooltip
          </label>
        </div>
      </section>
      <div className="event-line" role="status" aria-live="polite">
        <span className="event-count" data-click-count="">
          {events}
        </span>
        <span data-last-event="">{last}</span>
        <span className="keyboard-help">
          Tab into the diagram · arrow keys to explore · Enter to activate
        </span>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
