import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SankeyDiagram } from '../src/SankeyDiagram.js';
import { emphasis, resolveGraph } from '../src/model.js';
import {
  anchorMoved,
  identity,
  inspectionReport,
  scopeGhostMarkup,
  scopeGhostMarkupFallback,
  tooltipPosition,
  transitionTiming,
} from '../src/presentation.js';
import {
  SankeyInputError,
  type SankeyDiagramHandle,
  type SankeyGraph,
} from '../src/types.js';

const highlightFixture: SankeyGraph = {
  stages: ['a', 'b', 'c', 'd'],
  nodes: [
    { key: 'a', title: 'A', placement: { stage: 'a' } },
    { key: 'b', title: 'B', placement: { stage: 'b' } },
    { key: 'c', title: 'C', placement: { stage: 'c' } },
    { key: 'd', title: 'D', placement: { stage: 'd' } },
  ],
  links: [
    { key: 'ab', from: 'a', to: 'b', amount: 10 },
    { key: 'bc', from: 'b', to: 'c', amount: 10 },
    { key: 'cd', from: 'c', to: 'd', amount: 10 },
  ],
};

const sharedKeyFixture: SankeyGraph = {
  stages: ['a', 'b'],
  nodes: [
    { key: 'shared', title: 'Shared node', placement: { stage: 'a' } },
    { key: 'source', title: 'Source', placement: { stage: 'a' } },
    { key: 'target', title: 'Target', placement: { stage: 'b' } },
    { key: 'other', title: 'Other', placement: { stage: 'b' } },
  ],
  links: [
    { key: 'shared', from: 'source', to: 'target', amount: 10 },
    { key: 'from-shared', from: 'shared', to: 'other', amount: 10 },
  ],
};

const css = readFileSync(
  new URL('../../src/style.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body =
    css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ??
    '';
  return new Map(
    body
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const colon = entry.indexOf(':');
        return [
          entry.slice(0, colon).trim(),
          entry
            .slice(colon + 1)
            .trim()
            .replace(/\s+/g, ' '),
        ];
      }),
  );
};

test('tooltip placement offsets, flips and clamps inside the viewport', () => {
  const size = { width: 200, height: 100 },
    viewport = { width: 800, height: 600 };
  assert.deepEqual(tooltipPosition({ x: 100, y: 100 }, size, viewport), {
    x: 116,
    y: 116,
  });
  assert.deepEqual(tooltipPosition({ x: 700, y: 500 }, size, viewport), {
    x: 484,
    y: 384,
  });
  assert.deepEqual(
    tooltipPosition({ x: 0, y: 0 }, { width: 900, height: 900 }, viewport),
    {
      x: 8,
      y: 8,
    },
  );
});

test('anchor movement threshold filters sub-pixel jitter and tracks return to origin', () => {
  let last = { x: 100, y: 100 };
  assert.equal(anchorMoved(last, { x: 100.4, y: 100.4 }), false);
  assert.equal(anchorMoved(last, { x: 180, y: 140 }), true);
  last = { x: 180, y: 140 };
  assert.equal(anchorMoved(last, { x: 180.2, y: 140.2 }), false);
  assert.equal(
    anchorMoved(last, { x: 100, y: 100 }),
    true,
    'returning to the entry point moves relative to the latest anchor',
  );
});

test('SankeyDiagram renders empty and measuring states and validates input graphs', () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(SankeyDiagram, {
      graph: { stages: [], nodes: [], links: [] },
      accessibleName: 'Empty flow',
    }),
  );
  assert.match(emptyHtml, /aria-label="Empty flow"/);
  assert.match(emptyHtml, /No flow data/);

  const busyHtml = renderToStaticMarkup(
    createElement(SankeyDiagram, {
      graph: {
        stages: ['a', 'b'],
        nodes: [
          { key: 'a', title: 'A', placement: { stage: 'a' } },
          { key: 'b', title: 'B', placement: { stage: 'b' } },
        ],
        links: [{ key: 'ab', from: 'a', to: 'b', amount: 10 }],
      },
      accessibleName: 'Active flow',
      plotHeight: 420,
    }),
  );
  assert.match(busyHtml, /aria-busy="true"/);
  assert.match(busyHtml, /Use arrow keys to inspect nodes and links/);
  assert.match(busyHtml, /height:420px/);

  assert.throws(
    () =>
      renderToStaticMarkup(
        createElement(SankeyDiagram, {
          graph: {
            stages: ['a'],
            nodes: [{ key: 'a', title: 'A', placement: { stage: 'a' } }],
            links: [{ key: 'bad', from: 'a', to: 'a', amount: 1 }],
          },
          accessibleName: 'Invalid flow',
        }),
      ),
    SankeyInputError,
  );
});

test('transition settings normalize defaults and reject invalid durations', () => {
  assert.equal(transitionTiming(undefined), null);
  assert.equal(transitionTiming(false), null);
  assert.deepEqual(transitionTiming({}), {
    duration: 280,
    easing: 'ease-out',
  });
  assert.deepEqual(transitionTiming({ duration: 0 }), {
    duration: 0,
    easing: 'ease-out',
  });
  assert.deepEqual(transitionTiming({ duration: 10_000 }), {
    duration: 10_000,
    easing: 'ease-out',
  });
  assert.deepEqual(transitionTiming({ duration: 320, easing: 'linear' }), {
    duration: 320,
    easing: 'linear',
  });
  for (const duration of [-1, Number.NaN, Infinity, 10_001])
    assert.throws(
      () => transitionTiming({ duration }),
      (error: unknown) =>
        error instanceof SankeyInputError &&
        error.issues.some((issue) => issue.code === 'invalid-number'),
    );
});

// Node has no DOMParser, so these exercise the fallback; browsers use the DOM path.
test('ghost scoping protects text nodes, data-id and tab stops', () => {
  const markup =
    '<g id="foo" data-id="foo" tabindex="0">' +
    '<text>id="foo" href="#foo" url(#foo)</text>' +
    '<rect id="bar" fill="url(#bar)"></rect></g>';
  const scoped = scopeGhostMarkupFallback(markup, 'ghost-');
  assert.match(scoped, /<g id="ghost-foo" data-id="foo">/);
  assert.doesNotMatch(scoped, /tabindex/);
  assert.match(scoped, /<text>id="foo" href="#foo" url\(#foo\)<\/text>/);
  assert.match(
    scoped,
    /<rect id="ghost-bar" fill="url\(#ghost-bar\)"><\/rect>/,
  );
  assert.match(markup, /id="foo"/);
});

test('ghost scoping handles quoted, unquoted and escaped references', () => {
  const markup =
    '<use href="#foo" xlink:href=\'#foo\'></use>' +
    '<use href=#foo xlink:href=#foo></use>' +
    '<use href="&#35;foo" xlink:href="&#35;foo"></use>' +
    '<rect style="fill:url(&quot;#foo&quot;)" ' +
    'clip-path="url(&#35;foo)"></rect>';
  const scoped = scopeGhostMarkupFallback(markup, 'ghost-');
  assert.match(scoped, /href="#ghost-foo" xlink:href='#ghost-foo'/);
  assert.match(scoped, /href=#ghost-foo xlink:href=#ghost-foo/);
  assert.match(scoped, /href="#ghost-foo" xlink:href="#ghost-foo"/);
  assert.match(
    scoped,
    /style="fill:url\(#ghost-foo\)" clip-path="url\(#ghost-foo\)"/,
  );
});

test('the public ghost scoper uses the available parser and namespaces ids', () => {
  const markup =
    '<defs><pattern id="headroom" width="4" height="4"></pattern></defs>' +
    '<rect data-id="headroom" fill="url(#headroom)"></rect>';
  const scoped = scopeGhostMarkup(markup, 'flow-ghost-3-');
  assert.match(scoped, /id="flow-ghost-3-headroom"/);
  assert.match(scoped, /data-id="headroom"/);
  assert.match(scoped, /fill="url\(#flow-ghost-3-headroom\)"/);
  assert.match(markup, /id="headroom"/);
});

test('SankeyDiagram accepts disabled and zero-duration transitions in SSR', () => {
  const graph = {
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [{ key: 'ab', from: 'a', to: 'b', amount: 10 }],
  };
  for (const transition of [false, { duration: 0 }] as const) {
    const html = renderToStaticMarkup(
      createElement(SankeyDiagram, {
        graph,
        accessibleName: 'Transition flow',
        transition,
      }),
    );
    assert.match(html, /aria-busy="true"/);
  }
  for (const duration of [-1, Number.NaN, Infinity, 10_001])
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(SankeyDiagram, {
            graph,
            accessibleName: 'Invalid transition',
            transition: { duration },
          }),
        ),
      (error: unknown) =>
        error instanceof SankeyInputError &&
        error.issues.some((issue) => issue.code === 'invalid-number'),
    );
});

test('the transition ghost is clipped, transparent and non-interactive', () => {
  const ghost = declarations('.flow-canvas--ghost');
  assert.equal(ghost.get('position'), 'absolute');
  assert.equal(ghost.get('pointer-events'), 'none');
  assert.equal(ghost.get('background'), 'transparent');
  assert.equal(declarations('.flow-scroll').get('overflow'), 'clip');
  assert.equal(declarations('.flow-scroll--overflow').get('overflow'), 'auto');
  assert.match(css, /\.flow-canvas--ghost\{display:none!important\}/);
});

// The suite has no DOM harness, so this covers prop/type acceptance only.
// Handle identity, cached getLayout() and onLayout dedupe need a browser/DOM test.
test('SankeyDiagram accepts ref, onLayout and renderOverlay during server rendering', () => {
  const ref = createRef<SankeyDiagramHandle>(),
    html = renderToStaticMarkup(
      createElement(SankeyDiagram, {
        ref,
        graph: {
          stages: ['a', 'b'],
          nodes: [
            { key: 'a', title: 'A', placement: { stage: 'a' } },
            { key: 'b', title: 'B', placement: { stage: 'b' } },
          ],
          links: [{ key: 'ab', from: 'a', to: 'b', amount: 10 }],
        },
        accessibleName: 'Server flow',
        onLayout: () => undefined,
        renderOverlay: () => null,
      }),
    );
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Preparing diagram/);
  assert.equal(
    (SankeyDiagram as unknown as { displayName?: string }).displayName,
    'SankeyDiagram',
  );
});

test('the canvas leaves pinch zoom to the browser', () => {
  assert.equal(
    declarations('.flow-canvas').get('touch-action'),
    'pan-x pan-y pinch-zoom',
  );
});

test('tooltips accept pointer input and scroll when content is oversized', () => {
  const tooltip = declarations('.flow-tooltip');
  assert.equal(tooltip.get('pointer-events'), 'auto');
  assert.equal(tooltip.get('overflow-y'), 'auto');
  assert.equal(tooltip.get('overscroll-behavior'), 'contain');
});

test('the published stylesheet declares its type entry', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as {
    exports: Record<string, { types?: string; default?: string }>;
    files: string[];
  };
  assert.deepEqual(pkg.exports['./style.css'], {
    types: './dist/style.css.d.ts',
    default: './dist/style.css',
  });
  assert.ok(pkg.files.includes('dist/style.css.d.ts'));
});

test('external highlight unions multiple one-hop subjects', () => {
  const model = resolveGraph(highlightFixture),
    strong = emphasis(model, [
      { kind: 'node', key: 'a' },
      { kind: 'link', key: 'bc' },
    ]);
  assert.deepEqual([...strong.nodes].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...strong.links].sort(), ['ab', 'bc']);
});

test('external highlight stays one hop and does not traverse further', () => {
  const model = resolveGraph(highlightFixture),
    node = emphasis(model, { kind: 'node', key: 'b' }),
    link = emphasis(model, { kind: 'link', key: 'bc' });
  assert.deepEqual([...node.nodes].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...node.links].sort(), ['ab', 'bc']);
  assert.equal(node.nodes.has('d'), false);
  assert.equal(node.links.has('cd'), false);
  assert.deepEqual([...link.nodes].sort(), ['b', 'c']);
  assert.deepEqual([...link.links], ['bc']);
});

test('external highlight ignores unknown keys and keeps valid subjects', () => {
  const model = resolveGraph(highlightFixture),
    mixed = emphasis(model, [
      { kind: 'node', key: 'missing' },
      { kind: 'link', key: 'bc' },
      { kind: 'link', key: 'missing' },
    ]),
    mixedNode = emphasis(model, [
      { kind: 'node', key: 'b' },
      { kind: 'node', key: 'missing' },
      { kind: 'link', key: 'missing' },
    ]),
    unknownOnly = emphasis(model, [
      { kind: 'node', key: 'missing' },
      { kind: 'link', key: 'missing' },
    ]);
  assert.deepEqual([...mixed.nodes].sort(), ['b', 'c']);
  assert.deepEqual([...mixed.links], ['bc']);
  assert.deepEqual([...mixedNode.nodes].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...mixedNode.links].sort(), ['ab', 'bc']);
  assert.deepEqual([...unknownOnly.nodes].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...unknownOnly.links].sort(), ['ab', 'bc', 'cd']);
});

test('duplicate highlight subjects do not change emphasis', () => {
  const model = resolveGraph(highlightFixture),
    single = emphasis(model, { kind: 'node', key: 'b' }),
    duplicate = emphasis(model, [
      { kind: 'node', key: 'b' },
      { kind: 'node', key: 'b' },
      { kind: 'link', key: 'bc' },
      { kind: 'link', key: 'bc' },
    ]);
  assert.deepEqual([...duplicate.nodes].sort(), [...single.nodes].sort());
  assert.equal(duplicate.nodes.size, single.nodes.size);
  assert.equal(duplicate.links.size, single.links.size);
});

test('node and link highlight keys are scoped by kind', () => {
  const model = resolveGraph(sharedKeyFixture),
    node = emphasis(model, { kind: 'node', key: 'shared' }),
    link = emphasis(model, { kind: 'link', key: 'shared' });
  assert.deepEqual([...node.nodes].sort(), ['other', 'shared']);
  assert.deepEqual([...node.links], ['from-shared']);
  assert.deepEqual([...link.nodes].sort(), ['source', 'target']);
  assert.deepEqual([...link.links], ['shared']);
});

test('an empty highlight list does not erase active inspection', () => {
  const model = resolveGraph(highlightFixture),
    inspected = { kind: 'node', key: 'b' } as const,
    strong = emphasis(model, [inspected]);
  assert.deepEqual([...strong.nodes].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...strong.links].sort(), ['ab', 'bc']);
  assert.equal(emphasis(model, []).nodes.size, model.nodes.size);
});

test('inspection reporting replays on attach and dedupes unchanged subjects', () => {
  const subject = { kind: 'node', key: 'a' } as const,
    keyboard = { subject, modality: 'keyboard' } as const;
  assert.deepEqual(inspectionReport(null, false, keyboard), {
    reported: null,
    inspection: null,
    changed: false,
  });
  const attached = inspectionReport(null, true, keyboard);
  assert.equal(attached.reported, `${identity(subject)}:keyboard`);
  assert.deepEqual(attached.inspection, keyboard);
  assert.equal(attached.changed, true);
  const unchanged = inspectionReport(attached.reported, true, keyboard);
  assert.deepEqual(unchanged, {
    reported: attached.reported,
    inspection: keyboard,
    changed: false,
  });
  const pointed = inspectionReport(attached.reported, true, {
    subject,
    modality: 'pointer',
  });
  assert.equal(pointed.changed, true);
  assert.equal(pointed.reported, `${identity(subject)}:pointer`);
  const removed = inspectionReport(pointed.reported, false, {
    subject,
    modality: 'pointer',
  });
  assert.deepEqual(removed, {
    reported: null,
    inspection: null,
    changed: false,
  });
  const readded = inspectionReport(removed.reported, true, {
    subject,
    modality: 'pointer',
  });
  assert.equal(readded.changed, true);
  assert.deepEqual(readded.inspection, { subject, modality: 'pointer' });
  const dismissed = inspectionReport(readded.reported, true, null);
  assert.equal(dismissed.changed, true);
  assert.equal(dismissed.reported, null);
  assert.equal(dismissed.inspection, null);
});

test('omitting external highlight preserves the all-strong default', () => {
  const model = resolveGraph(highlightFixture);
  for (const strong of [emphasis(model, null), emphasis(model, [])]) {
    assert.deepEqual([...strong.nodes].sort(), ['a', 'b', 'c', 'd']);
    assert.deepEqual([...strong.links].sort(), ['ab', 'bc', 'cd']);
  }
});

test('SSR accepts external inspection props without invoking the callback', () => {
  let calls = 0;
  const html = renderToStaticMarkup(
    createElement(SankeyDiagram, {
      graph: highlightFixture,
      accessibleName: 'External inspection flow',
      highlight: [
        { kind: 'node', key: 'b' },
        { kind: 'node', key: 'missing' },
      ],
      onInspectChange: () => {
        calls += 1;
      },
    }),
  );
  assert.match(html, /Preparing diagram/);
  assert.equal(calls, 0);
});
