import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SankeyDiagram } from '../src/SankeyDiagram.js';
import {
  anchorMoved,
  scopeGhostMarkup,
  scopeGhostMarkupFallback,
  tooltipPosition,
  transitionTiming,
} from '../src/presentation.js';
import { SankeyInputError, type SankeyDiagramHandle } from '../src/types.js';

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
