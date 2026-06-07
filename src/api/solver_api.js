import { JapaneseCalendar } from '../utils/holidays.js';

export class SolverAPI {

    // Helper to package the frontend store state into the format Python expects
    static buildPayload(store, flatDates) {
        // flatDates is array of strings e.g. "2026-03-22", "2026-03-23" ...
        
        const dateLabels = {};
        const flatSchedule = {}; // s_id -> { "1": {"symbol": "...", "locked": ...} }
        
        // Build empty mapping
        store.state.staff.forEach(s => {
            flatSchedule[s.id] = {};
        });

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
                if (cell) {
                    flatSchedule[s.id][dStr] = {
                        symbol: cell.symbol,
                        type: cell.type,
                        locked: cell.locked || cell.symbol === '希' || cell.symbol === '欠' || cell.symbol === '／'
                    };
                }
            });
        });

        return {
            flatMode: true,
            daysInMonth: flatDates.length, // Typically 28
            staff: store.state.staff,
            routes: store.state.routes,
            currentSchedule: flatSchedule,
            dateLabels: dateLabels
        };
    }

    static async solve(payload) {
        try {
            const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiBase}/solve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Optimization failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Solver API Error:', error);
            throw error;
        }
    }
}
