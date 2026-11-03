import type { SankeyGraph } from '../src/types.js';

/** Four columns of 25 nodes; four forward links per node, wrapping at each column end. */
export function stressGraph(): SankeyGraph {
  const stages = ['a', 'b', 'c', 'd'];
  const nodes = stages.flatMap((stage, s) =>
    Array.from({ length: 25 }, (_, n) => ({
      key: `${s}-${n}`,
      title: `Node ${s}-${n}`,
      placement: { stage },
    })),
  );
  const links = stages.slice(0, -1).flatMap((_, s) =>
    Array.from({ length: 25 }, (_, n) =>
      Array.from({ length: 4 }, (_, offset) => ({
        key: `${s}-${n}-${offset}`,
        from: `${s}-${n}`,
        to: `${s + 1}-${(n + offset) % 25}`,
        amount: 10 + offset,
      })),
    ).flat(),
  );
  return { stages, nodes, links };
}

/**
 * Eight columns of twelve long-titled nodes with seeded pseudo-random targets;
 * about a third of the links skip a column. Skipping links run behind
 * intermediate bars and labels, so this exercises obstacle detours and the
 * width-retry loop that the regular stress graph never reaches.
 */
export function obstacleGraph(): SankeyGraph {
  const stages = Array.from({ length: 8 }, (_, s) => `s${s}`);
  const nodes = stages.flatMap((stage, s) =>
    Array.from({ length: 12 }, (_, n) => ({
      key: `s${s}n${n}`,
      title: `Node long label s${s}n${n}`,
      placement: { stage },
    })),
  );
  let seed = 11;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const links: SankeyGraph['links'][number][] = [];
  for (let s = 0; s < stages.length - 1; s++)
    for (let n = 0; n < 12; n++) {
      const hop = next() < 0.35 && s + 2 < stages.length ? 2 : 1;
      links.push({
        key: `l${links.length}`,
        from: `s${s}n${n}`,
        to: `s${s + hop}n${Math.floor(next() * 12)}`,
        amount: 1 + Math.floor(next() * 5),
      });
    }
  return { stages, nodes, links };
}
