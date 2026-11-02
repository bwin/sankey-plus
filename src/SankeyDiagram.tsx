import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefRenderFunction,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { emphasis, resolveGraph, subjectExists } from './model.js';
import {
  hitTest,
  layoutGraphSteps,
  type Scene,
  type TextBox,
} from './layout.js';
import { runInChunks } from './layout-task.js';
import { layoutSnapshot } from './snapshot.js';
import {
  anchorMoved,
  defaultLabel,
  identity,
  presentation,
  same,
  scopeGhostMarkup,
  showConverted,
  subjectName,
  tooltipPosition,
  transitionTiming,
} from './presentation.js';
import type {
  SankeyActivationEvent,
  SankeyDiagramHandle,
  SankeyDiagramProps,
  SankeyLayout,
  SankeySubject,
  SankeyPresentation,
} from './types.js';
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
type Inspection = {
  subject: SankeySubject;
  anchor: {
    x: number;
    y: number;
  };
  pinned: boolean;
  modality: 'pointer' | 'touch' | 'keyboard';
};
type SceneSnapshot = {
  scene: Scene;
  selection: string;
  markup: string;
  width: number;
  height: number;
  font: string;
};
type SceneGhost = {
  id: number;
  markup: string;
  width: number;
  height: number;
  font: string;
  duration: number;
  easing: string;
};
function Text({
  box,
  ...props
}: {
  box: TextBox;
  opacity?: number;
  className?: string;
}) {
  return (
    <text
      {...props}
      x={box.textX}
      y={box.textY}
      textAnchor={box.anchor}
      pointerEvents="none"
      aria-hidden="true"
    >
      {box.lines.map((line, i) => (
        <tspan key={i} x={box.textX} dy={i ? box.h / box.lines.length : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
function DefaultDetails({ view }: { view: SankeyPresentation }) {
  return (
    <>
      <strong className="flow-tip-title">
        {view.kind === 'node'
          ? view.node.title
          : `${view.fromNode.title} → ${view.toNode.title}`}
      </strong>
      {view.kind === 'node' ? (
        <>
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
          {showConverted(view) && (
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
        </>
      ) : (
        <>
          <dl>
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
          {view.text.conversionRate && (
            <div className="flow-tip-rates">
              <strong>Transfer rate</strong>
              {view.text.conversionRate}
            </div>
          )}
          {view.text.referenceRates.length > 0 && (
            <div className="flow-tip-rates">
              <strong>Reference valuation</strong>
              {view.text.referenceRates.map((rate, index) => (
                <div key={index}>{rate}</div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
type DetailsHandle = {
  move: (anchor: { x: number; y: number }) => void;
  contains: (node: Node | null) => boolean;
};
const Details = forwardRef<
  DetailsHandle,
  {
    id: string;
    anchor: {
      x: number;
      y: number;
    };
    children: ReactNode;
    theme: CSSProperties;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onPointerDown: () => void;
  }
>(function Details(
  {
    id,
    anchor,
    children,
    theme,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
  },
  handle,
) {
  // client dimensions exclude classic scrollbars, unlike innerWidth/Height.
  const readViewport = () => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });
  const ref = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState(anchor),
    [size, setSize] = useState({ width: 260, height: 140 }),
    [viewport, setViewport] = useState(readViewport);
  useBrowserLayoutEffect(() => {
    setPosition((old) =>
      old.x === anchor.x && old.y === anchor.y ? old : anchor,
    );
  }, [anchor.x, anchor.y]);
  useImperativeHandle(
    handle,
    () => ({
      move: (next) =>
        setPosition((old) => (anchorMoved(old, next) ? next : old)),
      contains: (node) => !!node && !!ref.current?.contains(node),
    }),
    [],
  );
  const measureSize = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize((old) =>
      Math.abs(old.width - r.width) + Math.abs(old.height - r.height) < 0.5
        ? old
        : { width: r.width, height: r.height },
    );
  };
  useBrowserLayoutEffect(measureSize, [children]);
  useBrowserLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measureSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => {
      const next = readViewport();
      setViewport((old) =>
        old.width === next.width && old.height === next.height ? old : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const { x, y } = tooltipPosition(position, size, viewport);
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      tabIndex={-1}
      className="flow-tooltip"
      style={{
        ...theme,
        left: x,
        top: y,
        maxHeight: viewport.height - 16,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>,
    document.body,
  );
});
function SankeyDiagramRender<I = unknown, T = unknown>(
  props: SankeyDiagramProps<I, T>,
  ref: Ref<SankeyDiagramHandle>,
) {
  const {
    graph,
    accessibleName,
    className,
    plotHeight = 336,
    transition: transitionProp,
    minLinkWidth = 0,
    showHeadroom = false,
    selection,
    onNodeClick,
    onLinkClick,
    onLayout,
    renderOverlay,
    formatAmount,
    getLabel,
    renderTooltip,
  } = props;
  const transition = transitionTiming(transitionProp),
    transitionDuration = transition?.duration ?? 0,
    transitionEasing = transition?.easing ?? 'ease-out',
    selectionSignature = selection ? `${selection.kind}:${selection.key}` : '';
  const root = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    ghostSvg = useRef<SVGSVGElement>(null),
    controls = useRef(new Map<string, SVGGElement>()),
    sceneSnapshot = useRef<SceneSnapshot | null>(null),
    ghostSequence = useRef(0);
  const closeTimer = useRef<number | null>(null),
    interactingWithTooltip = useRef(false),
    tooltipHandle = useRef<DetailsHandle>(null),
    lastAnchor = useRef({ x: 0, y: 0 });
  const onLayoutRef = useRef(onLayout),
    reportedSnapshot = useRef<SankeyLayout | null>(null),
    snapshotRef = useRef<SankeyLayout | null>(null),
    focusSubjectRef = useRef<SankeyDiagramHandle['focusSubject']>(() => false);
  onLayoutRef.current = onLayout;
  const uid = useId(),
    tooltipId = `${uid}-details`,
    helpId = `${uid}-help`,
    headroomPatternId = `${uid}-headroom`;
  const [measurement, setMeasurement] = useState({
    width: 0,
    font: '12px sans-serif',
    lineHeight: 16,
  });
  const [theme, setTheme] = useState<CSSProperties>({});
  const [inspection, setInspection] = useState<Inspection | null>(null),
    [roving, setRoving] = useState(0),
    [keyboardFocus, setKeyboardFocus] = useState<SankeySubject | null>(null),
    [ghost, setGhost] = useState<SceneGhost | null>(null);
  const input = useRef<'pointer' | 'keyboard'>('keyboard'),
    suppressed = useRef<SankeySubject | null>(null),
    lastKeyboard = useRef(0);
  const gesture = useRef<{
    x: number;
    y: number;
    cancelled: boolean;
    type: string;
  } | null>(null);
  const model = useMemo(() => resolveGraph(graph), [graph]);
  const subjectIndex = useMemo(() => {
    const nodes = new Map<string, number>(),
      links = new Map<string, number>();
    model.subjects.forEach((subject, index) =>
      (subject.kind === 'node' ? nodes : links).set(subject.key, index),
    );
    return { nodes, links };
  }, [model]);
  const indexOf = (subject: SankeySubject) =>
    subject.kind === 'node'
      ? (subjectIndex.nodes.get(subject.key) ?? -1)
      : (subjectIndex.links.get(subject.key) ?? -1);
  useBrowserLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0,
      disposed = false;
    const measure = () => {
      if (disposed) return;
      const computed = getComputedStyle(el),
        width = el.clientWidth,
        font = `${computed.fontStyle} ${computed.fontWeight} 12px ${computed.fontFamily}`;
      setMeasurement((old) =>
        Math.abs(old.width - width) < 0.5 && old.font === font
          ? old
          : { width, font, lineHeight: 16 },
      );
      const vars: Record<string, string> = {};
      for (const key of [
        '--flow-surface',
        '--flow-text',
        '--flow-muted-text',
        '--flow-focus',
      ]) {
        const value = computed.getPropertyValue(key).trim();
        if (value) vars[key] = value;
      }
      setTheme((old) =>
        JSON.stringify(old) === JSON.stringify(vars) ? old : vars,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    const mutations = new MutationObserver(schedule);
    mutations.observe(el, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    for (let parent = el.parentElement; parent; parent = parent.parentElement)
      mutations.observe(parent, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    void document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, []);
  const measureText = useMemo(() => {
    if (typeof document === 'undefined')
      return (text: string) => text.length * 6.6;
    const context = document.createElement('canvas').getContext('2d');
    if (context) context.font = measurement.font;
    return (text: string) =>
      context?.measureText(text).width ?? text.length * 6.6;
  }, [measurement.font]);
  const labels = useMemo(() => {
    const result = new Map<string, readonly string[]>();
    for (const subject of model.subjects) {
      const view = presentation(model, subject, formatAmount, 'label');
      const value = getLabel ? getLabel(view) : defaultLabel(view);
      result.set(
        `${subject.kind}:${subject.key}`,
        value === null
          ? []
          : typeof value === 'string'
            ? value
              ? [value]
              : []
            : [...value],
      );
    }
    return result;
  }, [model, formatAmount, getLabel]);
  const names = useMemo(
    () =>
      new Map(
        model.subjects.map((s) => [
          identity(s),
          subjectName(presentation(model, s, formatAmount, 'accessible')),
        ]),
      ),
    [model, formatAmount],
  );
  const layoutRequest = useMemo(
    () => ({
      model,
      options: {
        width: measurement.width,
        plotHeight,
        minLinkWidth,
        labels,
        measureText,
        lineHeight: measurement.lineHeight,
      },
    }),
    [model, measurement, plotHeight, minLinkWidth, labels, measureText],
  );
  const [layoutResult, setLayoutResult] = useState<
    | ({ request: typeof layoutRequest } & (
        { scene: Scene } | { error: unknown }
      ))
    | null
  >(null);
  useEffect(() => {
    if (layoutRequest.options.width <= 0 || !layoutRequest.model.nodes.size)
      return;
    const controller = new AbortController();
    runInChunks(
      layoutGraphSteps(layoutRequest.model, layoutRequest.options),
      controller.signal,
    ).then(
      (scene) => {
        if (!controller.signal.aborted)
          setLayoutResult({ request: layoutRequest, scene });
      },
      (error) => {
        if (!controller.signal.aborted)
          setLayoutResult({ request: layoutRequest, error });
      },
    );
    return () => controller.abort();
  }, [layoutRequest]);
  // Keep a completed scene during resize so focus and scrolling survive. Never
  // pair another graph's geometry with the current graph's facts or callbacks.
  const scene =
    layoutResult?.request.model === model && 'scene' in layoutResult
      ? layoutResult.scene
      : null;
  const snapshot = useMemo(
    () => (scene ? layoutSnapshot(scene, model) : null),
    [scene, model],
  );
  snapshotRef.current = snapshot;
  useEffect(() => {
    if (!onLayout) {
      reportedSnapshot.current = null;
      return;
    }
    if (!snapshot) return;
    if (reportedSnapshot.current === snapshot) return;
    reportedSnapshot.current = snapshot;
    onLayoutRef.current?.(snapshot);
  }, [snapshot, onLayout]);
  const pending =
    model.nodes.size > 0 && layoutResult?.request !== layoutRequest;
  // Snapshot completed scenes only while transitions are enabled. Selection
  // and headroom changes refresh the snapshot without starting a new crossfade.
  // Future scene-affecting options belong in this list.
  useBrowserLayoutEffect(() => {
    const enabled =
      transitionDuration > 0 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled) {
      sceneSnapshot.current = null;
      setGhost(null);
      return;
    }
    const el = svg.current;
    if (!scene || !el) return;
    const previous = sceneSnapshot.current,
      sceneChanged = previous?.scene !== scene,
      selectionChanged = previous?.selection !== selectionSignature;
    if (!sceneChanged && !selectionChanged) return;
    const next: SceneSnapshot = {
      scene,
      selection: selectionSignature,
      markup: el.innerHTML,
      width: scene.width,
      height: scene.height,
      font: measurement.font,
    };
    sceneSnapshot.current = next;
    if (!previous || !sceneChanged) return;
    ghostSequence.current += 1;
    const id = ghostSequence.current,
      prefix = `flow-${uid}-${id}-`.replace(/[^a-zA-Z0-9_-]/g, '');
    setGhost({
      id,
      markup: scopeGhostMarkup(previous.markup, prefix),
      width: previous.width,
      height: previous.height,
      font: previous.font,
      duration: transitionDuration,
      easing: transitionEasing,
    });
  }, [
    scene,
    measurement.font,
    transitionDuration,
    transitionEasing,
    selectionSignature,
    showHeadroom,
    uid,
  ]);
  useBrowserLayoutEffect(() => {
    if (!model.nodes.size) {
      sceneSnapshot.current = null;
      setGhost(null);
    }
  }, [model]);
  // Remove the ghost by its own id so a rapid replacement is not cleared by a
  // timer or animation-end event from the previous crossfade.
  useEffect(() => {
    if (!ghost) return;
    const timer = window.setTimeout(
      () => setGhost((current) => (current?.id === ghost.id ? null : current)),
      ghost.duration + 80,
    );
    return () => window.clearTimeout(timer);
  }, [ghost]);
  useBrowserLayoutEffect(() => {
    if (ghost) ghostSvg.current?.setAttribute('inert', '');
  }, [ghost]);
  const exists = useCallback(
    (s: SankeySubject | null | undefined) => subjectExists(model, s),
    [model],
  );
  const focusSubject = useCallback(
    (subject: SankeySubject) => {
      if (!exists(subject)) return false;
      const control = controls.current.get(identity(subject));
      if (!control) return false;
      const index =
        subject.kind === 'node'
          ? subjectIndex.nodes.get(subject.key)
          : subjectIndex.links.get(subject.key);
      if (index === undefined) return false;
      input.current = 'keyboard';
      suppressed.current = null;
      setRoving(index);
      control.focus({ preventScroll: true });
      return true;
    },
    [exists, subjectIndex],
  );
  focusSubjectRef.current = focusSubject;
  useImperativeHandle(
    ref,
    () => ({
      getLayout: () => snapshotRef.current,
      getSvgElement: () => svg.current,
      focusSubject: (subject) => focusSubjectRef.current(subject),
    }),
    [],
  );
  const selected = exists(selection) ? selection : null;
  const active =
    scene && inspection && exists(inspection.subject) ? inspection : null;
  const strong = useMemo(
    () => emphasis(model, active?.subject ?? null),
    [model, active?.subject],
  );
  const activeView = active
    ? presentation(model, active.subject, formatAmount, 'tooltip')
    : null;
  const tooltip = activeView ? (
    renderTooltip ? (
      renderTooltip(activeView)
    ) : (
      <DefaultDetails view={activeView} />
    )
  ) : null;
  useEffect(() => {
    setInspection((old) => (old && exists(old.subject) ? old : null));
    setKeyboardFocus((old) => (old && exists(old) ? old : null));
    setRoving((i) => Math.min(i, Math.max(0, model.subjects.length - 1)));
  }, [exists, model]);
  function repositionInspection() {
    setInspection((old) => {
      if (!old || old.modality === 'pointer') return null;
      const box = controls.current
        .get(identity(old.subject))
        ?.getBoundingClientRect();
      if (!box) return null;
      const anchor = { x: box.right, y: box.top + box.height / 2 };
      lastAnchor.current = anchor;
      return Math.abs(anchor.x - old.anchor.x) +
        Math.abs(anchor.y - old.anchor.y) <
        0.5
        ? old
        : { ...old, anchor };
    });
  }
  // Resizing/reflow can move a focused subject without scrolling the page.
  useBrowserLayoutEffect(() => {
    repositionInspection();
  }, [scene]);
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  function closeSoon(restart = false) {
    if (!active || active.modality !== 'pointer' || active.pinned) return;
    if (closeTimer.current !== null) {
      if (!restart) return;
      cancelClose();
    }
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setInspection(null);
    }, 300);
  }
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => {
      if (tooltipHandle.current?.contains(e.target as Node)) {
        interactingWithTooltip.current = true;
        cancelClose();
        return;
      }
      interactingWithTooltip.current = false;
      if (!root.current?.contains(e.target as Node)) {
        cancelClose();
        setKeyboardFocus(null);
        setInspection(null);
        suppressed.current = null;
      }
    };
    // A pointer entering the portal is outside the diagram, so keep its close
    // delay alive even when React does not synthesize pointerenter.
    const over = (e: globalThis.PointerEvent) => {
      if (tooltipHandle.current?.contains(e.target as Node)) cancelClose();
    };
    // Tab is dispatched on the previous control, before focus enters us.
    const keyboard = () => {
      input.current = 'keyboard';
    };
    const scroll = (event: Event) => {
      // A portal's own scrolling does not move the diagram or its anchor.
      // Preserve pointer inspection while reading overflowing details.
      if (
        event.target instanceof Node &&
        tooltipHandle.current?.contains(event.target)
      ) {
        cancelClose();
        return;
      }
      repositionInspection();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('pointerover', over);
    document.addEventListener('keydown', keyboard, true);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('scroll', scroll, true);
    };
  }, []);
  const locate = (event: { clientX: number; clientY: number }) => {
    if (!scene || !svg.current) return null;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return hitTest(
      scene,
      point,
      active?.subject.kind === 'link' ? active.subject.key : null,
    );
  };
  function inspect(
    subject: SankeySubject | null,
    x: number,
    y: number,
    modality: Inspection['modality'] = 'pointer',
    pinned = false,
  ) {
    if (!subject) {
      if (
        modality === 'pointer' &&
        active?.modality === 'pointer' &&
        !active.pinned
      )
        closeSoon();
      else if (!active?.pinned) {
        cancelClose();
        setInspection(null);
      }
      suppressed.current = null;
      return;
    }
    if (same(subject, suppressed.current)) return;
    suppressed.current = null;
    cancelClose();
    if (
      inspection &&
      same(inspection.subject, subject) &&
      inspection.modality === modality &&
      inspection.pinned === pinned
    ) {
      if (anchorMoved(lastAnchor.current, { x, y })) {
        lastAnchor.current = { x, y };
        tooltipHandle.current?.move(lastAnchor.current);
      }
      return;
    }
    lastAnchor.current = { x, y };
    setInspection({
      subject,
      anchor: lastAnchor.current,
      modality,
      pinned,
    });
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    if (
      gesture.current &&
      Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) >
        8
    )
      gesture.current.cancelled = true;
    if (e.pointerType === 'touch' || e.buttons) return;
    input.current = 'pointer';
    inspect(locate(e), e.clientX, e.clientY);
  }
  function activate(subject: SankeySubject, event: SankeyActivationEvent) {
    if (subject.kind === 'node')
      onNodeClick?.(model.nodes.get(subject.key)!, event);
    else onLinkClick?.(model.links.get(subject.key)!, event);
  }
  function click(e: MouseEvent<SVGSVGElement>) {
    if (
      e.button !== 0 ||
      gesture.current?.cancelled ||
      (e.detail === 0 && performance.now() - lastKeyboard.current < 150)
    ) {
      gesture.current = null;
      return;
    }
    const control = (e.target as Element).closest<SVGGElement>(
      '[data-flow-subject]',
    );
    const subject =
      e.detail === 0 && control
        ? {
            kind: control.dataset.kind as SankeySubject['kind'],
            key: control.dataset.key!,
          }
        : locate(e);
    const touch = gesture.current?.type === 'touch';
    gesture.current = null;
    if (!subject) {
      cancelClose();
      setInspection(null);
      suppressed.current = null;
      return;
    }
    input.current = 'pointer';
    setKeyboardFocus(null);
    suppressed.current = null;
    const index = indexOf(subject);
    setRoving(index);
    controls.current.get(identity(subject))?.focus({ preventScroll: true });
    inspect(subject, e.clientX, e.clientY, touch ? 'touch' : 'pointer', touch);
    activate(subject, e);
  }
  function keyDown(
    e: KeyboardEvent<SVGGElement>,
    subject: SankeySubject,
    index: number,
  ) {
    input.current = 'keyboard';
    setKeyboardFocus(subject);
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? model.subjects.length - 1
            : Math.max(0, Math.min(model.subjects.length - 1, index + delta));
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
      if (e.repeat) return;
      lastKeyboard.current = performance.now();
      suppressed.current = null;
      const r = e.currentTarget.getBoundingClientRect();
      inspect(subject, r.right, r.top + r.height / 2, 'keyboard', true);
      activate(subject, e);
    }
  }
  function keyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
    input.current = 'keyboard';
    if (
      e.key !== 'Escape' ||
      !active ||
      !tooltipHandle.current?.contains(e.target as Node)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    cancelClose();
    interactingWithTooltip.current = false;
    suppressed.current = active.subject;
    setInspection(null);
    setKeyboardFocus(active.subject);
    // Restore the diagram's roving tab stop without reopening dismissed details.
    controls.current
      .get(identity(active.subject))
      ?.focus({ preventScroll: true });
  }
  const subjectProps = (subject: SankeySubject) => {
    const index = indexOf(subject);
    return {
      ref: (el: SVGGElement | null) => {
        if (el) controls.current.set(identity(subject), el);
        else controls.current.delete(identity(subject));
      },
      role: 'button',
      tabIndex: index === Math.min(roving, model.subjects.length - 1) ? 0 : -1,
      'aria-label': names.get(identity(subject)),
      'aria-pressed':
        selection === undefined ? undefined : same(subject, selected),
      'aria-describedby':
        same(subject, active?.subject ?? null) && tooltip
          ? `${helpId} ${tooltipId}`
          : helpId,
      'data-flow-subject': '',
      'data-kind': subject.kind,
      'data-key': subject.key,
      'data-selected': same(subject, selected) ? 'true' : 'false',
      onKeyDown: (e: KeyboardEvent<SVGGElement>) => keyDown(e, subject, index),
      onFocus: (e: React.FocusEvent<SVGGElement>) => {
        setRoving(index);
        if (input.current === 'pointer' || same(subject, suppressed.current))
          return;
        setKeyboardFocus(subject);
        suppressed.current = null;
        const r = e.currentTarget.getBoundingClientRect();
        inspect(subject, r.right, r.top + r.height / 2, 'keyboard');
      },
      style: { outline: 'none' } as CSSProperties,
    };
  };
  const ordered = scene
    ? [...scene.links].sort((a, b) => {
        const rank = (key: string) =>
          active?.subject.kind === 'link' && active.subject.key === key
            ? 2
            : selected?.kind === 'link' && selected.key === key
              ? 1
              : 0;
        return rank(a.key) - rank(b.key);
      })
    : [];
  if (layoutResult?.request === layoutRequest && 'error' in layoutResult)
    throw layoutResult.error;
  return (
    <div
      ref={root}
      aria-busy={pending}
      className={['flow-diagram', className].filter(Boolean).join(' ')}
      onKeyDownCapture={keyDownCapture}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (
          e.currentTarget.contains(next) ||
          tooltipHandle.current?.contains(next) ||
          interactingWithTooltip.current
        ) {
          interactingWithTooltip.current = false;
          return;
        }
        cancelClose();
        setKeyboardFocus(null);
        setInspection(null);
        suppressed.current = null;
        input.current = 'keyboard';
      }}
    >
      <span className="flow-sr-only" id={helpId}>
        Use arrow keys to inspect nodes and links. Enter or Space activates the
        focused subject. Escape dismisses details. Selection is controlled by
        the surrounding application.
      </span>
      {!model.nodes.size ? (
        <div role="group" aria-label={accessibleName} className="flow-empty">
          No flow data
        </div>
      ) : !scene ? (
        <div
          role="status"
          className="flow-measuring"
          aria-label={accessibleName}
          style={{ height: plotHeight }}
        >
          Preparing diagram…
        </div>
      ) : (
        <div
          className={`flow-scroll${scene.width > measurement.width ? ' flow-scroll--overflow' : ''}`}
          data-flow-scroll=""
        >
          {ghost && (
            <svg
              key={ghost.id}
              ref={ghostSvg}
              className="flow-canvas flow-canvas--ghost"
              aria-hidden="true"
              focusable="false"
              width={ghost.width}
              height={ghost.height}
              viewBox={`0 0 ${ghost.width} ${ghost.height}`}
              style={{
                font: ghost.font,
                animationDuration: `${ghost.duration}ms`,
                animationTimingFunction: ghost.easing,
              }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget)
                  setGhost((current) =>
                    current?.id === ghost.id ? null : current,
                  );
              }}
              dangerouslySetInnerHTML={{ __html: ghost.markup }}
            />
          )}
          <svg
            ref={svg}
            role="group"
            aria-label={accessibleName}
            width={scene.width}
            height={scene.height}
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            className={`flow-canvas${ghost ? ' flow-canvas--entering' : ''}`}
            style={{
              font: measurement.font,
              cursor: active?.modality === 'pointer' ? 'pointer' : undefined,
            }}
            data-top-band={scene.topBand}
            data-bottom-band={scene.bottomBand}
            data-crossings={scene.diagnostics.crossings}
            data-obstacle-collisions={scene.diagnostics.obstacleCollisions}
            onPointerMove={pointerMove}
            onPointerLeave={() => {
              suppressed.current = null;
              closeSoon(true);
            }}
            onPointerDown={(e) => {
              if (e.button === 0) {
                input.current = 'pointer';
                gesture.current = {
                  x: e.clientX,
                  y: e.clientY,
                  cancelled: false,
                  type: e.pointerType,
                };
              }
            }}
            onPointerCancel={() => {
              if (gesture.current) gesture.current.cancelled = true;
            }}
            onClick={click}
          >
            {showHeadroom && (
              <defs>
                <pattern
                  id={headroomPatternId}
                  width={6}
                  height={6}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect
                    width={6}
                    height={6}
                    fill="var(--flow-headroom-track, transparent)"
                  />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    stroke="var(--flow-headroom, #68758b)"
                    strokeWidth={2}
                  />
                </pattern>
              </defs>
            )}
            <g
              className="flow-scene-content"
              style={
                ghost
                  ? {
                      animationDuration: `${ghost.duration}ms`,
                      animationTimingFunction: ghost.easing,
                    }
                  : undefined
              }
            >
              {ordered.map((f) => {
                const subject: SankeySubject = {
                    kind: 'link',
                    key: f.key,
                  },
                  isSelected = same(subject, selected),
                  focused = same(subject, keyboardFocus),
                  strongFlow = strong.links.has(f.key),
                  opacity = strongFlow
                    ? same(subject, active?.subject ?? null)
                      ? 0.75
                      : 0.4
                    : 0.1;
                return (
                  <g
                    key={f.key}
                    {...subjectProps(subject)}
                    data-emphasis={strongFlow ? 'strong' : 'faded'}
                  >
                    {isSelected && (
                      <g
                        aria-hidden="true"
                        className="flow-decoration"
                        data-selection-outline=""
                      >
                        <path
                          d={f.ribbon?.path ?? f.route.path}
                          stroke="var(--flow-surface, white)"
                          strokeWidth={(f.ribbon ? 0 : f.width) + 8}
                        />
                        <path
                          d={f.ribbon?.path ?? f.route.path}
                          stroke={f.color}
                          strokeWidth={(f.ribbon ? 0 : f.width) + 5}
                        />
                        <path
                          d={f.ribbon?.path ?? f.route.path}
                          stroke="var(--flow-surface, white)"
                          strokeWidth={(f.ribbon ? 0 : f.width) + 2}
                        />
                      </g>
                    )}
                    <path
                      data-link-paint=""
                      d={f.ribbon?.path ?? f.route.path}
                      fill={f.ribbon ? f.color : 'none'}
                      stroke={f.ribbon ? 'none' : f.color}
                      strokeWidth={f.width}
                      opacity={opacity}
                      pointerEvents="none"
                      aria-hidden="true"
                    />
                    {focused && (
                      <g className="flow-decoration" aria-hidden="true">
                        <path
                          d={f.route.path}
                          stroke="var(--flow-surface, white)"
                          strokeWidth={4}
                        />
                        <path
                          d={f.route.path}
                          stroke="var(--flow-focus, #2644af)"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                        />
                      </g>
                    )}
                  </g>
                );
              })}
              {scene.nodes.map((n) => {
                const subject: SankeySubject = {
                    kind: 'node',
                    key: n.key,
                  },
                  isSelected = same(subject, selected),
                  focused = same(subject, keyboardFocus),
                  strongItem = strong.nodes.has(n.key);
                return (
                  <g
                    key={n.key}
                    {...subjectProps(subject)}
                    data-emphasis={strongItem ? 'strong' : 'faded'}
                  >
                    <rect
                      data-node-paint=""
                      x={n.x}
                      y={n.y}
                      width={n.w}
                      height={n.h}
                      fill={n.zero ? 'none' : n.color}
                      stroke={n.zero ? n.color : undefined}
                      strokeWidth={1}
                      opacity={strongItem ? 1 : 0.25}
                      pointerEvents="none"
                      aria-hidden="true"
                    />
                    {showHeadroom && n.headroom && (
                      <rect
                        className="flow-headroom"
                        data-headroom-node={n.key}
                        x={n.headroom.x}
                        y={n.headroom.y}
                        width={n.headroom.w}
                        height={n.headroom.h}
                        fill={`url(#${headroomPatternId})`}
                        opacity={strongItem ? 1 : 0.25}
                        pointerEvents="none"
                        aria-hidden="true"
                      />
                    )}
                    {isSelected && (
                      <g
                        className="flow-decoration"
                        data-selection-outline=""
                        aria-hidden="true"
                      >
                        <rect
                          x={n.x - 4}
                          y={n.y - 4}
                          width={n.w + 8}
                          height={n.h + 8}
                          stroke="var(--flow-surface, white)"
                          strokeWidth={6}
                        />
                        <rect
                          x={n.x - 4}
                          y={n.y - 4}
                          width={n.w + 8}
                          height={n.h + 8}
                          stroke={n.color}
                          strokeWidth={2}
                        />
                      </g>
                    )}
                    {focused && (
                      <rect
                        className="flow-decoration"
                        x={n.x - 8}
                        y={n.y - 8}
                        width={n.w + 16}
                        height={n.h + 16}
                        stroke="var(--flow-focus, #2644af)"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        aria-hidden="true"
                      />
                    )}
                  </g>
                );
              })}
              {scene.links
                .filter(
                  (f) =>
                    !f.labelHidden ||
                    same(active?.subject ?? null, {
                      kind: 'link',
                      key: f.key,
                    }),
                )
                .map((f) => (
                  <Text
                    key={`t-${f.key}`}
                    box={f.label}
                    className="flow-label flow-link-label"
                    opacity={strong.links.has(f.key) ? 1 : 0.25}
                  />
                ))}
              {scene.nodes.map((n) => (
                <Text
                  key={`i-${n.key}`}
                  box={n.label}
                  className="flow-label"
                  opacity={strong.nodes.has(n.key) ? 1 : 0.25}
                />
              ))}
              {renderOverlay && snapshot ? (
                <g
                  className="flow-overlay"
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {renderOverlay(snapshot)}
                </g>
              ) : null}
            </g>
          </svg>
        </div>
      )}
      {active && tooltip && typeof document !== 'undefined' ? (
        <Details
          ref={tooltipHandle}
          id={tooltipId}
          anchor={
            active.modality === 'pointer' ? lastAnchor.current : active.anchor
          }
          theme={theme}
          onPointerEnter={cancelClose}
          onPointerLeave={() => closeSoon(true)}
          onPointerDown={() => {
            interactingWithTooltip.current = true;
            cancelClose();
          }}
        >
          {tooltip}
        </Details>
      ) : null}
    </div>
  );
}
const SankeyDiagramForward = forwardRef(
  SankeyDiagramRender as ForwardRefRenderFunction<
    SankeyDiagramHandle,
    SankeyDiagramProps
  >,
);
SankeyDiagramForward.displayName = 'SankeyDiagram';
/**
 * Generic forwardRef component. The cast keeps `graph`, `onNodeClick` and the
 * presentation callbacks tied to the caller's metadata types in declarations.
 */
export const SankeyDiagram = SankeyDiagramForward as <I = unknown, T = unknown>(
  props: SankeyDiagramProps<I, T> & { ref?: Ref<SankeyDiagramHandle> },
) => ReactElement;
