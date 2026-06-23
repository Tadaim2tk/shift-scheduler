export class ShiftConstraints {
    constructor(store) {
        this.store = store;
        this.symbols = store.state.symbols;
        this.routes = store.state.routes;
    }

    // 連勤上限を設定から取得（社員個別 > 全体設定）。store を唯一の出所とする。
    getMaxConsecutive(staff) {
        if (this.store && typeof this.store.getMaxConsecutiveWork === 'function') {
            return this.store.getMaxConsecutiveWork(staff);
        }
        return this.store?.state?.settings?.maxConsecutiveWork ?? 5;
    }

    getMinimumOffDays(staff, daysInMonth) {
        const maxConsecutive = this.getMaxConsecutive(staff);
        if (maxConsecutive >= 7) return 0;
        if (maxConsecutive >= 6) return Math.ceil(daysInMonth / 7);
        return this.store?.state?.settings?.minOffPer4Weeks ?? 8;
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

        const staffObj = (this.store.state.staff || []).find(s => String(s.id) === String(staffId));
        const maxConsecutive = this.getMaxConsecutive(staffObj);
        const minOff = this.getMinimumOffDays(staffObj, daysInMonth);

        // 1. 4-Week minimum off days (default 4w8d off).
        const offCount = dayMap.filter(c => c && this.isOff(c.symbol)).length;
        if (offCount < minOff) {
            issues.push({ type: 'error', msg: `休日不足: ${offCount}/${minOff}日` });
        }

        // 2. Continuous Work Limit (設定値 maxConsecutiveWork を超えたら警告)
        let consecutiveWork = 0;
        for (let i = 1; i <= daysInMonth; i++) {
            const cell = dayMap[i];
            if (cell && this.isWork(cell.symbol)) {
                consecutiveWork++;
                if (consecutiveWork > maxConsecutive) {
                    issues.push({ type: 'warning', msg: `${i}日に連勤超過(${consecutiveWork}/${maxConsecutive})` });
                }
            } else {
                consecutiveWork = 0;
            }
        }

        // 3. Interval Rules (Late -> Early prohibited, Night -> Dawn -> Off enforced)
        for (let i = 1; i < daysInMonth; i++) {
            const current = dayMap[i];
            const next = dayMap[i + 1];
            if (!current || !next) continue;

            // Pattern: Night -> Dawn (Check if Night is followed by Dawn)
            if (this.isNight(current.symbol) && !this.isDawn(next.symbol)) {
                issues.push({ type: 'error', msg: `${i}日: 夜勤の次は明け（明）である必要があります` });
            }

            // Pattern: Dawn -> Off (Dawn should be followed by Off)
            if (this.isDawn(current.symbol) && !this.isOff(next.symbol)) {
                issues.push({ type: 'warning', msg: `${i}日: 明けの次は休日が推奨されます` });
            }

            // Interval: Late -> Early (Example: Mixed Late -> Early)
            if (this.isLate(current.symbol) && this.isEarly(next.symbol)) {
                issues.push({ type: 'error', msg: `${i}日: 遅番→早番は勤務間インターバル不足の恐れ` });
            }
        }

        return issues;
    }

    // Helper functions (In real app, map exact IDs from Settings)
    isOff(symbol) {
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
                // required はオブジェクト{weekday,sat,sun}または数値。重複検知では最大必要数を上限とみなす。
                let reqMax;
                if (typeof r.required === 'number') {
                    reqMax = r.required;
                } else if (r.required && typeof r.required === 'object') {
                    reqMax = Math.max(r.required.weekday || 0, r.required.sat || 0, r.required.sun || 0);
                } else {
                    reqMax = 1;
                }

                if (actual > reqMax) {
                    issues.push({
                        day,
                        routeId: r.id,
                        actual,
                        required: reqMax,
                        msg: `${day}日: ${r.name || r.id} が重複しています (${actual}/${reqMax})`
                    });
                }
            });
        }
        return issues;
    }
}
