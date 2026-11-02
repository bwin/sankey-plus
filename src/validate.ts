import { resolveGraph } from './model.js';
import {
  SankeyInputError,
  type SankeyGraph,
  type SankeyIssue,
} from './types.js';

const structuralMessage =
  'A graph must be an object with stages, nodes and links arrays.';
const malformedMessage =
  'The graph could not be validated because its data is malformed.';

const invalidGraph = (message: string): SankeyIssue[] => [
  { code: 'invalid-graph', message },
];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIssue = (value: unknown): value is SankeyIssue =>
  isRecord(value) &&
  typeof value.code === 'string' &&
  typeof value.message === 'string' &&
  (value.nodeKey === undefined || typeof value.nodeKey === 'string') &&
  (value.linkKey === undefined || typeof value.linkKey === 'string');

const isIssueList = (value: unknown): value is readonly SankeyIssue[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (let index = 0; index < value.length; index++)
    if (!isIssue(value[index])) return false;
  return true;
};

/** Read issues without trusting the error's prototype or property access. */
const issuesFromError = (error: unknown): readonly SankeyIssue[] => {
  try {
    if (!(error instanceof SankeyInputError))
      return invalidGraph(malformedMessage);
    const issues: unknown = error.issues;
    return isIssueList(issues) ? issues : invalidGraph(malformedMessage);
  } catch {
    return invalidGraph(malformedMessage);
  }
};

const collectMalformedEntries = (
  entries: readonly unknown[],
  kind: string,
  issues: SankeyIssue[],
) => {
  for (let index = 0; index < entries.length; index++)
    if (!isRecord(entries[index]))
      issues.push({
        code: 'invalid-graph',
        message: `${kind} at index ${index} must be an object.`,
      });
};

const inspectGraph = (graph: unknown): readonly SankeyIssue[] => {
  if (
    !isRecord(graph) ||
    !Array.isArray(graph.stages) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.links)
  )
    return invalidGraph(structuralMessage);
  const structural: SankeyIssue[] = [];
  collectMalformedEntries(graph.nodes, 'Node', structural);
  collectMalformedEntries(graph.links, 'Link', structural);
  if (graph.conversionRates !== undefined) {
    if (!Array.isArray(graph.conversionRates))
      structural.push({
        code: 'invalid-graph',
        message: 'Graph conversionRates must be an array when provided.',
      });
    else
      collectMalformedEntries(
        graph.conversionRates,
        'Conversion rate',
        structural,
      );
  }
  if (structural.length) return structural;
  try {
    resolveGraph(graph as unknown as SankeyGraph);
    return [];
  } catch (error) {
    return issuesFromError(error);
  }
};

/**
 * Preflight untrusted data with the same rules as the component.
 * Returns an empty array for a valid graph and never throws. Semantic issues
 * are complete for structurally well-shaped graphs; malformed entries return
 * `invalid-graph` before semantic validation.
 */
export function validateGraph(graph: unknown): readonly SankeyIssue[] {
  try {
    return inspectGraph(graph);
  } catch (error) {
    return issuesFromError(error);
  }
}
