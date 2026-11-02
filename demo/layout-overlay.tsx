import type { SankeyLayout } from '../src/index.js';

const stageLabel = (key: string) => key.replace(/-/g, ' ').toUpperCase();

/**
 * Non-interactive example overlay: stage headings and a rounded callout for
 * Process A, both placed from the public layout snapshot.
 */
export function renderOverlay(layout: SankeyLayout) {
  const node = layout.nodes.get('process-a');
  const headingY = Math.max(18, layout.plot.top - 30);
  return (
    <g className="layout-annotations">
      {layout.stages.map((stage, index) => {
        const barWidth =
            [...layout.nodes.values()].find((node) => node.stage === stage.key)
              ?.width ?? 0,
          anchor =
            index === 0
              ? 'start'
              : index === layout.stages.length - 1
                ? 'end'
                : 'middle',
          x =
            anchor === 'start'
              ? stage.x
              : anchor === 'end'
                ? stage.x + barWidth
                : stage.x + barWidth / 2;
        return (
          <g key={stage.key} data-layout-stage-heading={stage.key}>
            <line
              x1={stage.x}
              x2={stage.x + barWidth}
              y1={layout.plot.top - 8}
              y2={layout.plot.top - 8}
              stroke="var(--flow-muted-text, #68758b)"
              strokeWidth={1}
              opacity={0.5}
            />
            <text
              x={x}
              y={headingY}
              textAnchor={anchor}
              fill="var(--flow-muted-text, #68758b)"
              fontSize={10}
              fontWeight={650}
              letterSpacing={0.9}
            >
              {stageLabel(stage.key)}
            </text>
          </g>
        );
      })}
      {node ? (
        <g data-layout-callout="process-a">
          <rect
            x={node.x - 7}
            y={node.y - 7}
            width={node.width + 14}
            height={node.height + 14}
            rx={8}
            fill="none"
            stroke="var(--flow-focus, #2644af)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
          <g
            transform={`translate(${node.x + node.width / 2}, ${node.y - 22})`}
          >
            <rect
              x={-44}
              y={-11}
              width={88}
              height={18}
              rx={5}
              fill="var(--flow-surface, #fff)"
              stroke="var(--flow-focus, #2644af)"
              strokeWidth={1}
            />
            <text
              textAnchor="middle"
              y={2}
              fill="var(--flow-focus, #2644af)"
              fontSize={9}
              fontWeight={650}
              letterSpacing={0.6}
            >
              PROCESS A
            </text>
          </g>
        </g>
      ) : null}
    </g>
  );
}
