import type { Scene, TextBox } from './layout.js';
import type { ResolvedGraph } from './model.js';
import type {
  SankeyLayout,
  SankeyLayoutLabel,
  SankeyLayoutLink,
  SankeyLayoutNode,
} from './types.js';

function label(box: TextBox): SankeyLayoutLabel {
  return {
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    anchor: box.anchor,
    lines: [...box.lines],
  };
}

/** Copy the completed scene into a DOM-free, typed read-only public snapshot. */
export function layoutSnapshot<I, T>(
  scene: Scene,
  model: ResolvedGraph<I, T>,
): SankeyLayout {
  const nodes = new Map<string, SankeyLayoutNode>(),
    stageX = new Map<string, number>();
  for (const node of scene.nodes) {
    const facts = model.nodes.get(node.key);
    if (node.stage !== undefined && !stageX.has(node.stage))
      stageX.set(node.stage, node.x);
    nodes.set(node.key, {
      key: node.key,
      x: node.x,
      y: node.y,
      width: node.w,
      height: node.h,
      ...(node.stage === undefined ? {} : { stage: node.stage }),
      ...(node.edge === undefined ? {} : { edge: node.edge }),
      color: node.color,
      total: facts?.total ?? 0,
      incoming: facts?.incoming ?? 0,
      outgoing: facts?.outgoing ?? 0,
      ...(facts?.unit === undefined ? {} : { unit: facts.unit }),
      label: label(node.label),
    });
  }
  const links = new Map<string, SankeyLayoutLink>();
  for (const link of scene.links)
    links.set(link.key, {
      key: link.key,
      from: link.from,
      to: link.to,
      path: link.ribbon?.path ?? link.route.path,
      width: link.width,
      color: link.color,
      label: label(link.label),
      labelHidden: link.labelHidden,
    });
  return {
    width: scene.width,
    height: scene.height,
    topBand: scene.topBand,
    bottomBand: scene.bottomBand,
    scale: scene.scale,
    plot: {
      top: scene.centralTop,
      bottom: scene.centralTop + scene.centralHeight,
      height: scene.centralHeight,
    },
    stages: model.stages.map((key) => ({ key, x: stageX.get(key) ?? 0 })),
    nodes,
    links,
    diagnostics: {
      crossings: scene.diagnostics.crossings,
      obstacleCollisions: scene.diagnostics.obstacleCollisions,
    },
  };
}
