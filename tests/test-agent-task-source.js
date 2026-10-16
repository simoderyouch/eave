#!/usr/bin/env gjs
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

import {agentStatusDirectory} from '../src/lib/sources/agent-task.js';

const expected = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'eave', 'tasks']);
if (agentStatusDirectory() !== expected)
    throw new Error(`agent task status directory mismatch: ${agentStatusDirectory()}`);

print('agent-task-source: runtime status directory is valid');
