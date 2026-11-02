import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SankeyDiagram } from '../src/SankeyDiagram.js';
import { anchorMoved, tooltipPosition } from '../src/presentation.js';
import { SankeyInputError } from '../src/types.js';

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
