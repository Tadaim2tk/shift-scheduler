import { JapaneseCalendar } from '../utils/holidays.js';

export class SolverAPI {

    // Helper to package the frontend store state into the format Python expects
    static buildPayload(store, flatDates, preserveAll = false, generationMode = preserveAll ? 'fill' : 'full') {
        // flatDates is array of strings e.g. "2026-03-22", "2026-03-23" ...
        
        const dateLabels = {};
        const flatSchedule = {}; // s_id -> { "1": {"symbol": "...", "locked": ...} }
        const contextSchedule = {}; // s_id -> { "YYYY-MM-DD": {"symbol": "..."} }
        const maxContextDays = Math.max(
            store.state.settings?.maxConsecutiveWork ?? 5,
            ...store.state.staff.map(s => s.attributes?.maxConsecutiveWork ?? 0)
        );
        
        // Build empty mapping
        store.state.staff.forEach(s => {
            flatSchedule[s.id] = {};
            contextSchedule[s.id] = {};
        });

        const addDays = (dateStr, offset) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d + offset);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        const captureContextDate = (dateStr) => {
            const [y, m, d] = dateStr.split('-');
            const ym = `${y}-${m}`;
            const monthSch = store.getSchedule(ym);
            store.state.staff.forEach(s => {
                const cell = monthSch?.[s.id]?.[d];
                if (cell && cell.symbol) {
                    contextSchedule[s.id][dateStr] = {
                        symbol: cell.symbol,
                        type: cell.type,
                        locked: Boolean(cell.locked)
                    };
                }
            });
        };

        if (flatDates.length > 0) {
            const firstDate = flatDates[0];
            const lastDate = flatDates[flatDates.length - 1];
            for (let offset = -maxContextDays; offset < 0; offset++) {
                captureContextDate(addDays(firstDate, offset));
            }
            for (let offset = 1; offset <= maxContextDays; offset++) {
                captureContextDate(addDays(lastDate, offset));
            }
        }

        // Map original exact days to 1...28 indexed days since Python expects sequential continuous tracking
        flatDates.forEach((dateStr, idx) => {
            const dStr = String(idx + 1); // 1-indexed for CP-SAT
            const [y, m, d] = dateStr.split('-');
            const ym = `${y}-${m}`;

            const isSat = JapaneseCalendar.isSaturday(dateStr);
            const isSun = JapaneseCalendar.isSunday(dateStr);
            const isHol = JapaneseCalendar.isHoliday(dateStr);
            dateLabels[dStr] = { isSat, isSun, isHol, originalDate: dateStr };

            // Flatten schedule
            const monthSch = store.getSchedule(ym);
            store.state.staff.forEach(s => {
                const cell = monthSch?.[s.id]?.[d];
                if (cell && cell.symbol) {
                    const isSpecialManualState = cell.symbol === '希' || cell.symbol === '欠' || cell.symbol === '／';
                    const shouldLock = generationMode === 'fill'
                        ? true
                        : Boolean(cell.locked || isSpecialManualState);
                    flatSchedule[s.id][dStr] = {
                        symbol: cell.symbol,
                        type: cell.type,
                        locked: shouldLock
                    };
                }
            });
        });

        return {
            flatMode: true,
            generationMode,
            daysInMonth: flatDates.length, // Typically 28
            staff: store.state.staff,
            routes: store.state.routes,
            settings: store.state.settings || {},
            currentSchedule: flatSchedule,
            contextSchedule,
            dateLabels: dateLabels
        };
    }

    static async solve(payload) {
        const controller = new AbortController();
        // Render free/low-tier instances can cold-start slowly, while the
        // Python CP-SAT solver is allowed to search for up to 120 seconds.
        // A 3s browser timeout made production almost always fall back to the
        // weaker JS generator before the real solver had a chance to answer.
        const timeout = window.setTimeout(() => controller.abort(), 130000);
        try {
            const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiBase}/solve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Optimization failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Solver API Error:', error);
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }
}
