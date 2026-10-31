import { useState, type KeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { SankeyDiagram, type SankeySubject, type SankeyPresentation } from '../src/index.js';
import { examples } from './fixtures.js';
import './demo.css';
const format = (value: number) => `${value.toLocaleString('en-US')} units`;
const title = (view: SankeyPresentation) => view.kind === 'node' ? view.node.title : `${view.fromNode.title} → ${view.toNode.title}`;
const labels = (view: SankeyPresentation) => view.kind === 'node' ? [view.node.title, `${view.text.total} total`] : view.text.amount;
const details = (view: SankeyPresentation) => <><span className="detail-eyebrow">{view.kind === 'node' ? 'NODE DETAILS' : 'TRANSFER DETAILS'}</span><strong className="flow-tip-title">{title(view)}</strong>{view.kind === 'node' ? <dl><dt>Total</dt><dd>{view.text.total}</dd><dt>Incoming</dt><dd>{view.text.incoming}</dd><dt>Outgoing</dt><dd>{view.text.outgoing}</dd></dl> : <dl><dt>Amount</dt><dd>{view.text.amount}</dd></dl>}<p className="detail-note">{view.kind === 'node' ? `${view.incomingLinks.length} incoming · ${view.outgoingLinks.length} outgoing` : 'Click to select this link'}</p></>;
function App() {
    const [example, setExample] = useState('distribution'), [selection, setSelection] = useState<SankeySubject | null>(null), [viewport, setViewport] = useState('auto');
    const [clicksSelect, setClicksSelect] = useState(true), [custom, setCustom] = useState(true), [events, setEvents] = useState(0), [last, setLast] = useState('No clicks yet');
    const current = examples.find(e => e.key === example)!, graph = current.graph;
    const selectedName = selection?.kind === 'node' ? graph.nodes.find(n => n.key === selection.key)?.title : selection?.kind === 'link' ? (() => { const f = graph.links.find(f => f.key === selection.key); return f ? `${graph.nodes.find(n => n.key === f.from)?.title} → ${graph.nodes.find(n => n.key === f.to)?.title}` : undefined; })() : undefined;
    const clicked = (subject: SankeySubject, name: string) => { setEvents(n => n + 1); setLast(`${subject.kind === 'node' ? 'Node' : 'Link'} clicked: ${name}`); if (clicksSelect)
        setSelection(subject); };
    const chooseExample = (key: string) => { setExample(key); setSelection(null); };
    const navigateExamples = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!delta && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? examples.length - 1 : (index + delta + examples.length) % examples.length;
        chooseExample(examples[next].key);
        document.getElementById(`example-tab-${examples[next].key}`)?.focus();
    };
    return <main className="demo-shell"><header className="page-header"><div className="wordmark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 7h8c8 0 4 18 12 18h4M4 25h8c8 0 4-18 12-18h4" fill="none" stroke="currentColor" strokeWidth="5"/></svg>Sankey Plus</div><span className="header-note">Interactive Sankey diagrams for React</span></header>
    <section className="intro"><div><div className="eyebrow">FOLLOW THE FLOW</div><h1>Every connection, in context.</h1><p>Trace incoming and outgoing links. Keep a selection in view as you explore.</p></div><div className="intro-stat"><b>{graph.nodes.length}</b><span>nodes</span><i> / </i><b>{graph.links.length}</b><span>links</span></div></section>
    <section className="workspace"><div className="workspace-toolbar"><div className="example-tabs" role="tablist" aria-label="Examples">{examples.map((e, index) => <button key={e.key} id={`example-tab-${e.key}`} role="tab" aria-selected={example === e.key} aria-controls="example-panel" tabIndex={example === e.key ? 0 : -1} onClick={() => chooseExample(e.key)} onKeyDown={event => navigateExamples(event, index)}>{e.name}</button>)}</div><label className="viewport-control">Canvas<select aria-label="Canvas width" value={viewport} onChange={e => setViewport(e.target.value)}><option value="auto">Fit container</option>{[1440, 960, 600, 360, 260].map(n => <option key={n} value={n}>{n} px</option>)}</select></label></div>
      <div role="tabpanel" id="example-panel" aria-labelledby={`example-tab-${example}`}>
      <div className="chart-heading"><div><h2>{current.name}</h2><p>{current.description}</p></div><span className="interaction-hint"><span />Hover to trace · click to select</span></div>
      <div className="canvas-stage"><div className="canvas-host" style={{ width: viewport === 'auto' ? '100%' : `${viewport}px`, maxWidth: '100%' }} data-demo-host=""><SankeyDiagram graph={graph} accessibleName={`${current.name} diagram`} plotHeight={336} selection={selection} formatAmount={format} getLabel={custom ? labels : undefined} renderTooltip={custom ? details : undefined} onNodeClick={f => clicked({ kind: 'node', key: f.node.key }, f.node.title)} onLinkClick={f => clicked({ kind: 'link', key: f.link.key }, `${f.fromNode.title} → ${f.toNode.title}`)}/></div></div>
      <footer className="chart-footer"><div className="selected-summary"><span className="selection-icon"/><span>Selected</span><b data-selected-name="">{selectedName ?? 'Nothing selected'}</b></div><button className="clear-button" onClick={() => setSelection(null)} disabled={!selection}>Clear selection</button></footer>
      </div>
    </section>
    <section className="integration-panel"><div><h3>Controlled by the host</h3><p>Choose a selection here or attach your own click action.</p></div><label className="select-control">Selection<select aria-label="External selection" value={selection ? JSON.stringify(selection) : ''} onChange={e => setSelection(e.target.value ? JSON.parse(e.target.value) : null)}><option value="">None</option><optgroup label="Nodes">{graph.nodes.map(n => <option key={n.key} value={JSON.stringify({ kind: 'node', key: n.key })}>{n.title}</option>)}</optgroup><optgroup label="Links">{graph.links.map(f => <option key={f.key} value={JSON.stringify({ kind: 'link', key: f.key })}>{graph.nodes.find(n => n.key === f.from)?.title} → {graph.nodes.find(n => n.key === f.to)?.title}</option>)}</optgroup></select></label><div className="toggles"><label><input type="checkbox" checked={clicksSelect} onChange={e => setClicksSelect(e.target.checked)}/>Clicks update selection</label><label><input type="checkbox" checked={custom} onChange={e => setCustom(e.target.checked)}/>Custom labels and tooltip</label></div></section>
    <div className="event-line" role="status" aria-live="polite"><span className="event-count" data-click-count="">{events}</span><span data-last-event="">{last}</span><span className="keyboard-help">Tab into the diagram · arrow keys to explore · Enter to activate</span></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
