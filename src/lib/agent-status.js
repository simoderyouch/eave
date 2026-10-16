// SPDX-License-Identifier: GPL-3.0-or-later
// Pure status validation and selection helpers for local agent integrations.

export const AgentTaskState = Object.freeze({
    WORKING: 'working',
    WAITING: 'waiting',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const VALID_STATES = new Set(Object.values(AgentTaskState));
const STATE_PRIORITY = Object.freeze({
    [AgentTaskState.WORKING]: 45,
    [AgentTaskState.WAITING]: 68,
    [AgentTaskState.SUCCESS]: 42,
    [AgentTaskState.FAILED]: 66,
    [AgentTaskState.CANCELLED]: 40,
});

function text(value, maxLength) {
    if (typeof value !== 'string')
        return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function timestampMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return null;
    // Permit the convenient Unix-seconds form as well as milliseconds.
    return numeric < 100_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

export function normalizeAgentTask(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;

    const id = text(value.id, 96);
    const source = text(value.source, 48);
    const title = text(value.title, 160);
    const state = text(value.state, 24).toLowerCase();
    const updatedAt = timestampMs(value.updatedAt);
    if (!id || !source || !title || !VALID_STATES.has(state) || updatedAt == null)
        return null;

    const requestedProgress = value.progress == null ? null : Number(value.progress);
    const progress = Number.isFinite(requestedProgress)
        ? Math.round(Math.max(0, Math.min(100, requestedProgress)))
        : null;

    return {
        id,
        source,
        title,
        state,
        detail: text(value.detail, 160),
        progress,
        startedAt: timestampMs(value.startedAt) ?? updatedAt,
        updatedAt,
    };
}

export function isAgentTaskStale(task, nowMs = Date.now(), maxAgeMs = 120_000) {
    if (!task || !Number.isFinite(task.updatedAt))
        return true;
    return nowMs - task.updatedAt > Math.max(0, maxAgeMs);
}

export function isTerminalAgentTask(task) {
    return task?.state === AgentTaskState.SUCCESS ||
        task?.state === AgentTaskState.FAILED ||
        task?.state === AgentTaskState.CANCELLED;
}

export function agentTaskPriority(task) {
    return STATE_PRIORITY[task?.state] ?? 0;
}

export function selectPrimaryAgentTask(tasks) {
    let selected = null;
    for (const task of tasks ?? []) {
        if (!selected || agentTaskPriority(task) > agentTaskPriority(selected) ||
            (agentTaskPriority(task) === agentTaskPriority(selected) && task.updatedAt > selected.updatedAt))
            selected = task;
    }
    return selected;
}
