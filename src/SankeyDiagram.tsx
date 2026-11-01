import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { emphasis, resolveGraph } from './model.js';
import { hitTest, layoutGraphSteps, type Scene, type TextBox } from './layout.js';
import { runInChunks } from './layout-task.js';
import { defaultLabel, identity, presentation, same, showConverted, subjectName } from './presentation.js';
import type { SankeyActivationEvent, SankeyDiagramProps, SankeySubject, SankeyPresentation } from './types.js';
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
type Inspection = {
    subject: SankeySubject;
    anchor: {
        x: number;
        y: number;
    };
    pinned: boolean;
    modality: 'pointer' | 'touch' | 'keyboard';
};
function Text({ box, ...props }: {
    box: TextBox;
    opacity?: number;
    className?: string;
}) {
    return <text {...props} x={box.textX} y={box.textY} textAnchor={box.anchor} pointerEvents="none" aria-hidden="true">{box.lines.map((line, i) => <tspan key={i} x={box.textX} dy={i ? box.h / box.lines.length : 0}>{line}</tspan>)}</text>;
}
function DefaultDetails({ view }: {
    view: SankeyPresentation;
}) {
    return <><strong className="flow-tip-title">{view.kind === 'node' ? view.node.title : `${view.fromNode.title} → ${view.toNode.title}`}</strong>
    {view.kind === 'node' ? <>
        {view.text.totals.map((row, index) => <div className="flow-tip-balance" key={row.unit ?? ''}>
            {row.unit && <strong>{row.unit} <span className="flow-tip-source">{view.totals[index].totalSource}</span></strong>}
            <dl><dt>Total</dt><dd>{row.total}</dd><dt>Incoming</dt><dd>{row.incoming}</dd><dt>Outgoing</dt><dd>{row.outgoing}</dd></dl>
        </div>)}
        {showConverted(view) && <div className="flow-tip-balance flow-tip-combined"><strong>Combined in {view.converted!.unit}</strong><dl><dt>Total</dt><dd>{view.text.converted!.total}</dd><dt>Incoming</dt><dd>{view.text.converted!.incoming}</dd><dt>Outgoing</dt><dd>{view.text.converted!.outgoing}</dd></dl></div>}
    </> : <>
        <dl><dt>Input</dt><dd>{view.text.amount}</dd><dt>Output</dt><dd>{view.text.outputAmount}</dd>{view.converted && <><dt>Valued input</dt><dd>{view.text.convertedAmount}</dd><dt>Valued output</dt><dd>{view.text.convertedOutputAmount}</dd></>}</dl>
        {view.text.conversionRate && <div className="flow-tip-rates"><strong>Transfer rate</strong>{view.text.conversionRate}</div>}
        {view.text.referenceRates.length > 0 && <div className="flow-tip-rates"><strong>Reference valuation</strong>{view.text.referenceRates.map((rate, index) => <div key={index}>{rate}</div>)}</div>}
    </>}</>;
}
function Details({ id, anchor, children, theme }: {
    id: string;
    anchor: {
        x: number;
        y: number;
    };
    children: ReactNode;
    theme: CSSProperties;
}) {
    // client dimensions exclude classic scrollbars, unlike innerWidth/Height.
    const readViewport = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
    const ref = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 260, height: 140 }), [viewport, setViewport] = useState(readViewport);
    useBrowserLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const update = () => { const r = el.getBoundingClientRect(); setSize(old => Math.abs(old.width - r.width) + Math.abs(old.height - r.height) < .5 ? old : { width: r.width, height: r.height }); };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [children]);
    useEffect(() => {
        const update = () => { const next = readViewport(); setViewport(old => old.width === next.width && old.height === next.height ? old : next); };
        const observer = new ResizeObserver(update);
        observer.observe(document.documentElement);
        window.addEventListener('resize', update);
        return () => { observer.disconnect(); window.removeEventListener('resize', update); };
    }, []);
    const x = Math.max(8, Math.min(viewport.width - size.width - 8, anchor.x + 16 + size.width > viewport.width - 8 ? anchor.x - size.width - 16 : anchor.x + 16));
    const y = Math.max(8, Math.min(viewport.height - size.height - 8, anchor.y + 16 + size.height > viewport.height - 8 ? anchor.y - size.height - 16 : anchor.y + 16));
    return createPortal(<div ref={ref} id={id} role="tooltip" className="flow-tooltip" style={{ ...theme, left: x, top: y, maxHeight: viewport.height - 16 }}>{children}</div>, document.body);
}
export function SankeyDiagram<I = unknown, T = unknown>(props: SankeyDiagramProps<I, T>) {
    const { graph, accessibleName, className, plotHeight = 336, selection, onNodeClick, onLinkClick, formatAmount, getLabel, renderTooltip } = props;
    const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), controls = useRef(new Map<string, SVGGElement>());
    const uid = useId(), tooltipId = `${uid}-details`, helpId = `${uid}-help`;
    const [measurement, setMeasurement] = useState({ width: 0, font: '12px sans-serif', lineHeight: 16 });
    const [theme, setTheme] = useState<CSSProperties>({});
    const [inspection, setInspection] = useState<Inspection | null>(null), [roving, setRoving] = useState(0), [keyboardFocus, setKeyboardFocus] = useState<SankeySubject | null>(null);
    const input = useRef<'pointer' | 'keyboard'>('keyboard'), suppressed = useRef<SankeySubject | null>(null), lastKeyboard = useRef(0);
    const gesture = useRef<{
        x: number;
        y: number;
        cancelled: boolean;
        type: string;
    } | null>(null);
    const model = useMemo(() => resolveGraph(graph), [graph]);
    useBrowserLayoutEffect(() => {
        const el = root.current;
        if (!el)
            return;
        let frame = 0, disposed = false;
        const measure = () => {
            if (disposed)
                return;
            const computed = getComputedStyle(el), width = el.clientWidth, font = `${computed.fontStyle} ${computed.fontWeight} 12px ${computed.fontFamily}`;
            setMeasurement(old => Math.abs(old.width - width) < .5 && old.font === font ? old : { width, font, lineHeight: 16 });
            const vars: Record<string, string> = {};
            for (const key of ['--flow-surface', '--flow-text', '--flow-muted-text', '--flow-focus']) {
                const value = computed.getPropertyValue(key).trim();
                if (value)
                    vars[key] = value;
            }
            setTheme(old => JSON.stringify(old) === JSON.stringify(vars) ? old : vars as CSSProperties);
        };
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        const observer = new ResizeObserver(schedule);
        observer.observe(el);
        const mutations = new MutationObserver(schedule);
        mutations.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        for (let parent = el.parentElement; parent; parent = parent.parentElement)
            mutations.observe(parent, { attributes: true, attributeFilter: ['class', 'style'] });
        document.fonts?.ready.then(schedule);
        document.fonts?.addEventListener('loadingdone', schedule);
        measure();
        return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); document.fonts?.removeEventListener('loadingdone', schedule); };
    }, []);
    const measureText = useMemo(() => {
        if (typeof document === 'undefined')
            return (text: string) => text.length * 6.6;
        const context = document.createElement('canvas').getContext('2d');
        if (context)
            context.font = measurement.font;
        return (text: string) => context?.measureText(text).width ?? text.length * 6.6;
    }, [measurement.font]);
    const labels = useMemo(() => {
        const result = new Map<string, readonly string[]>();
        for (const subject of model.subjects) {
            const view = presentation(model, subject, formatAmount, 'label');
            const value = getLabel ? getLabel(view) : defaultLabel(view);
            result.set(`${subject.kind}:${subject.key}`, value === null ? [] : typeof value === 'string' ? (value ? [value] : []) : [...value]);
        }
        return result;
    }, [model, formatAmount, getLabel]);
    const names = useMemo(() => new Map(model.subjects.map(s => [identity(s), subjectName(presentation(model, s, formatAmount, 'accessible'))])), [model, formatAmount]);
    const layoutRequest = useMemo(() => ({ model, options: { width: measurement.width, plotHeight, labels, measureText, lineHeight: measurement.lineHeight } }), [model, measurement, plotHeight, labels, measureText]);
    const [layoutResult, setLayoutResult] = useState<({ request: typeof layoutRequest } & ({ scene: Scene } | { error: unknown })) | null>(null);
    useEffect(() => {
        if (layoutRequest.options.width <= 0 || !layoutRequest.model.nodes.size) return;
        const controller = new AbortController();
        runInChunks(layoutGraphSteps(layoutRequest.model, layoutRequest.options), controller.signal).then(
            scene => { if (!controller.signal.aborted) setLayoutResult({ request: layoutRequest, scene }); },
            error => { if (!controller.signal.aborted) setLayoutResult({ request: layoutRequest, error }); },
        );
        return () => controller.abort();
    }, [layoutRequest]);
    // Keep a completed scene during resize so focus and scrolling survive. Never
    // pair another graph's geometry with the current graph's facts or callbacks.
    const scene = layoutResult?.request.model === model && 'scene' in layoutResult ? layoutResult.scene : null;
    const pending = model.nodes.size > 0 && layoutResult?.request !== layoutRequest;
    const exists = (s: SankeySubject | null | undefined) => !!s && (s.kind === 'node' ? model.nodes.has(s.key) : model.links.has(s.key));
    const selected = exists(selection) ? selection! : null;
    const active = scene && inspection && exists(inspection.subject) ? inspection : null;
    const strong = useMemo(() => emphasis(model, active?.subject ?? null), [model, active?.subject.kind, active?.subject.key]);
    const activeView = active ? presentation(model, active.subject, formatAmount, 'tooltip') : null;
    const tooltip = activeView ? (renderTooltip ? renderTooltip(activeView) : <DefaultDetails view={activeView}/>) : null;
    useEffect(() => { if (inspection && !exists(inspection.subject))
        setInspection(null); if (keyboardFocus && !exists(keyboardFocus))
        setKeyboardFocus(null); setRoving(i => Math.min(i, Math.max(0, model.subjects.length - 1))); }, [model]);
    function repositionInspection() {
        setInspection(old => {
            if (!old || old.modality === 'pointer') return null;
            const box = controls.current.get(identity(old.subject))?.getBoundingClientRect();
            if (!box) return null;
            const anchor = { x: box.right, y: box.top + box.height / 2 };
            return Math.abs(anchor.x - old.anchor.x) + Math.abs(anchor.y - old.anchor.y) < .5 ? old : { ...old, anchor };
        });
    }
    // Resizing/reflow can move a focused subject without scrolling the page.
    useBrowserLayoutEffect(() => { repositionInspection(); }, [scene]);
    useEffect(() => {
        const outside = (e: globalThis.PointerEvent) => { if (!root.current?.contains(e.target as Node)) {
            setInspection(null);
            suppressed.current = null;
        } };
        // Tab is dispatched on the previous control, before focus enters us.
        const keyboard = () => { input.current = 'keyboard'; };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', keyboard, true);
        window.addEventListener('scroll', repositionInspection, true);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard, true); window.removeEventListener('scroll', repositionInspection, true); };
    }, []);
    const locate = (event: {
        clientX: number;
        clientY: number;
    }) => {
        if (!scene || !svg.current)
            return null;
        const matrix = svg.current.getScreenCTM();
        if (!matrix)
            return null;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return hitTest(scene, point);
    };
    function inspect(subject: SankeySubject | null, x: number, y: number, modality: Inspection['modality'] = 'pointer', pinned = false) {
        if (!subject) {
            if (!active?.pinned)
                setInspection(null);
            suppressed.current = null;
            return;
        }
        if (same(subject, suppressed.current))
            return;
        suppressed.current = null;
        setInspection(old => same(old?.subject ?? null, subject) && Math.abs((old?.anchor.x ?? 0) - x) + Math.abs((old?.anchor.y ?? 0) - y) < 1 && old?.modality === modality && old?.pinned === pinned ? old : { subject, anchor: { x, y }, modality, pinned });
    }
    function pointerMove(e: PointerEvent<SVGSVGElement>) {
        if (gesture.current && Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 8)
            gesture.current.cancelled = true;
        if (e.pointerType === 'touch' || e.buttons)
            return;
        input.current = 'pointer';
        setKeyboardFocus(null);
        inspect(locate(e), e.clientX, e.clientY);
    }
    function activate(subject: SankeySubject, event: SankeyActivationEvent) {
        if (subject.kind === 'node')
            onNodeClick?.(model.nodes.get(subject.key)!, event);
        else
            onLinkClick?.(model.links.get(subject.key)!, event);
    }
    function click(e: MouseEvent<SVGSVGElement>) {
        if (e.button !== 0 || gesture.current?.cancelled || e.detail === 0 && performance.now() - lastKeyboard.current < 150) {
            gesture.current = null;
            return;
        }
        const control = (e.target as Element).closest<SVGGElement>('[data-flow-subject]');
        const subject = e.detail === 0 && control ? { kind: control.dataset.kind as SankeySubject['kind'], key: control.dataset.key! } : locate(e);
        const touch = gesture.current?.type === 'touch';
        gesture.current = null;
        if (!subject) {
            setInspection(null);
            suppressed.current = null;
            return;
        }
        input.current = 'pointer';
        setKeyboardFocus(null);
        suppressed.current = null;
        const index = model.subjects.findIndex(s => same(s, subject));
        setRoving(index);
        controls.current.get(identity(subject))?.focus({ preventScroll: true });
        inspect(subject, e.clientX, e.clientY, touch ? 'touch' : 'pointer', touch);
        activate(subject, e);
    }
    function keyDown(e: KeyboardEvent<SVGGElement>, subject: SankeySubject, index: number) {
        input.current = 'keyboard';
        setKeyboardFocus(subject);
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (delta || e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? model.subjects.length - 1 : Math.max(0, Math.min(model.subjects.length - 1, index + delta));
            setRoving(next);
            suppressed.current = null;
            controls.current.get(identity(model.subjects[next]))?.focus();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            suppressed.current = subject;
            setInspection(null);
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (e.repeat)
                return;
            lastKeyboard.current = performance.now();
            suppressed.current = null;
            const r = e.currentTarget.getBoundingClientRect();
            inspect(subject, r.right, r.top + r.height / 2, 'keyboard', true);
            activate(subject, e);
        }
    }
    const subjectProps = (subject: SankeySubject) => {
        const index = model.subjects.findIndex(s => same(s, subject));
        return {
            ref: (el: SVGGElement | null) => { if (el)
                controls.current.set(identity(subject), el);
            else
                controls.current.delete(identity(subject)); },
            role: 'button', tabIndex: index === Math.min(roving, model.subjects.length - 1) ? 0 : -1,
            'aria-label': names.get(identity(subject)), 'aria-pressed': selection === undefined ? undefined : same(subject, selected),
            'aria-describedby': same(subject, active?.subject ?? null) && tooltip ? `${helpId} ${tooltipId}` : helpId,
            'data-flow-subject': '', 'data-kind': subject.kind, 'data-key': subject.key,
            'data-selected': same(subject, selected) ? 'true' : 'false',
            onKeyDown: (e: KeyboardEvent<SVGGElement>) => keyDown(e, subject, index),
            onFocus: (e: React.FocusEvent<SVGGElement>) => {
                setRoving(index);
                if (input.current === 'pointer')
                    return;
                setKeyboardFocus(subject);
                suppressed.current = null;
                const r = e.currentTarget.getBoundingClientRect();
                inspect(subject, r.right, r.top + r.height / 2, 'keyboard');
            },
            style: { outline: 'none' } as CSSProperties,
        };
    };
    const ordered = scene ? [...scene.links].sort((a, b) => {
        const rank = (key: string) => active?.subject.kind === 'link' && active.subject.key === key ? 2 : selected?.kind === 'link' && selected.key === key ? 1 : 0;
        return rank(a.key) - rank(b.key);
    }) : [];
    if (layoutResult?.request === layoutRequest && 'error' in layoutResult) throw layoutResult.error;
    return <div ref={root} aria-busy={pending} className={['flow-diagram', className].filter(Boolean).join(' ')} onKeyDownCapture={() => { input.current = 'keyboard'; }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) {
        setKeyboardFocus(null);
        setInspection(null);
        suppressed.current = null;
        input.current = 'keyboard';
    } }}>
    <span className="flow-sr-only" id={helpId}>Use arrow keys to inspect nodes and links. Enter or Space activates the focused subject. Escape dismisses details. Selection is controlled by the surrounding application.</span>
    {!model.nodes.size ? <div role="group" aria-label={accessibleName} className="flow-empty">No flow data</div> : !scene ? <div role="status" className="flow-measuring" aria-label={accessibleName} style={{ height: plotHeight }}>Preparing diagram…</div> :
            <div className={`flow-scroll${scene.width > measurement.width ? ' flow-scroll--overflow' : ''}`} data-flow-scroll="">
      <svg ref={svg} role="group" aria-label={accessibleName} width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`} className="flow-canvas" style={{ font: measurement.font, cursor: active?.modality === 'pointer' ? 'pointer' : undefined }} data-top-band={scene.topBand} data-bottom-band={scene.bottomBand} data-crossings={scene.diagnostics.crossings} data-obstacle-collisions={scene.diagnostics.obstacleCollisions} onPointerMove={pointerMove} onPointerLeave={() => { if (active?.modality === 'pointer' && !active.pinned)
                setInspection(null); suppressed.current = null; }} onPointerDown={e => { if (e.button === 0) {
                input.current = 'pointer';
                gesture.current = { x: e.clientX, y: e.clientY, cancelled: false, type: e.pointerType };
            } }} onPointerCancel={() => { if (gesture.current)
                gesture.current.cancelled = true; }} onClick={click}>
        {ordered.map(f => {
                    const subject: SankeySubject = { kind: 'link', key: f.key }, isSelected = same(subject, selected), focused = same(subject, keyboardFocus), strongFlow = strong.links.has(f.key), opacity = strongFlow ? (same(subject, active?.subject ?? null) ? .75 : .4) : .1;
                    return <g key={f.key} {...subjectProps(subject)} data-emphasis={strongFlow ? 'strong' : 'faded'}>
            {isSelected && <g aria-hidden="true" className="flow-decoration" data-selection-outline=""><path d={f.ribbon?.path ?? f.route.path} stroke="var(--flow-surface, white)" strokeWidth={(f.ribbon ? 0 : f.width) + 8}/><path d={f.ribbon?.path ?? f.route.path} stroke={f.color} strokeWidth={(f.ribbon ? 0 : f.width) + 5}/><path d={f.ribbon?.path ?? f.route.path} stroke="var(--flow-surface, white)" strokeWidth={(f.ribbon ? 0 : f.width) + 2}/></g>}
            <path data-link-paint="" d={f.ribbon?.path ?? f.route.path} fill={f.ribbon ? f.color : 'none'} stroke={f.ribbon ? 'none' : f.color} strokeWidth={f.width} opacity={opacity} pointerEvents="none" aria-hidden="true"/>
            {focused && <g className="flow-decoration" aria-hidden="true"><path d={f.route.path} stroke="var(--flow-surface, white)" strokeWidth={4}/><path d={f.route.path} stroke="var(--flow-focus, #2644af)" strokeWidth={2} strokeDasharray="4 4"/></g>}
          </g>;
                })}
        {scene.nodes.map(n => {
                    const subject: SankeySubject = { kind: 'node', key: n.key }, isSelected = same(subject, selected), focused = same(subject, keyboardFocus), strongItem = strong.nodes.has(n.key);
                    return <g key={n.key} {...subjectProps(subject)} data-emphasis={strongItem ? 'strong' : 'faded'}>
            <rect data-node-paint="" x={n.x} y={n.y} width={n.w} height={n.h} fill={n.zero ? 'none' : n.color} stroke={n.zero ? n.color : undefined} strokeWidth={1} opacity={strongItem ? 1 : .25} pointerEvents="none" aria-hidden="true"/>
            {isSelected && <g className="flow-decoration" data-selection-outline="" aria-hidden="true"><rect x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} stroke="var(--flow-surface, white)" strokeWidth={6}/><rect x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} stroke={n.color} strokeWidth={2}/></g>}
            {focused && <rect className="flow-decoration" x={n.x - 8} y={n.y - 8} width={n.w + 16} height={n.h + 16} stroke="var(--flow-focus, #2644af)" strokeWidth={1.5} strokeDasharray="3 3" aria-hidden="true"/>}
          </g>;
                })}
        {scene.links.filter(f => !f.labelHidden || same(active?.subject ?? null, { kind: 'link', key: f.key })).map(f => <Text key={`t-${f.key}`} box={f.label} className="flow-label flow-link-label" opacity={strong.links.has(f.key) ? 1 : .25}/>)}
        {scene.nodes.map(n => <Text key={`i-${n.key}`} box={n.label} className="flow-label" opacity={strong.nodes.has(n.key) ? 1 : .25}/>)}
      </svg>
    </div>}
    {active && tooltip && typeof document !== 'undefined' ? <Details id={tooltipId} anchor={active.anchor} theme={theme}>{tooltip}</Details> : null}
  </div>;
}
