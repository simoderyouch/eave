// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    agentTaskPriority,
    isAgentTaskStale,
    isTerminalAgentTask,
    normalizeAgentTask,
    selectPrimaryAgentTask,
} from '../agent-status.js';
import {Kind} from '../activity-stack.js';
import {SourceTracker} from '../utils.js';

const STALE_AFTER_MS = 120_000;
const RESCAN_MS = 5_000;
const RELOAD_DELAY_MS = 100;

export function agentStatusDirectory() {
    return GLib.build_filenamev([GLib.get_user_runtime_dir(), 'eave', 'tasks']);
}

function loadTask(file) {
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok)
            return null;
        return normalizeAgentTask(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        return null;
    }
}

/** Reads local, short-lived agent status files and displays the primary task. */
export class AgentTaskSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._directory = null;
        this._monitor = null;
        this._reloadId = 0;
        this._publishedKey = '';

        try {
            this._directory = Gio.File.new_for_path(agentStatusDirectory());
            if (!this._directory.query_exists(null))
                this._directory.make_directory_with_parents(null);
            this._monitor = this._directory.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._tracker.connect(this._monitor, 'changed', () => this._scheduleReload());
            this._reload();
            this._tracker.timeoutAdd(RESCAN_MS, () => {
                this._reload();
                return GLib.SOURCE_CONTINUE;
            });
        } catch {
            this._directory = null;
            this._monitor = null;
        }
    }

    _scheduleReload() {
        if (this._reloadId)
            return;
        this._reloadId = this._tracker.timeoutAddOnce(RELOAD_DELAY_MS, () => {
            this._reloadId = 0;
            this._reload();
        });
    }

    _tasks() {
        if (!this._directory)
            return [];
        const now = Date.now();
        const terminalHold = this._settings.get_int('system-timeout');
        const tasks = [];
        try {
            const files = this._directory.enumerate_children(
                'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = files.next_file(null))) {
                if (info.get_file_type() !== Gio.FileType.REGULAR || !info.get_name().endsWith('.json'))
                    continue;
                const task = loadTask(this._directory.get_child(info.get_name()));
                if (!task || isAgentTaskStale(task, now, STALE_AFTER_MS))
                    continue;
                if (isTerminalAgentTask(task) && now - task.updatedAt > terminalHold)
                    continue;
                tasks.push(task);
            }
            files.close(null);
        } catch {
            return [];
        }
        return tasks;
    }

    _reload() {
        const task = selectPrimaryAgentTask(this._tasks());
        const key = task
            ? `${task.id}:${task.state}:${task.title}:${task.detail}:${task.progress}:${task.updatedAt}`
            : '';
        if (key === this._publishedKey)
            return;
        this._publishedKey = key;

        if (!task) {
            this._stack.remove('agent-task');
            return;
        }
        this._stack.upsert({
            id: 'agent-task',
            kind: Kind.AGENT_TASK,
            persistent: !isTerminalAgentTask(task),
            durationMs: this._settings.get_int('system-timeout'),
            priority: agentTaskPriority(task),
            payload: task,
        });
    }

    destroy() {
        this._tracker.destroy();
        this._stack?.remove('agent-task');
        this._directory = null;
        this._monitor = null;
        this._settings = null;
        this._stack = null;
    }
}
