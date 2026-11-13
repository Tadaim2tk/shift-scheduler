import { JapaneseCalendar } from '../utils/holidays.js';
import { isManualImmutableSymbol } from '../utils/symbols.js';

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
                    // 半角 '/' の見落としで、ブロックセルがソルバーに固定として渡らない不具合を防ぐ。
                    const isSpecialManualState = isManualImmutableSymbol(cell.symbol);
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

    static apiBase() {
        return import.meta.env.VITE_API_URL || 'http://localhost:8000';
    }

    // ソルバー (Render) は一定時間アクセスが無いと停止し、次のアクセスで起動に
    // 40秒以上かかる。生成ボタンを押してから待たせないよう、エディタを開いた時点で
    // 起こし、開いている間は停止しない間隔で軽く叩き続ける。
    // 何度呼んでもタイマーは1つだけ。失敗は無視する(生成時に改めてエラーになる)。
    static keepWarm() {
        const ping = () => {
            const onEditor = window.location.hash.slice(1) === 'editor';
            if (!onEditor || document.visibilityState !== 'visible') return;
            fetch(`${SolverAPI.apiBase()}/health`).catch(() => {});
        };
        ping();
        if (!SolverAPI._warmTimer) {
            SolverAPI._warmTimer = window.setInterval(ping, 10 * 60 * 1000);
        }
    }

    static async solve(payload) {
        const controller = new AbortController();
        // 停止状態からの起動(実測40秒超)＋ CP-SAT の探索上限 120 秒を待てる長さにする。
        // ブラウザ内の代替生成は廃止したので、ここで切ると生成は失敗になる。
        const timeout = window.setTimeout(() => controller.abort(), 200000);
        try {
            const apiBase = SolverAPI.apiBase();
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
