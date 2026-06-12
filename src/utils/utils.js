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
        const stored = localStorage.getItem('shift_scheduler_start_date');
        // Validation for YYYY-MM-DD
        if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;

        // Default: Sunday on or before 25th of current month
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), 25);
        const day = target.getDay(); // 0=Sun
        target.setDate(25 - day); // Move back to Sunday

        return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    },
    saveCurrentStartDate: (dateStr) => {
        localStorage.setItem('shift_scheduler_start_date', dateStr);
    },
    // 表示する期間の日数（起点からの日数）。既定は28日（従来の4週間）。
    MAX_PERIOD_DAYS: 62,
    getCurrentPeriodDays: () => {
        const stored = parseInt(localStorage.getItem('shift_scheduler_period_days'), 10);
        if (Number.isInteger(stored) && stored >= 1 && stored <= 62) return stored;
        return 28;
    },
    saveCurrentPeriodDays: (n) => {
        localStorage.setItem('shift_scheduler_period_days', String(n));
    }
};
