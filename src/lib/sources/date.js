// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

import {Kind} from '../activity-stack.js';
import {SourceTracker} from '../utils.js';

function dayKey(dateTime) {
    return `${dateTime.get_year()}-${dateTime.get_month()}-${dateTime.get_day_of_month()}`;
}

function dateLabel(dateTime) {
    return `${dateTime.format('%a')}, ${dateTime.get_day_of_month()} ${dateTime.format('%b')}`;
}

/** Shows the local date once when the calendar day changes. */
export class DateSource {
    constructor({stack, settings}) {
        this._stack = stack;
        this._settings = settings;
        this._tracker = new SourceTracker();
        this._day = null;

        this._check();
        this._tracker.timeoutAdd(60_000, () => {
            this._check();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _check() {
        const now = GLib.DateTime.new_now_local();
        const nextDay = dayKey(now);
        if (this._day == null) {
            // Enabling Eave should not create a toast; only a later day change
            // (including one noticed after waking) is an activity.
            this._day = nextDay;
            return;
        }
        if (nextDay === this._day)
            return;

        this._day = nextDay;
        this._stack.upsert({
            id: 'date',
            kind: Kind.DATE,
            persistent: false,
            durationMs: this._settings.get_int('system-timeout'),
            payload: {label: dateLabel(now)},
        });
    }

    destroy() {
        this._tracker.destroy();
        this._stack?.remove('date');
        this._settings = null;
        this._stack = null;
    }
}
