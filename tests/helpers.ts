import assert from 'node:assert/strict';
import { resolveGraph } from '../src/model.js';
import {
  SankeyInputError,
  type SankeyGraph,
  type SankeyIssueCode,
} from '../src/types.js';

/** Assert that a graph is rejected with the expected issue code. */
export function error(graph: SankeyGraph, code: SankeyIssueCode) {
  assert.throws(
    () => resolveGraph(graph),
    (e: unknown) =>
      e instanceof SankeyInputError &&
      e.issues.some((issue) => issue.code === code),
  );
}
