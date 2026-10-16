#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    AgentTaskState,
    agentTaskPriority,
    isAgentTaskStale,
    isTerminalAgentTask,
    normalizeAgentTask,
    selectPrimaryAgentTask,
} from '../src/lib/agent-status.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed += 1;
        return;
    }
    failed += 1;
    print(`FAIL: ${message}`);
}

const working = normalizeAgentTask({
    id: 'codex-eave',
    source: 'Codex',
    title: 'Add task pulse',
    state: 'working',
    detail: 'Running checks',
    progress: 81.7,
    updatedAt: 1_760_526_000,
});
assert(working?.updatedAt === 1_760_526_000_000, 'Unix seconds normalize to milliseconds');
assert(working?.progress === 82, 'progress rounds to a whole percent');
assert(working?.detail === 'Running checks', 'short status detail is preserved');
assert(normalizeAgentTask({id: 'missing-fields'}) === null, 'invalid task is rejected');
assert(!isAgentTaskStale(working, working.updatedAt + 119_999), 'fresh task is kept');
assert(isAgentTaskStale(working, working.updatedAt + 120_001), 'stale task expires');

const waiting = normalizeAgentTask({
    id: 'approval', source: 'Codex', title: 'Push branch', state: 'waiting', updatedAt: 1_760_526_010,
});
const failedTask = normalizeAgentTask({
    id: 'checks', source: 'CI', title: 'Run checks', state: 'failed', updatedAt: 1_760_526_020,
});
assert(isTerminalAgentTask(failedTask), 'failed task is terminal');
assert(!isTerminalAgentTask(waiting), 'waiting task remains active');
assert(agentTaskPriority(waiting) > agentTaskPriority(working), 'waiting task has higher priority');
assert(selectPrimaryAgentTask([working, failedTask, waiting])?.id === 'approval',
    'waiting task is selected before routine work or failure');
assert(AgentTaskState.SUCCESS === 'success', 'public task states are stable');

print(`agent-status: ${passed} passed, ${failed} failed`);
if (failed)
    throw new Error(`${failed} assertion(s) failed`);
