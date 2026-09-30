import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const facts = JSON.parse(readFileSync(join(root, 'facts.json'), 'utf8'));
const ids = new Set(facts.checkpoints.map(({ id }) => id));
assert.equal(ids.size, facts.checkpoints.length, 'duplicate checkpoints');
assert.equal(new Set(facts.transitions.map(({ id }) => id)).size, facts.transitions.length, 'duplicate transitions');
assert(ids.has('upload'));
for (const edge of facts.transitions) {
  assert(ids.has(edge.from) && ids.has(edge.to), `dangling edge ${edge.id}`);
  assert(edge.kind && edge.when, `missing condition on ${edge.id}`);
}
for (const checkpoint of facts.checkpoints) {
  for (const link of checkpoint.links) {
    assert(['app', 'server'].includes(link.scope) && /^fnv1-[a-f0-9]{32}$/.test(link.function), `invalid link in ${checkpoint.id}`);
  }
}
const edges = new Set(facts.transitions.map(({ from, to }) => `${from}->${to}`));
const mainPath = ['upload', 'accept', 'bootstrap', 'page-tasks', 'task-handoff', 'finalize-attachments', 'processed', 'persist', 'cleanup', 'display'];
for (let i = 1; i < mainPath.length; i++) {
  assert(edges.has(`${mainPath[i - 1]}->${mainPath[i]}`), `missing main-path handoff ${mainPath[i - 1]}->${mainPath[i]}`);
}
for (const pair of ['task-handoff->page-tasks', 'processed->display', 'persist->retry', 'retry->persist', 'retry->errored', 'errored->display']) {
  assert(edges.has(pair), `missing branch ${pair}`);
}
const shared = {
  sourceRevision: facts.sourceRevision,
  authority: facts.authority,
  scenario: facts.scenario,
  entry: 'upload',
  intendedChecks: facts.intendedChecks,
  gaps: facts.gaps,
};
const render = ({ id, from, to, kind, when }) => `${id}: ${from} -> ${to} [${kind}] when ${when}`;
const flat = { format: 'flat-scenario-prototype/v1', ...shared,
  checkpoints: facts.checkpoints,
  progression: facts.transitions.map(render),
};
const graph = { format: 'authored-scenario-graph-prototype/v1', ...shared,
  nodes: facts.checkpoints,
  edges: facts.transitions,
};
assert.deepEqual(flat.checkpoints, graph.nodes, 'both arms must contain identical checkpoint facts and links');
assert.deepEqual(flat.progression, graph.edges.map(render), 'both arms must contain identical transition facts');
for (const [filename, value] of [['flat.json', flat], ['graph.json', graph]]) {
  const rendered = JSON.stringify(value, null, 2) + '\n';
  const target = join(root, filename);
  if (process.argv[2] === '--write') writeFileSync(target, rendered);
  else if (process.argv[2] === '--check') assert.equal(readFileSync(target, 'utf8'), rendered, `${filename} stale`);
  else throw new Error('Usage: node build.mjs --write|--check');
  console.log(`${filename}: ${Buffer.byteLength(rendered)} bytes`);
}
console.log(`${facts.checkpoints.length} shared checkpoints; ${facts.transitions.length} identical transition facts; branch and main-path checks pass.`);
