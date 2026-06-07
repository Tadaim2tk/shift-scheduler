export class ShiftConstraints {
    constructor(store) {
        this.store = store;
        this.symbols = store.state.symbols;
        this.routes = store.state.routes;
    }

    // Evaluate constraints for a specific staff member's schedule
    validateStaff(staffId, schedule, daysInMonth) {
        const issues = [];
        const staffCells = Object.entries(schedule[staffId] || {}).sort((a, b) => a[0] - b[0]);
        // Convert to easy access array: [0, {symbol...}, {symbol...}] (1-indexed)
        const dayMap = new Array(daysInMonth + 1).fill(null);
        staffCells.forEach(([d, cell]) => {
            dayMap[parseInt(d)] = cell;
        });

        // 1. 4-Week 8-Off (Simplified to 2 days off per week avg, or strict 4w check?)
        // Rules vary, but standard is "4w8d off". We'll check sliding window or strict blocks if start date known.
        // For simplicity in this monthly view: Check if total OFF days >= 8 (assuming 1 month ~ 4 weeks).
        const offCount = dayMap.filter(c => c && this.isOff(c.symbol)).length;
        if (offCount < 8) {
            issues.push({ type: 'error', msg: `休日不足: ${offCount}/8日` });
        }

        // 2. Continuous Work Limit (Max 6 days usually? Japan Post might range 6-12 depending on agreement, assuming 6 standard)
        let consecutiveWork = 0;
        for (let i = 1; i <= daysInMonth; i++) {
            const cell = dayMap[i];
            if (cell && this.isWork(cell.symbol)) {
                consecutiveWork++;
                if (consecutiveWork > 6) {
                    issues.push({ type: 'warning', msg: `${i}日に連勤超過(${consecutiveWork})` });
                }
            } else {
                consecutiveWork = 0;
            }
        }

        // 3. Interval Rules (Late -> Early prohibited, Night -> Dawn -> Off enforced)
        // Need to define shift types: Early(混早), Late(混遅), Night(夜), Dawn(明)
        for (let i = 1; i < daysInMonth; i++) {
            const current = dayMap[i];
            const next = dayMap[i + 1];
            if (!current || !next) continue;

            // Pattern: Night -> Dawn (Check if Night is followed by Dawn)
            // Implementation: define types in Settings or hardcode for now based on names
            if (this.isNight(current.symbol) && !this.isDawn(next.symbol)) {
                issues.push({ type: 'error', msg: `${i}日: 夜勤の次は明け（明）である必要があります` });
            }

            // Pattern: Dawn -> Off (Dawn should be followed by Off)
            if (this.isDawn(current.symbol) && !this.isOff(next.symbol)) {
                issues.push({ type: 'warning', msg: `${i}日: 明けの次は休日が推奨されます` });
            }

            // Interval: Late -> Early (Example: Mixed Late -> Early)
            // Assuming 混遅 -> 混早 is bad
            if (this.isLate(current.symbol) && this.isEarly(next.symbol)) {
                issues.push({ type: 'error', msg: `${i}日: 遅番→早番は勤務間インターバル不足の恐れ` });
            }
        }

        return issues;
    }

    // Helper functions (In real app, map exact IDs from Settings)
    isOff(symbol) {
        // "明" is technically Work-end but treated as Off-start? 
        // Usually "休", "年休", "計画" (Plan Off) count as Off days for 4w8d?
        // Let's assume types: OFF
        const s = this.getSymbol(symbol);
        return s && s.type === 'OFF';
    }

    isWork(symbol) {
        const s = this.getSymbol(symbol);
        return s && s.type === 'WORK';
    }

    // Infer time-based types from names (Fragile, but requested "from image")
    // "混早" (Early), "混遅" (Late), "夜" (Night), "明" (Dawn)
    isEarly(sym) { return sym && sym.includes('早'); }
    isLate(sym) { return sym && (sym.includes('遅') || sym.includes('夕')); }
    isNight(sym) { return sym && sym.includes('夜'); }
    isDawn(sym) { return sym && (sym.includes('明') || sym.includes('非番')); }

    getSymbol(sym) {
        // Check Symbols first
        let s = this.store.state.symbols.find(x => x.symbol === sym);
        if (s) return s;
        // Check Routes (treated as WORK usually)
        let r = this.store.state.routes.find(x => x.id === sym);
        if (r) return { type: 'WORK' };
        return null;
    }
    // Check daily route requirements (e.g. "1区" needed: 1, actual: 2)
    validateDailyRequirements(schedule, daysInMonth) {
        const issues = [];
        const routes = this.routes;

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = String(day).padStart(2, '0');
            const counts = {}; // { routeId: count }

            // Aggregate counts for this day
            Object.values(schedule).forEach(staffSchedule => {
                const cell = staffSchedule[dayStr];
                if (cell && cell.symbol) {
                    counts[cell.symbol] = (counts[cell.symbol] || 0) + 1;
                }
            });

            // Check against requirements
            routes.forEach(r => {
                const actual = counts[r.id] || 0;
                // If required is strict, we check exact match. Usually "at least".
                // User said "Duplicate Alert", implying Over-assignment checks.
                // Assuming required is MAX allowed for unique routes like 1区?
                // Actually usually 1区 is exactly 1 person.

                // Let's flag if actual > required.
                if (actual > r.required) {
                    issues.push({
                        day,
                        routeId: r.id,
                        actual,
                        required: r.required,
                        msg: `${day}日: ${r.name || r.id} が重複しています (${actual}/${r.required})`
                    });
                }
                // Optional: Flag missing requirements
                // if (actual < r.required) ...
            });
        }
        return issues;
    }
}
