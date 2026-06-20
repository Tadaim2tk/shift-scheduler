const DEFAULT_RANGE_VERSION = '2026-07-12_28';
const DEFAULT_START_DATE = '2026-07-12';
const DEFAULT_PERIOD_DAYS = 28;

function applyDefaultRangeOnce() {
    if (localStorage.getItem('shift_scheduler_default_range_version') === DEFAULT_RANGE_VERSION) return;
    localStorage.setItem('shift_scheduler_start_date', DEFAULT_START_DATE);
    localStorage.setItem('shift_scheduler_period_days', String(DEFAULT_PERIOD_DAYS));
    localStorage.setItem('shift_scheduler_default_range_version', DEFAULT_RANGE_VERSION);
}

export const Utils = {
    // Add common utils here
    getCurrentYM: () => {
        // Validation for YM format (YYYY-MM)
        const stored = localStorage.getItem('shift_scheduler_current_ym');
        if (stored && /^\d{4}-\d{2}$/.test(stored)) return stored;
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    saveCurrentYM: (ym) => {
        localStorage.setItem('shift_scheduler_current_ym', ym);
    },
    getCurrentStartDate: () => {
        applyDefaultRangeOnce();
        const stored = localStorage.getItem('shift_scheduler_start_date');
        // Validation for YYYY-MM-DD
        if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
        return DEFAULT_START_DATE;
    },
    saveCurrentStartDate: (dateStr) => {
        localStorage.setItem('shift_scheduler_start_date', dateStr);
    },
    // 表示する期間の日数（起点からの日数）。既定は28日（従来の4週間）。
    MAX_PERIOD_DAYS: 62,
    getCurrentPeriodDays: () => {
        applyDefaultRangeOnce();
        const stored = parseInt(localStorage.getItem('shift_scheduler_period_days'), 10);
        if (Number.isInteger(stored) && stored >= 1 && stored <= 62) return stored;
        return DEFAULT_PERIOD_DAYS;
    },
    saveCurrentPeriodDays: (n) => {
        localStorage.setItem('shift_scheduler_period_days', String(n));
    }
};
