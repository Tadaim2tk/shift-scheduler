import { ShiftConstraints } from './constraints.js';
import { JapaneseCalendar } from './holidays.js';

export class Generator {
    constructor(store) {
        this.store = store;
        this.constraints = new ShiftConstraints(store);
        this.generationDeadline = 0;
    }

    isGenerationTimeUp() {
        return this.generationDeadline > 0 && Date.now() > this.generationDeadline;
    }

    getScheduleSym(staffId, dateStr) {
        const [y, m, d] = dateStr.split('-');
        const ym = `${y}-${m}`;
        const prevSch = this.store.state.schedule[ym];
        if (prevSch && prevSch[staffId] && prevSch[staffId][d]) {
            return prevSch[staffId][d].symbol;
        }
        return null;
    }

    getDaysInMonth(ym) {
        const [y, m] = ym.split('-');
        return new Date(y, m, 0).getDate();
    }

    getPrevMonth(ym) {
        const [y, m] = ym.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        const py = d.getFullYear();
        const pm = d.getMonth() + 1;
        return `${py}-${String(pm).padStart(2, '0')}`;
    }

    getDateStr(yearMonth, day) {
        const [y, m] = yearMonth.split('-');
        return `${y}-${m}-${String(day).padStart(2, '0')}`;
    }

    addDaysToDateStr(dateStr, offset) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d + offset);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    isOffSym(sym) {
        if (!sym) return false;
        return this.constraints.isOff(sym) || sym === '希' || sym === '欠' || sym === '/';
    }

    isWorkSymForStreak(sym) {
        return !!sym && sym !== '祝日' && !this.isOffSym(sym);
    }

    getStaffMaxConsecutive(staff) {
        const globalMax = this.store.state.settings?.maxConsecutiveWork ?? 5;
        return staff?.attributes?.maxConsecutiveWork ?? globalMax;
    }

    requiresWeeklyShukyu(staff) {
        return this.hasAnyOperationalCapability(staff) && this.getStaffMaxConsecutive(staff) < 7;
    }

    hasAnyOperationalCapability(staff) {
        const allCaps = [
            ...(staff?.capabilities || []),
            ...(staff?.satCapabilities || []),
            ...(staff?.sunCapabilities || [])
        ];
        return allCaps.some(routeId => this.store.state.routes.some(route => route.id === routeId));
    }

    isSoftMissingRouteId(routeId) {
        return !!this.store.state.routes.find(route => route.id === routeId)?.softMissing;
    }

    getCapabilities(staff, isSat, isSunOrHol) {
        const allStandardRoutes = [
            '1区', '2区', '3区', '4区', '5区', '6区', '7区', '8区', '9区', '10区', '11区', '12区', '13区',
            '弥彦早', '弥彦遅', '計画', '夕差立', '夕方区分',
            '混早1', '混早2', '混遅1', '混遅2', '混中1', '混中2',
            '特早', '特遅', '1班予備', '2班予備', '弥彦予備',
            '通区', '出張(研修)'
        ];

        let caps;
        if (isSat) {
            caps = staff.satCapabilities || staff.weekendCapabilities || staff.capabilities;
        } else if (isSunOrHol) {
            caps = staff.sunCapabilities || staff.weekendCapabilities || staff.capabilities;
        } else {
            caps = staff.capabilities;
        }

        if (!caps) return allStandardRoutes; // If completely undefined, fallback. If [], they genuinely have 0 skills.
        return caps;
    }

    isUnavailableDay(staff, cell) {
        return (staff.preferredOffDays || []).includes(cell.dayOfWeek);
    }

    canWorkRoute(staff, cell, routeId) {
        if (this.isUnavailableDay(staff, cell)) return false;
        const caps = this.getCapabilities(staff, cell.isSat, cell.isSunOrHol);
        return caps.includes(routeId);
    }

    getUsableCapabilityCount(staff, cell, dailySlots = []) {
        return dailySlots.filter(slot => this.canWorkRoute(staff, cell, slot.id)).length;
    }

    getRouteDemandGroups(routeId) {
        const groups = [];
        const add = group => {
            if (group && !groups.includes(group)) groups.push(group);
        };

        if (/^[1-6]区$/.test(routeId)) {
            add('team1');
            add('team1-route');
        } else if (['混早1', '混遅1', '混中1', '1班予備'].includes(routeId)) {
            add('team1');
            add('team1-mixed');
        } else if (/^(7|8|9|10)区$/.test(routeId)) {
            add('team2');
            add('team2-local');
        } else if (/^(11|12|13)区$/.test(routeId) || ['弥彦早', '弥彦遅', '弥彦予備'].includes(routeId)) {
            add('team2');
            add('team2-yahiko');
        } else if (['混早2', '混遅2', '混中2', '2班予備'].includes(routeId)) {
            add('team2');
            add('team2-mixed');
        } else if (['特早', '特遅'].includes(routeId)) {
            add('shared-special');
        } else if (['計画', '夕方区分', '夕差立'].includes(routeId)) {
            add('internal');
        }

        return groups;
    }

    getPrimaryRouteGroup(routeId) {
        const groups = this.getRouteDemandGroups(routeId);
        if (groups.includes('team1')) return 'team1';
        if (groups.includes('team2')) return 'team2';
        if (groups.includes('shared-special')) return 'shared-special';
        if (groups.includes('internal')) return 'internal';
        return null;
    }

    getStaffHomeGroup(staff) {
        const group = staff.attributes?.group;
        if (group === '一斑') return 'team1';
        if (group === '二班') return 'team2';
        if (group === '内務班') return 'internal';
        return null;
    }

    getStaffUsableDemandGroups(staff, cell, dailySlots = []) {
        const groups = new Set();
        dailySlots.forEach(slot => {
            if (!this.canWorkRoute(staff, cell, slot.id)) return;
            this.getRouteDemandGroups(slot.id).forEach(group => groups.add(group));
        });
        return groups;
    }

    getDayDemandStats(matrix, staffList, dailySlots = [], day) {
        const stats = {};
        const ensure = group => {
            if (!stats[group]) stats[group] = { required: 0, filled: 0, shortage: 0, free: 0 };
            return stats[group];
        };

        dailySlots.forEach(slot => {
            const filled = this.countRoute(matrix, staffList, day, slot.id);
            const shortage = Math.max(0, slot.count - filled);
            this.getRouteDemandGroups(slot.id).forEach(group => {
                const item = ensure(group);
                item.required += slot.count;
                item.filled += Math.min(filled, slot.count);
                item.shortage += shortage;
            });
        });

        staffList.forEach(staff => {
            const cell = matrix[staff.id][day];
            if (!cell || cell.locked) return;
            if (cell.symbol && cell.symbol !== '祝日') return;
            this.getStaffUsableDemandGroups(staff, cell, dailySlots).forEach(group => {
                ensure(group).free++;
            });
        });

        return stats;
    }

    getDemandGroupPressure(stats, group) {
        const item = stats[group] || { required: 0, shortage: 0, free: 0 };
        if (item.required === 0 && item.shortage === 0) return 0;
        const slack = item.free - item.shortage;
        return item.shortage * 120 + Math.max(0, 2 - slack) * 25 + item.required;
    }

    getAssignmentOpportunityCost(staff, routeId, day, matrix, dailySlots = [], staffList = null, dayStats = null) {
        const cell = matrix[staff.id][day];
        const targetGroups = new Set(this.getRouteDemandGroups(routeId));
        const usableGroups = this.getStaffUsableDemandGroups(staff, cell, dailySlots);
        const stats = dayStats || this.getDayDemandStats(matrix, staffList || this.store.state.staff || [], dailySlots, day);
        const targetPrimary = this.getPrimaryRouteGroup(routeId);
        const homeGroup = this.getStaffHomeGroup(staff);
        let cost = 0;

        usableGroups.forEach(group => {
            if (targetGroups.has(group)) return;
            cost += this.getDemandGroupPressure(stats, group);
        });

        if (targetPrimary && targetPrimary !== 'shared-special' && targetPrimary !== 'internal' &&
            homeGroup && homeGroup !== targetPrimary && usableGroups.has(homeGroup)) {
            const homePressure = this.getDemandGroupPressure(stats, homeGroup);
            const targetPressure = this.getDemandGroupPressure(stats, targetPrimary);
            cost += 20 + Math.max(0, homePressure - targetPressure);
        }

        return cost;
    }

    compareAssignmentCandidate(a, b, routeId, day, matrix, dailySlots = [], staffList = null, dayStats = null) {
        const costA = this.getAssignmentOpportunityCost(a, routeId, day, matrix, dailySlots, staffList, dayStats);
        const costB = this.getAssignmentOpportunityCost(b, routeId, day, matrix, dailySlots, staffList, dayStats);
        if (costA !== costB) return costA - costB;
        return this.compareSpecialistFirst(a, b, day, matrix, dailySlots);
    }

    assignmentComparator(routeId, day, matrix, dailySlots = [], staffList = null, reverse = false) {
        const scopedStaff = staffList || this.store.state.staff || [];
        const dayStats = this.getDayDemandStats(matrix, scopedStaff, dailySlots, day);
        return (a, b) => {
            const result = this.compareAssignmentCandidate(a, b, routeId, day, matrix, dailySlots, scopedStaff, dayStats);
            return reverse ? -result : result;
        };
    }

    sortMissingSlots(missing, matrix, staffList, dailySlots) {
        return missing.sort((a, b) => {
            const daySlotsA = dailySlots[a.day] || [];
            const daySlotsB = dailySlots[b.day] || [];
            const capableA = staffList.filter(s => this.canWorkRoute(s, matrix[s.id][a.day], a.routeId)).length;
            const capableB = staffList.filter(s => this.canWorkRoute(s, matrix[s.id][b.day], b.routeId)).length;
            if (capableA !== capableB) return capableA - capableB;

            const statsA = this.getDayDemandStats(matrix, staffList, daySlotsA, a.day);
            const statsB = this.getDayDemandStats(matrix, staffList, daySlotsB, b.day);
            const pressureA = this.getRouteDemandGroups(a.routeId)
                .reduce((sum, group) => sum + this.getDemandGroupPressure(statsA, group), 0);
            const pressureB = this.getRouteDemandGroups(b.routeId)
                .reduce((sum, group) => sum + this.getDemandGroupPressure(statsB, group), 0);
            if (pressureA !== pressureB) return pressureB - pressureA;

            const emptyA = this.emptyCount(matrix, staffList, a.day);
            const emptyB = this.emptyCount(matrix, staffList, b.day);
            if (emptyA !== emptyB) return emptyB - emptyA;

            return a.day - b.day;
        });
    }

    compareSpecialistFirst(a, b, day, matrix, dailySlots = []) {
        const cellA = matrix[a.id][day];
        const cellB = matrix[b.id][day];
        const usableA = this.getUsableCapabilityCount(a, cellA, dailySlots);
        const usableB = this.getUsableCapabilityCount(b, cellB, dailySlots);
        if (usableA !== usableB) return usableA - usableB;

        const totalA = this.getCapabilities(a, cellA.isSat, cellA.isSunOrHol).length;
        const totalB = this.getCapabilities(b, cellB.isSat, cellB.isSunOrHol).length;
        if (totalA !== totalB) return totalA - totalB;

        return String(a.id).localeCompare(String(b.id));
    }

    holidayFreeSymbol(cell) {
        return cell.isHol ? '祝日' : null;
    }

    hasUsableRequiredRoute(staff, cell, dailySlots = []) {
        return dailySlots.some(slot => this.canWorkRoute(staff, cell, slot.id));
    }

    clearCell(cell) {
        if (cell.isHol) {
            cell.symbol = '祝日';
            cell.type = 'OFF';
            cell.fixed = true;
            return;
        }
        cell.symbol = null;
        cell.type = null;
        cell.fixed = false;
    }

    countRoute(matrix, staffList, day, routeId) {
        return staffList.reduce((count, staff) => (
            matrix[staff.id][day].symbol === routeId ? count + 1 : count
        ), 0);
    }

    getRequiredRoutes(allRoutes, isSat, isSunOrHol, extraRoutes = []) {
        const targetRoutes = [];

        allRoutes.forEach(r => {
            let count = 0;
            if (typeof r.required === 'number') {
                count = r.required;
            } else if (isSunOrHol) {
                count = r.required?.sun ?? 0;
            } else if (isSat) {
                count = r.required?.sat ?? 0;
            } else {
                count = r.required?.weekday ?? 0;
            }
            if (count > 0) targetRoutes.push({ id: r.id, count });
        });

        extraRoutes.forEach(routeId => {
            const existing = targetRoutes.find(r => r.id === routeId);
            if (existing) existing.count++;
            else targetRoutes.push({ id: routeId, count: 1 });
        });

        return targetRoutes;
    }

    // ==========================================
    // MAIN GENERATOR PIPELINE (SUDOKU APPROACH)
    // ==========================================
    generate(yearMonth, options = {}) {
        const { clearUnlocked = true, startDay = 1, endDay = 31, timeBudgetMs = 12000, attempts = 10 } = options;
        const state = this.store.state;
        const daysInMonth = this.getDaysInMonth(yearMonth);
        const allStaff = state.staff;
        const targetStaff = state.staff.filter(s => !(s.attributes && s.attributes.type === 'helper'));

        const dailySlots = {};
        for (let d = startDay; d <= endDay; d++) {
            const dateStr = this.getDateStr(yearMonth, d);
            const isSat = JapaneseCalendar.isSaturday(dateStr);
            const isSunOrHol = JapaneseCalendar.isSunday(dateStr) || JapaneseCalendar.isHoliday(dateStr);
            const daySettings = this.store.getDaySettings ? this.store.getDaySettings(yearMonth, d) : {};
            dailySlots[d] = this.getRequiredRoutes(state.routes, isSat, isSunOrHol, daySettings.extraRoutes || []);
        }

        const baseSchedule = JSON.parse(JSON.stringify(state.schedule || {}));
        const totalDeadline = Date.now() + timeBudgetMs;
        let bestMatrix = null;
        let bestScore = null;

        for (let attempt = 0; attempt < attempts && Date.now() < totalDeadline; attempt++) {
            const remainingAttempts = attempts - attempt;
            const remainingMs = Math.max(500, totalDeadline - Date.now());
            this.generationDeadline = Date.now() + Math.max(500, Math.floor(remainingMs / remainingAttempts));

            const matrix = this.buildInitialMatrix(yearMonth, daysInMonth, allStaff, baseSchedule, clearUnlocked);
            this.runGenerationPipeline(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
            const score = this.scoreMatrix(matrix, allStaff, targetStaff, dailySlots, startDay, endDay);

            if (!bestScore || score.value < bestScore.value) {
                bestMatrix = matrix;
                bestScore = score;
            }

            const softOnlyAfterCapacityIsUsed = score.softMissing === 0 || score.totalBlank === 0;
            if (score.hardMissing === 0 &&
                softOnlyAfterCapacityIsUsed &&
                score.overage === 0 &&
                score.invalidAssignments === 0 &&
                score.holidayViolations === 0 &&
                score.hibanViolations === 0 &&
                score.maxBlankPerDay <= 2) {
                break;
            }
        }

        this.generationDeadline = 0;
        if (!bestMatrix) return false;

        console.log('[Generator] Best score:', bestScore);
        console.log('[Generator] Applying to Store...');
        this.applyMatrixToSchedule(yearMonth, bestMatrix, state.schedule, allStaff, startDay, endDay);

        return true;
    }

    runGenerationPipeline(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        console.log('[Generator] Phase 1: Pre-Deduction');
        this.deduceAbsolutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, false);

        console.log('[Generator] Phase 1.5: Scarce Specialist Pre-Fill');
        this.assignScarceSpecialists(matrix, targetStaff, dailySlots, startDay, endDay);

        console.log('[Generator] Phase 2: Holiday Distribution');
        this.distributeHolidays(matrix, targetStaff, dailySlots, startDay, endDay, yearMonth);

        console.log('[Generator] Phase 3: Post-Deduction');
        this.deduceAbsolutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, false);

        console.log('[Generator] Phase 4: Gap Fill & Swap Iteration');
        this.fillGapsIterative(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);

        console.log('[Generator] Phase 5: Conflict Resolution & Review');
        this.resolveConflicts(matrix, allStaff, targetStaff, dailySlots, startDay, endDay);
        this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        if (!this.isGenerationTimeUp()) {
            this.rebalanceCoveredSurplusDays(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.repairMissingWithAugmentingSearch(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.repairHolidayRuleViolations(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.repairWeeklyHibanCoverage(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
        if (!this.isGenerationTimeUp()) {
            this.sacrificeSoftRoutesForHardMissing(matrix, allStaff, targetStaff, dailySlots, startDay, endDay);
        }
        if (!this.isGenerationTimeUp()) {
            this.labelSurplusBlanks(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        }
    }

    scoreMatrix(matrix, allStaff, targetStaff, dailySlots, startDay, endDay) {
        const hardMissing = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay, { includeSoft: false });
        const softMissing = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay, { includeHard: false });
        const missing = hardMissing + softMissing;
        const overage = this.totalRouteOverage(matrix, allStaff, dailySlots, startDay, endDay);
        let invalidAssignments = 0;
        let holidayViolations = 0;
        let hibanViolations = 0;
        let totalBlank = 0;
        let blankSquares = 0;
        let maxBlankPerDay = 0;
        let missingBlankConflict = 0;

        for (let d = startDay; d <= endDay; d++) {
            const blank = this.blankCount(matrix, targetStaff, d);
            const shortage = this.dayRouteShortage(matrix, allStaff, dailySlots, d);
            totalBlank += blank;
            blankSquares += blank * blank;
            maxBlankPerDay = Math.max(maxBlankPerDay, blank);
            if (shortage > 0 && blank > 0) {
                missingBlankConflict += shortage * blank;
            }

            targetStaff.forEach(staff => {
                const cell = matrix[staff.id][d];
                if (this.isRouteAssignmentSym(cell.symbol) && !this.canWorkRoute(staff, cell, cell.symbol)) {
                    invalidAssignments++;
                }
            });
        }

        targetStaff.forEach(staff => {
            if (!this.validateHolidayRules(matrix, staff.id, startDay, endDay)) holidayViolations++;
            hibanViolations += this.countHibanCoverageViolations(matrix, staff.id, startDay, endDay);
        });

        return {
            missing,
            hardMissing,
            softMissing,
            overage,
            invalidAssignments,
            holidayViolations,
            hibanViolations,
            totalBlank,
            blankSquares,
            maxBlankPerDay,
            missingBlankConflict,
            value: hardMissing * 1000000 +
                overage * 1000000 +
                invalidAssignments * 1000000 +
                missingBlankConflict * 500000 +
                hibanViolations * 50000 +
                holidayViolations * 10000 +
                softMissing * 3000 +
                maxBlankPerDay * 5000 +
                blankSquares * 50 +
                totalBlank
        };
    }

    buildInitialMatrix(yearMonth, daysInMonth, staffList, schedules, clearUnlocked) {
        const matrix = {};
        const [y, m] = yearMonth.split('-');
        staffList.forEach(s => {
            matrix[s.id] = {};
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${y}-${m}-${String(d).padStart(2, '0')}`;
                matrix[s.id][d] = {
                    symbol: null,
                    type: null,
                    locked: false,
                    fixed: false,
                    dayOfWeek: new Date(Number(y), Number(m) - 1, d).getDay(),
                    isSat: JapaneseCalendar.isSaturday(dateStr),
                    isSun: JapaneseCalendar.isSunday(dateStr),
                    isHol: JapaneseCalendar.isHoliday(dateStr),
                    dateStr,
                    domain: []
                };
                matrix[s.id][d].isSunOrHol = matrix[s.id][d].isSun || matrix[s.id][d].isHol;

                const existing = schedules[yearMonth]?.[s.id];
                const dStr = String(d).padStart(2, '0');
                if (existing && existing[dStr]) {
                    const cell = existing[dStr];
                    const isImmutable = cell.locked || cell.symbol === '希' || cell.symbol === '欠' || cell.symbol === '/';
                    if (!clearUnlocked || isImmutable) {
                        matrix[s.id][d].symbol = cell.symbol;
                        matrix[s.id][d].type = cell.type;
                        matrix[s.id][d].locked = isImmutable;
                    }
                }
            }
        });
        return matrix;
    }

    deduceAbsolutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, includeHolidays) {
        let changed = true;
        let iter = 0;
        while (changed && iter < 50) {
            changed = false;
            iter++;

            for (let d = startDay; d <= endDay; d++) {
                targetStaff.forEach(s => {
                    const cell = matrix[s.id][d];
                    if (cell.symbol) {
                        cell.domain = [];
                        return;
                    }

                    const possible = [];
                    dailySlots[d]?.forEach(slotReq => {
                        const capRoute = slotReq.id;
                        if (!this.canWorkRoute(s, cell, capRoute)) return;

                        let filled = 0;
                        allStaff.forEach(other => {
                            if (matrix[other.id][d].symbol === capRoute) filled++;
                        });
                        if (filled >= slotReq.count) return;

                        if (this.wouldBreakIntervals(matrix, s.id, d, capRoute)) return;

                        possible.push(capRoute);
                    });
                    cell.domain = possible;
                });
            }

            if (includeHolidays) {
                for (let d = startDay; d <= endDay; d++) {
                    targetStaff.forEach(s => {
                        const cell = matrix[s.id][d];
                        if (!cell.symbol && cell.domain.length === 1) {
                            const targetRoute = cell.domain[0];
                            cell.symbol = targetRoute;
                            cell.type = 'ROUTE';
                            cell.fixed = true;
                            changed = true;
                        }
                    });
                }
            }

            for (let d = startDay; d <= endDay; d++) {
                if (!dailySlots[d]) continue;
                dailySlots[d].forEach(req => {
                    let filled = 0;
                    allStaff.forEach(s => { if (matrix[s.id][d].symbol === req.id) filled++; });
                    const needed = req.count - filled;
                    if (needed <= 0) return;

                    const candidates = targetStaff.filter(s => {
                        const cell = matrix[s.id][d];
                        return !cell.symbol && cell.domain.includes(req.id);
                    });

                    if (candidates.length > 0 && candidates.length <= needed) {
                        candidates.forEach(c => {
                            matrix[c.id][d].symbol = req.id;
                            matrix[c.id][d].type = 'ROUTE';
                            matrix[c.id][d].fixed = true;
                            changed = true;
                        });
                    }
                });
            }
        }
    }

    assignScarceSpecialists(matrix, targetStaff, dailySlots, startDay, endDay) {
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;
            const orderedSlots = [...dailySlots[d]].sort((a, b) => {
                const capableA = targetStaff.filter(s => this.canWorkRoute(s, matrix[s.id][d], a.id)).length;
                const capableB = targetStaff.filter(s => this.canWorkRoute(s, matrix[s.id][d], b.id)).length;
                return capableA - capableB;
            });

            orderedSlots.forEach(req => {
                let filled = this.countRoute(matrix, targetStaff, d, req.id);
                if (filled >= req.count) return;

                const specialists = targetStaff
                    .filter(s => {
                        const cell = matrix[s.id][d];
                        if (cell.symbol && cell.symbol !== '祝日') return false;
                        if (!this.canWorkRoute(s, cell, req.id)) return false;
                        if (this.wouldBreakIntervals(matrix, s.id, d, req.id)) return false;
                        const usableToday = this.getUsableCapabilityCount(s, cell, dailySlots[d]);
                        const totalToday = this.getCapabilities(s, cell.isSat, cell.isSunOrHol).length;
                        return usableToday === 1 || totalToday === 1;
                    })
                    .sort(this.assignmentComparator(req.id, d, matrix, dailySlots[d], targetStaff));

                for (const s of specialists) {
                    if (filled >= req.count) break;
                    const cell = matrix[s.id][d];
                    cell.symbol = req.id;
                    cell.type = 'ROUTE';
                    filled++;
                }
            });
        }
    }

    wouldBreakIntervals(matrix, staffId, day, newRoute) {
        const prevSym = day > 1 ? matrix[staffId][day - 1].symbol : null;
        const nextSym = day < 31 && matrix[staffId][day + 1] ? matrix[staffId][day + 1].symbol : null;

        if (prevSym && this.constraints.isLate(prevSym) && this.constraints.isEarly(newRoute)) return true;
        if (prevSym && this.constraints.isNight(prevSym)) return true;

        if (nextSym) {
            if (this.constraints.isLate(newRoute) && this.constraints.isEarly(nextSym)) return true;
            if (this.constraints.isNight(newRoute) && !this.constraints.isDawn(nextSym)) return true;
        }
        return false;
    }

    getMatrixOrScheduleSym(matrix, staffId, dateStr) {
        const day = Number(dateStr.split('-')[2]);
        const cell = matrix[staffId]?.[day];
        if (cell?.dateStr === dateStr) return cell.symbol;
        return this.getScheduleSym(staffId, dateStr);
    }

    getContextualWorkStreakDates(matrix, staffId, startDay, endDay, maxConsecutive) {
        const startDateStr = matrix[staffId]?.[startDay]?.dateStr;
        const endDateStr = matrix[staffId]?.[endDay]?.dateStr;
        if (!startDateStr || !endDateStr) return [];

        const dates = [];
        for (let offset = -maxConsecutive; offset <= (endDay - startDay) + maxConsecutive; offset++) {
            dates.push(this.addDaysToDateStr(startDateStr, offset));
        }
        return dates;
    }

    // --- Holiday Distribution ---
    distributeHolidays(matrix, staffList, dailySlots, startDay, endDay, yearMonth) {
        const weeks = [];
        const [y, m] = yearMonth.split('-').map(Number);

        let startSundayOffset = null;
        for (let d = startDay; d <= endDay; d++) {
            const date = new Date(y, m - 1, d);
            if (startSundayOffset === null) startSundayOffset = d - date.getDay();

            const bucketIndex = Math.floor((d - startSundayOffset) / 7);
            if (!weeks[bucketIndex]) weeks[bucketIndex] = [];
            weeks[bucketIndex].push(d);
        }
        const validWeeks = weeks.filter(w => w && w.length > 0);

        const periodLength = endDay - startDay + 1;
        const hibanTarget = Math.round(periodLength / 7);

        staffList.forEach(s => {
            let existingHibanCount = 0;
            let existingShukyuCount = 0;

            // Pre-count existing items in the current block
            validWeeks.forEach(weekDays => {
                weekDays.forEach(d => {
                    const cell = matrix[s.id][d];
                    if (this.isOffSym(cell.symbol)) {
                        if (cell.symbol === '非番') existingHibanCount++;
                        if (cell.symbol === '週休') existingShukyuCount++;
                    }
                    if (cell.isHol && !cell.symbol) {
                        cell.symbol = '祝日';
                        cell.type = 'OFF';
                        cell.fixed = true;
                    }
                });
            });

            for (let d = startDay; d <= endDay; d++) {
                const cell = matrix[s.id][d];
                if (cell.locked || cell.isHol || cell.symbol) continue;
                if (!cell.isSat && !cell.isSun) continue;
                if (this.hasUsableRequiredRoute(s, cell, dailySlots[d] || [])) continue;

                if (cell.isSun && this.requiresWeeklyShukyu(s)) {
                    cell.symbol = '週休';
                    cell.type = 'OFF';
                    cell.fixed = true;
                    existingShukyuCount++;
                } else if (cell.isSat && this.requiresWeeklyHiban(s)) {
                    cell.symbol = '非番';
                    cell.type = 'OFF';
                    cell.fixed = true;
                    existingHibanCount++;
                }
            }

            // 0. SMARTER HOLIDAY PRE-ASSIGNMENT FOR EXTREME SPECIALISTS
            // Identify days where staff has EXACTLY 0 capabilities.
            const hasWeekendWorkOption = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i)
                .some(d => {
                    const cell = matrix[s.id][d];
                    if (cell.isHol || (!cell.isSat && !cell.isSun)) return false;
                    return this.hasUsableRequiredRoute(s, cell, dailySlots[d] || []);
                });
            let hibanRemaining = (hasWeekendWorkOption && this.requiresWeeklyHiban(s)) ? Math.max(0, hibanTarget - existingHibanCount) : 0;
            let shukyuRemaining = (hasWeekendWorkOption && this.requiresWeeklyShukyu(s)) ? Math.max(0, Math.round(periodLength / 7) - existingShukyuCount) : 0;

            for (let d = startDay; d <= endDay; d++) {
                const cell = matrix[s.id][d];
                if (cell.isHol) continue;
                // Only assign if it's open (not locked/already assigned)
                if (!cell.symbol) {
                    // Count how many of their capabilities are ACTUALLY required on this day
                    const requiredRoutesToday = dailySlots[d] ? dailySlots[d].map(r => r.id) : [];
                    const usableCaps = requiredRoutesToday.filter(routeId => this.canWorkRoute(s, cell, routeId));

                    // If they have literally 0 usable skills today, they CANNOT work today! Pre-assign holiday.
                    // Also honor staff-level unavailable weekdays (0=Sun ... 6=Sat).
                    const isUnavailableDay = (s.preferredOffDays || []).includes(cell.dayOfWeek);

                    if ((usableCaps.length === 0) || isUnavailableDay) {
                        if (shukyuRemaining > 0) {
                            matrix[s.id][d].symbol = '週休';
                            matrix[s.id][d].type = 'OFF';
                            matrix[s.id][d].fixed = true;
                            shukyuRemaining--;
                            existingShukyuCount++;
                        } else if (hibanRemaining > 0) {
                            matrix[s.id][d].symbol = '非番';
                            matrix[s.id][d].type = 'OFF';
                            matrix[s.id][d].fixed = true;
                            hibanRemaining--;
                            existingHibanCount++;
                        }
                    }
                }
            }

            // 1. Place exactly 1 週休 per calendar week for ordinary / 6-day staff.
            if (this.requiresWeeklyShukyu(s)) validWeeks.forEach(weekDays => {
                const firstDay = weekDays[0];
                const date = new Date(y, m - 1, firstDay);
                const dayOfWeek = date.getDay();

                let alreadyHasShukyu = false;

                // Check standard presence in current matrix
                weekDays.forEach(d => {
                    if (matrix[s.id][d].symbol === '週休') alreadyHasShukyu = true;
                });

                // Look behind to previous month if this is a cross-month calendar week
                if (!alreadyHasShukyu && firstDay === startDay && dayOfWeek > 0) {
                    for (let i = dayOfWeek - 1; i >= 0; i--) {
                        const checkDate = new Date(y, m - 1, firstDay - (dayOfWeek - i));
                        const checkY = checkDate.getFullYear();
                        const checkM = String(checkDate.getMonth() + 1).padStart(2, '0');
                        const checkD = String(checkDate.getDate()).padStart(2, '0');
                        if (this.getScheduleSym(s.id, `${checkY}-${checkM}-${checkD}`) === '週休') {
                            alreadyHasShukyu = true;
                            break;
                        }
                    }
                }

                if (!alreadyHasShukyu) {
                    const openDays = weekDays.filter(d => !matrix[s.id][d].symbol);
                    if (openDays.length > 0) {
                        const targetD = openDays[Math.floor(Math.random() * openDays.length)];
                        matrix[s.id][targetD].symbol = '週休';
                        matrix[s.id][targetD].type = 'OFF';
                        matrix[s.id][targetD].fixed = true;
                    }
                }
            });

            // 2. Place exactly 'neededHiban' to break up any >5 day gaps between off days
            let neededHiban = (hasWeekendWorkOption && this.requiresWeeklyHiban(s)) ? Math.max(0, hibanTarget - existingHibanCount) : 0;
            for (let i = 0; i < neededHiban; i++) {
                let offDays = [];
                for (let d = startDay; d <= endDay; d++) {
                    if (this.isOffSym(matrix[s.id][d].symbol) || matrix[s.id][d].symbol === '祝日') {
                        offDays.push(d);
                    }
                }

                let gaps = [];
                if (offDays.length === 0) {
                    gaps.push({ start: startDay, end: endDay, len: endDay - startDay + 1 });
                } else {
                    if (offDays[0] > startDay) {
                        gaps.push({ start: startDay, end: offDays[0] - 1, len: offDays[0] - startDay });
                    }
                    for (let j = 0; j < offDays.length - 1; j++) {
                        const sD = offDays[j] + 1;
                        const eD = offDays[j + 1] - 1;
                        if (eD >= sD) gaps.push({ start: sD, end: eD, len: eD - sD + 1 });
                    }
                    if (offDays[offDays.length - 1] < endDay) {
                        const sD = offDays[offDays.length - 1] + 1;
                        gaps.push({ start: sD, end: endDay, len: endDay - sD + 1 });
                    }
                }

                if (gaps.length > 0) {
                    gaps.sort((a, b) => b.len - a.len);
                    const biggestGap = gaps[0];
                    const midDay = Math.floor((biggestGap.start + biggestGap.end) / 2);

                    let placed = false;
                    for (let offset = 0; offset <= biggestGap.len; offset++) {
                        const up = midDay + offset;
                        const down = midDay - offset;
                        if (up <= biggestGap.end && !matrix[s.id][up].symbol) {
                            matrix[s.id][up].symbol = '非番'; matrix[s.id][up].type = 'OFF'; matrix[s.id][up].fixed = true; placed = true; break;
                        }
                        if (down >= biggestGap.start && !matrix[s.id][down].symbol) {
                            matrix[s.id][down].symbol = '非番'; matrix[s.id][down].type = 'OFF'; matrix[s.id][down].fixed = true; placed = true; break;
                        }
                    }
                    if (!placed) this.fallbackPlaceHiban(matrix, s.id, startDay, endDay);
                } else {
                    this.fallbackPlaceHiban(matrix, s.id, startDay, endDay);
                }
            }
        });
    }

    fallbackPlaceHiban(matrix, staffId, startDay, endDay) {
        let open = [];
        for (let d = startDay; d <= endDay; d++) {
            if (!matrix[staffId][d].symbol) open.push(d);
        }
        if (open.length > 0) {
            const tgt = open[Math.floor(Math.random() * open.length)];
            matrix[staffId][tgt].symbol = '非番';
            matrix[staffId][tgt].type = 'OFF';
            matrix[staffId][tgt].fixed = true;
        }
    }

    validateHolidayRules(matrix, staffId, startDay, endDay) {
        const staff = this.store.state.staff.find(s => String(s.id) === String(staffId));
        const maxConsecutive = this.store.getMaxConsecutiveWork
            ? this.store.getMaxConsecutiveWork(staff)
            : this.getStaffMaxConsecutive(staff);

        // 1. Ensure maximum consecutive work does not exceed staff/global setting,
        // including already-generated adjacent months in the visible range.
        if (!this.respectsMaxConsecutiveWork(matrix, staffId, startDay, endDay)) return false;

        // 2. Ensure the mathematical foundation of Off Days protects against over-limit streaks.
        let offDays = [];
        for (let d = startDay; d <= endDay; d++) {
            const sym = matrix[staffId][d].symbol;
            if (this.isOffSym(sym) || sym === '祝日') offDays.push(d);
        }
        if (offDays.length > 0) {
            if (offDays[0] - startDay > maxConsecutive) return false;
            if (endDay - offDays[offDays.length - 1] > maxConsecutive) return false;
            for (let i = 1; i < offDays.length; i++) {
                if (offDays[i] - offDays[i - 1] - 1 > maxConsecutive) return false;
            }
        } else {
            if (endDay - startDay + 1 > maxConsecutive) return false;
        }

        // 3. Ensure no more than 2 非番 between any 週休
        if (this.requiresWeeklyHiban(staff)) {
            let hibanCount = 0;
            let seenShukyu = false;
            for (let d = startDay; d <= endDay; d++) {
                const sym = matrix[staffId][d].symbol;
                if (sym === '週休') {
                    if (seenShukyu && hibanCount > 2) return false;
                    seenShukyu = true;
                    hibanCount = 0;
                } else if (sym === '非番') {
                    hibanCount++;
                }
            }
        }

        return true;
    }

    respectsMaxConsecutiveWork(matrix, staffId, startDay, endDay) {
        const staff = this.store.state.staff.find(s => String(s.id) === String(staffId));
        const maxConsecutive = this.store.getMaxConsecutiveWork
            ? this.store.getMaxConsecutiveWork(staff)
            : (this.store.state.settings?.maxConsecutiveWork ?? 5);

        let currentWorkStreak = 0;
        const dateStrs = this.getContextualWorkStreakDates(matrix, staffId, startDay, endDay, maxConsecutive);
        for (const dateStr of dateStrs) {
            const sym = this.getMatrixOrScheduleSym(matrix, staffId, dateStr);
            if (this.isWorkSymForStreak(sym)) {
                currentWorkStreak++;
                if (currentWorkStreak > maxConsecutive) return false;
            } else {
                currentWorkStreak = 0;
            }
        }
        return true;
    }

    // --- GAP FILLING AND SWAPPING ---
    fillGapsIterative(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        let missing = [];
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;
            dailySlots[d].forEach(req => {
                let filled = 0;
                allStaff.forEach(s => { if (matrix[s.id][d].symbol === req.id) filled++; });
                for (let i = 0; i < (req.count - filled); i++) missing.push({ day: d, routeId: req.id });
            });
        }

        // --- SORT BY LEAST REMAINING CHOICES (LRV) AND WEEKEND PRIORITY ---
        this.sortMissingSlots(missing, matrix, allStaff, dailySlots);

        // --- PRE-BALANCE: Move Holidays from Deficit Days to Surplus Days ---
        let preBalanceChanged = true;
        let preBalanceLoops = 0;
        while (preBalanceChanged && preBalanceLoops < 20 && !this.isGenerationTimeUp()) {
            preBalanceChanged = false;
            preBalanceLoops++;

            // Recalculate daily stats
            const dailyStats = {};
            for (let d = startDay; d <= endDay; d++) {
                if (!dailySlots[d]) continue;
                let required = 0;
                dailySlots[d].forEach(req => required += req.count);

                let working = 0;
                let resting = 0; // 祝日, meaning they COULD work but have no assignment
                let explicitOff = 0; // 週休, 非番, 年休

                allStaff.forEach(s => {
                    const sym = matrix[s.id][d].symbol;
                    if (!sym || sym === '祝日') resting++;
                    else if (this.isOffSym(sym)) explicitOff++;
                    else working++;
                });

                dailyStats[d] = {
                    deficit: Math.max(0, required - working - resting), // We absolutely lack bodies
                    surplus: Math.max(0, resting) // We have bodies sitting around doing nothing
                };
            }

            // Find a day that is starving for staff
            let worstDeficitDay = null;
            let maxDef = 0;
            for (let d = startDay; d <= endDay; d++) {
                if (dailyStats[d] && dailyStats[d].deficit > maxDef) {
                    worstDeficitDay = d;
                    maxDef = dailyStats[d].deficit;
                }
            }

            if (worstDeficitDay) {
                // Find a day with plenty of surplus bodies sitting around
                let bestSurplusDay = null;
                let maxSurpScore = 0;
                for (let d = startDay; d <= endDay; d++) {
                    const sampleStaff = targetStaff[0];
                    const restScore = sampleStaff ? this.getRestDestinationScore(matrix, allStaff, sampleStaff, d) : 0;
                    const surplusScore = (dailyStats[d]?.surplus || 0) * 10 + restScore;
                    if (dailyStats[d] && dailyStats[d].surplus > 0 && surplusScore > maxSurpScore) {
                        bestSurplusDay = d;
                        maxSurpScore = surplusScore;
                    }
                }

                if (bestSurplusDay) {
                    if (this.tradeHolidayToSurplusDay(matrix, targetStaff, worstDeficitDay, bestSurplusDay, startDay, endDay, yearMonth)) {
                        preBalanceChanged = true;
                    }
                }
            }
        }

        // --- CORE GAP FILLING (Iterative Swapping) ---
        let changed = true;
        let iterations = 0;

        // Loop aggressively until no more changes can be made or all missing slots are filled.
        // We use a high safety limit (2000) to prevent true infinite loops, but rely on `changed` to break early.
        while (missing.length > 0 && changed && iterations < 200 && !this.isGenerationTimeUp()) {
            changed = false;
            iterations++;
            const stillMissing = [];

            for (const slot of missing) {
                if (this.isGenerationTimeUp()) {
                    stillMissing.push(slot);
                    continue;
                }
                const directCandidate = [...targetStaff]
                    .sort(this.assignmentComparator(slot.routeId, slot.day, matrix, dailySlots[slot.day] || [], targetStaff))
                    .find(s => {
                        const c = matrix[s.id][slot.day];
                        if (c.symbol && c.symbol !== '祝日') return false;

                        if (!this.canWorkRoute(s, c, slot.routeId)) return false;

                        matrix[s.id][slot.day].symbol = slot.routeId;
                        const valid = this.validateHolidayRules(matrix, s.id, startDay, endDay);
                        const validInt = !this.wouldBreakIntervals(matrix, s.id, slot.day, slot.routeId);
                        matrix[s.id][slot.day].symbol = this.holidayFreeSymbol(c);

                        return valid && validInt;
                    });

                if (directCandidate) {
                    matrix[directCandidate.id][slot.day].symbol = slot.routeId;
                    matrix[directCandidate.id][slot.day].type = 'ROUTE';
                    changed = true;
                    continue;
                }

                if (this.trySwapRoute(matrix, targetStaff, slot.day, slot.routeId, startDay, endDay, yearMonth, dailySlots)) {
                    changed = true;
                    continue;
                }

                if (this.repairDayWithRouteRematch(matrix, allStaff, targetStaff, dailySlots, slot.day, startDay, endDay)) {
                    changed = true;
                    continue;
                }

                if (this.trySwapHoliday(matrix, targetStaff, slot.day, slot.routeId, startDay, endDay, yearMonth)) {
                    changed = true;
                    continue;
                }

                stillMissing.push(slot);
            }
            missing = stillMissing;
        }
    }

    isRouteAssignmentSym(sym) {
        return !!sym && sym !== '祝日' && !this.isOffSym(sym) && sym !== '欠' && sym !== '／' && sym !== '/';
    }

    snapshotCells(matrix, refs) {
        const seen = new Set();
        const backup = [];
        refs.forEach(ref => {
            if (!ref || !ref.staffId || !ref.day || !matrix[ref.staffId] || !matrix[ref.staffId][ref.day]) return;
            const key = `${ref.staffId}:${ref.day}`;
            if (seen.has(key)) return;
            seen.add(key);
            const cell = matrix[ref.staffId][ref.day];
            backup.push({
                staffId: ref.staffId,
                day: ref.day,
                symbol: cell.symbol,
                type: cell.type,
                fixed: cell.fixed
            });
        });
        return backup;
    }

    restoreCells(matrix, backup) {
        backup.forEach(item => {
            const cell = matrix[item.staffId][item.day];
            cell.symbol = item.symbol;
            cell.type = item.type;
            cell.fixed = item.fixed;
        });
    }

    snapshotRange(matrix, staffList, startDay, endDay) {
        const refs = [];
        staffList.forEach(staff => {
            for (let d = startDay; d <= endDay; d++) {
                refs.push({ staffId: staff.id, day: d });
            }
        });
        return this.snapshotCells(matrix, refs);
    }

    applyRoutePath(matrix, targetDay, path) {
        path.forEach(move => {
            const cell = matrix[move.staff.id][targetDay];
            cell.symbol = move.takes;
            cell.type = 'ROUTE';
            cell.fixed = false;
        });
    }

    validateRoutePath(matrix, path, startDay, endDay) {
        const staffIds = new Set(path.map(move => move.staff.id));
        return [...staffIds].every(staffId => (
            this.respectsMaxConsecutiveWork(matrix, staffId, startDay, endDay)
        ));
    }

    findRestDestinations(matrix, allStaff, staff, restSymbol, fromDay, dailySlots, startDay, endDay, yearMonth) {
        const destinationDays = [];
        for (let d = startDay; d <= endDay; d++) {
            if (d === fromDay) continue;
            if (this.dayRouteShortage(matrix, allStaff, dailySlots, d) > 0) continue;
            const destCell = matrix[staff.id][d];
            if (destCell.locked || destCell.symbol) continue;
            if (!this.canMoveRestBetweenDays(restSymbol, fromDay, d, yearMonth)) continue;
            destinationDays.push(d);
        }
        return destinationDays.sort((a, b) => (
            this.getRestDestinationScore(matrix, allStaff, staff, b) -
            this.getRestDestinationScore(matrix, allStaff, staff, a)
        ));
    }

    findRestDestinationOptions(matrix, allStaff, staff, restSymbol, fromDay, dailySlots, startDay, endDay, yearMonth) {
        const options = [];
        for (let d = startDay; d <= endDay; d++) {
            if (d === fromDay) continue;
            if (this.dayRouteShortage(matrix, allStaff, dailySlots, d) > 0) continue;
            if (!this.canMoveRestBetweenDays(restSymbol, fromDay, d, yearMonth)) continue;

            const destCell = matrix[staff.id][d];
            if (destCell.locked) continue;

            if (!destCell.symbol) {
                options.push({ day: d, mode: 'empty', droppedRoute: null });
            } else if (this.isRouteAssignmentSym(destCell.symbol)) {
                options.push({ day: d, mode: 'route', droppedRoute: destCell.symbol });
            }
        }

        const sorted = options.sort((a, b) => {
            if (a.mode !== b.mode) return a.mode === 'empty' ? -1 : 1;
            const scoreDiff = this.getRestDestinationScore(matrix, allStaff, staff, b.day) -
                this.getRestDestinationScore(matrix, allStaff, staff, a.day);
            if (scoreDiff !== 0) return scoreDiff;
            return Math.abs(a.day - fromDay) - Math.abs(b.day - fromDay);
        });
        return [
            ...sorted.filter(option => option.mode === 'empty').slice(0, 5),
            ...sorted.filter(option => option.mode === 'route').slice(0, 3)
        ];
    }

    repairDayWithRouteRematch(matrix, allStaff, targetStaff, dailySlots, day, startDay, endDay) {
        const slots = dailySlots[day] || [];
        if (slots.length === 0 || this.isGenerationTimeUp()) return false;

        const originalShortage = this.dayRouteShortage(matrix, allStaff, dailySlots, day);
        if (originalShortage === 0) return false;

        const movable = targetStaff.filter(staff => {
            const cell = matrix[staff.id][day];
            if (!cell || cell.locked) return false;
            return !cell.symbol || cell.symbol === '祝日' || this.isRouteAssignmentSym(cell.symbol);
        });

        if (movable.length === 0) return false;

        const movableIds = new Set(movable.map(staff => String(staff.id)));
        const required = [];
        slots.forEach(slot => {
            let fixedAssigned = 0;
            allStaff.forEach(staff => {
                const cell = matrix[staff.id][day];
                if (cell.symbol !== slot.id) return;
                if (cell.locked || !movableIds.has(String(staff.id))) fixedAssigned++;
            });

            const remaining = Math.max(0, slot.count - fixedAssigned);
            for (let i = 0; i < remaining; i++) {
                required.push({ routeId: slot.id, key: `${slot.id}:${i}` });
            }
        });

        if (required.length === 0) return false;

        const candidateMap = new Map();
        required.forEach(req => {
            const candidates = movable
                .filter(staff => {
                    const cell = matrix[staff.id][day];
                    if (!this.canWorkRoute(staff, cell, req.routeId)) return false;
                    if (this.wouldBreakIntervals(matrix, staff.id, day, req.routeId)) return false;

                    const backup = { symbol: cell.symbol, type: cell.type };
                    cell.symbol = req.routeId;
                    cell.type = 'ROUTE';
                    const valid = this.respectsMaxConsecutiveWork(matrix, staff.id, startDay, endDay);
                    cell.symbol = backup.symbol;
                    cell.type = backup.type;
                    return valid;
                })
                .sort(this.assignmentComparator(req.routeId, day, matrix, slots, targetStaff));
            candidateMap.set(req.key, candidates);
        });

        const orderedRequired = [...required].sort((a, b) => {
            const lenA = candidateMap.get(a.key)?.length || 0;
            const lenB = candidateMap.get(b.key)?.length || 0;
            if (lenA !== lenB) return lenA - lenB;
            return this.getRouteDemandGroups(b.routeId).length - this.getRouteDemandGroups(a.routeId).length;
        });

        const matchedStaffByRouteKey = new Map();
        const matchedRouteKeyByStaff = new Map();
        const routeByKey = new Map(orderedRequired.map(req => [req.key, req.routeId]));

        const tryAssign = (routeKey, seenStaff = new Set()) => {
            const candidates = candidateMap.get(routeKey) || [];
            for (const staff of candidates) {
                const staffKey = String(staff.id);
                if (seenStaff.has(staffKey)) continue;
                seenStaff.add(staffKey);

                const previousRouteKey = matchedRouteKeyByStaff.get(staffKey);
                if (!previousRouteKey || tryAssign(previousRouteKey, seenStaff)) {
                    matchedStaffByRouteKey.set(routeKey, staff);
                    matchedRouteKeyByStaff.set(staffKey, routeKey);
                    return true;
                }
            }
            return false;
        };

        orderedRequired.forEach(req => tryAssign(req.key));

        if (matchedStaffByRouteKey.size === 0) return false;

        const refs = movable.map(staff => ({ staffId: staff.id, day }));
        const backup = this.snapshotCells(matrix, refs);

        movable.forEach(staff => this.clearCell(matrix[staff.id][day]));
        matchedStaffByRouteKey.forEach((staff, routeKey) => {
            const cell = matrix[staff.id][day];
            cell.symbol = routeByKey.get(routeKey);
            cell.type = 'ROUTE';
            cell.fixed = false;
        });

        const changedStaffIds = new Set(movable.map(staff => String(staff.id)));
        const valid = [...changedStaffIds].every(staffId => (
            this.respectsMaxConsecutiveWork(matrix, staffId, startDay, endDay)
        ));
        const newShortage = this.dayRouteShortage(matrix, allStaff, dailySlots, day);
        const newOverage = this.totalRouteOverage(matrix, allStaff, dailySlots, day, day);

        if (valid && newShortage < originalShortage && newOverage === 0) {
            return true;
        }

        this.restoreCells(matrix, backup);
        return false;
    }

    trySwapRoute(
        matrix,
        targetStaff,
        targetDay,
        targetRoute,
        startDay,
        endDay,
        yearMonth = null,
        dailySlots = {},
        depth = 0,
        excludedStaffIds = new Set()
    ) {
        // Breadth-first augmenting-path repair:
        // fill a missing route by moving A to it, B to A's old route, and so on until
        // the chain reaches a usable blank/holiday or a movable rest day.
        if (depth > 2 || this.isGenerationTimeUp()) return false;

        const allStaff = this.store.state.staff || targetStaff;
        const originalShortage = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay);
        const queue = [];
        queue.push({
            routeToFill: targetRoute,
            path: [] // Array of { staff: s, takes: routeToFill, drops: currentRoute }
        });

        const visitedStates = new Set([targetRoute]);

        while (queue.length > 0) {
            if (this.isGenerationTimeUp()) return false;
            const { routeToFill, path } = queue.shift();

            if (path.length > 10) continue;

            const candidates = [...targetStaff]
                .sort(this.assignmentComparator(routeToFill, targetDay, matrix, dailySlots[targetDay] || [], targetStaff));

            for (const s of candidates) {
                if (excludedStaffIds.has(String(s.id))) continue;
                if (path.some(move => String(move.staff.id) === String(s.id))) continue;

                const cell = matrix[s.id][targetDay];
                if (cell.locked) continue;

                const currentSym = cell.symbol;

                if (currentSym === routeToFill) continue;
                if (!this.canWorkRoute(s, cell, routeToFill)) continue;
                if (this.wouldBreakIntervals(matrix, s.id, targetDay, routeToFill)) continue;

                if (!currentSym || currentSym === '祝日') {
                    const finalPath = [...path, { staff: s, takes: routeToFill, drops: currentSym }];
                    const backup = this.snapshotCells(matrix, finalPath.map(move => ({ staffId: move.staff.id, day: targetDay })));
                    this.applyRoutePath(matrix, targetDay, finalPath);

                    if (this.validateRoutePath(matrix, finalPath, startDay, endDay) &&
                        this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay) < originalShortage) {
                        return true;
                    }

                    this.restoreCells(matrix, backup);
                    continue;
                }

                if ((currentSym === '週休' || currentSym === '非番') && yearMonth) {
                    const restDestinations = this.findRestDestinationOptions(
                        matrix, allStaff, s, currentSym, targetDay, dailySlots, startDay, endDay, yearMonth
                    );
                    for (const option of restDestinations) {
                        if (this.isGenerationTimeUp()) return false;
                        const destDay = option.day;
                        const finalPath = [...path, { staff: s, takes: routeToFill, drops: currentSym }];
                        const refs = finalPath.map(move => ({ staffId: move.staff.id, day: targetDay }));
                        refs.push({ staffId: s.id, day: destDay });
                        const backup = option.mode === 'route'
                            ? this.snapshotRange(matrix, allStaff, startDay, endDay)
                            : this.snapshotCells(matrix, refs);

                        this.applyRoutePath(matrix, targetDay, finalPath);
                        const destCell = matrix[s.id][destDay];
                        destCell.symbol = currentSym;
                        destCell.type = 'OFF';
                        destCell.fixed = true;

                        const validBase = this.validateRoutePath(matrix, finalPath, startDay, endDay) &&
                            this.validateHolidayRules(matrix, s.id, startDay, endDay);

                        if (validBase && option.mode === 'empty' &&
                            this.dayRouteShortage(matrix, allStaff, dailySlots, destDay) === 0 &&
                            this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay) < originalShortage) {
                            return true;
                        }

                        if (validBase && option.mode === 'route') {
                            const nestedExcluded = new Set([...excludedStaffIds, String(s.id)]);
                            if (this.trySwapRoute(
                                matrix,
                                targetStaff,
                                destDay,
                                option.droppedRoute,
                                startDay,
                                endDay,
                                yearMonth,
                                dailySlots,
                                depth + 1,
                                nestedExcluded
                            ) && this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay) < originalShortage) {
                                return true;
                            }
                        }

                        this.restoreCells(matrix, backup);
                    }
                    continue;
                }

                if (this.isRouteAssignmentSym(currentSym)) {
                    const stateKey = `${currentSym}:${path.map(move => move.staff.id).join(',')}:${s.id}`;
                    if (visitedStates.has(stateKey)) continue;
                    visitedStates.add(stateKey);

                    queue.push({
                        routeToFill: currentSym,
                        path: [...path, { staff: s, takes: routeToFill, drops: currentSym }]
                    });
                }
            }
        }
        return false;
    }

    trySwapHoliday(matrix, targetStaff, targetDay, targetRoute, startDay, endDay, yearMonth) {
        const candidates = [...targetStaff].sort((a, b) => {
            const cellA = matrix[a.id][targetDay];
            const cellB = matrix[b.id][targetDay];
            const totalA = this.getCapabilities(a, cellA.isSat, cellA.isSunOrHol).length;
            const totalB = this.getCapabilities(b, cellB.isSat, cellB.isSunOrHol).length;
            return totalA - totalB;
        });

        for (const s of candidates) {
            const cell = matrix[s.id][targetDay];
            const currentSym = cell.symbol;

            if (currentSym !== '週休' && currentSym !== '非番') continue;
            if (cell.locked) continue;

            if (!this.canWorkRoute(s, cell, targetRoute)) continue;

            const backupSym = matrix[s.id][targetDay].symbol;

            let validRange = [];
            const [y, m] = yearMonth.split('-').map(Number);
            if (backupSym === '週休') {
                const targetDate = new Date(y, m - 1, targetDay);
                const dayOfWeek = targetDate.getDay();
                const sunday = targetDay - dayOfWeek;
                const saturday = sunday + 6;
                for (let d = Math.max(startDay, sunday); d <= Math.min(endDay, saturday); d++) {
                    if (d !== targetDay) validRange.push(d);
                }
            } else if (backupSym === '非番') {
                // Limit Hiban movement to +/- 3 days to prevent destroying spacing
                const minDay = Math.max(startDay, targetDay - 3);
                const maxDay = Math.min(endDay, targetDay + 3);
                for (let d = minDay; d <= maxDay; d++) {
                    if (d !== targetDay) validRange.push(d);
                }
            } else {
                for (let d = startDay; d <= endDay; d++) {
                    if (d !== targetDay) validRange.push(d);
                }
            }

            validRange.sort((a, b) => (
                this.getRestDestinationScore(matrix, targetStaff, s, b) -
                this.getRestDestinationScore(matrix, targetStaff, s, a)
            ));

            for (const altDay of validRange) {
                const altCell = matrix[s.id][altDay];
                if (altCell.symbol) continue;

                const altBackup = altCell.symbol;
                matrix[s.id][altDay].symbol = backupSym;
                matrix[s.id][targetDay].symbol = targetRoute;

                const validRules = this.validateHolidayRules(matrix, s.id, startDay, endDay) &&
                    !this.wouldBreakIntervals(matrix, s.id, targetDay, targetRoute);

                if (validRules) {
                    matrix[s.id][targetDay].type = 'ROUTE';
                    matrix[s.id][altDay].type = 'OFF';
                    return true;
                }

                matrix[s.id][altDay].symbol = altBackup;
                matrix[s.id][targetDay].symbol = backupSym;
            }
        }
        return false;
    }

    tradeHolidayToSurplusDay(matrix, targetStaff, deficitDay, surplusDay, startDay, endDay, yearMonth) {
        // We need someone who is explicitly resting (週休/非番) on deficitDay, 
        // who CAN work the missing routes on deficitDay, 
        // to move their rest to surplusDay (where they are currently 祝日/null and could absorb a rest).

        for (const s of targetStaff) {
            const cDef = matrix[s.id][deficitDay];
            const cSur = matrix[s.id][surplusDay];

            if (cDef.locked || cSur.locked) continue;
            if (cDef.symbol !== '週休' && cDef.symbol !== '非番') continue;
            if (cSur.symbol) continue; // Rest days must move to a genuinely empty non-holiday day.

            // Check bounding limits for the holiday type
            const backupSym = cDef.symbol;
            const [y, m] = yearMonth.split('-').map(Number);
            let validDest = false;

            if (backupSym === '週休') {
                const targetDate = new Date(y, m - 1, deficitDay);
                const dayOfWeek = targetDate.getDay();
                const sunday = deficitDay - dayOfWeek;
                const saturday = sunday + 6;
                if (surplusDay >= Math.max(startDay, sunday) && surplusDay <= Math.min(endDay, saturday)) {
                    validDest = true;
                }
            } else if (backupSym === '非番') {
                if (surplusDay >= deficitDay - 3 && surplusDay <= deficitDay + 3) {
                    validDest = true;
                }
            } else {
                validDest = true;
            }

            if (!validDest) continue;

            // Try the swap
            const altBackup = cSur.symbol;
            matrix[s.id][surplusDay].symbol = backupSym;
            matrix[s.id][deficitDay].symbol = this.holidayFreeSymbol(cDef);

            const validRules = this.validateHolidayRules(matrix, s.id, startDay, endDay);

            if (validRules) {
                matrix[s.id][deficitDay].type = 'OFF';
                matrix[s.id][surplusDay].type = 'OFF';
                return true;
            }

            // Revert
            matrix[s.id][surplusDay].symbol = altBackup;
            matrix[s.id][deficitDay].symbol = backupSym;
        }
        return false;
    }

    // --- Conflict Resolution ---
    resolveConflicts(matrix, allStaff, targetStaff, dailySlots, startDay, endDay) {
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;

            dailySlots[d].forEach(req => {
                const assigned = allStaff.filter(s => matrix[s.id][d].symbol === req.id);

                // 1. Resolve Duplicates (Too many assigned)
                if (assigned.length > req.count) {
                    const unlocked = assigned
                        .filter(s => !matrix[s.id][d].locked)
                        .sort(this.assignmentComparator(req.id, d, matrix, dailySlots[d] || [], targetStaff, true));
                    const overage = assigned.length - req.count;

                    for (let i = 0; i < overage && i < unlocked.length; i++) {
                        const s = unlocked[i];
                        // Clear true overage back to empty so the footer "空き" count reflects it.
                        this.clearCell(matrix[s.id][d]);
                    }
                }
            });

            // 2. Resolve Missing (Too few assigned)
            const missing = [];
            dailySlots[d].forEach(req => {
                const filled = this.countRoute(matrix, allStaff, d, req.id);
                if (filled < req.count) {
                    for (let i = 0; i < (req.count - filled); i++) missing.push(req.id);
                }
            });

            missing.forEach(missingRoute => {
                const req = dailySlots[d].find(r => r.id === missingRoute);
                if (!req || this.countRoute(matrix, allStaff, d, missingRoute) >= req.count) return;

                // Find capable staff resting/free on empty or '祝日'.
                const holidayStaff = targetStaff.filter(s => {
                    const c = matrix[s.id][d];
                    if (c.locked) return false;
                    if (c.symbol && c.symbol !== '祝日') return false;
                    if (!this.canWorkRoute(s, c, missingRoute)) return false;
                    if (this.wouldBreakIntervals(matrix, s.id, d, missingRoute)) return false;

                    const backupSym = c.symbol;
                    const backupType = c.type;
                    c.symbol = missingRoute;
                    c.type = 'ROUTE';
                    const valid = this.validateHolidayRules(matrix, s.id, startDay, endDay);
                    c.symbol = backupSym;
                    c.type = backupType;
                    return valid;
                }).sort(this.assignmentComparator(missingRoute, d, matrix, dailySlots[d] || [], targetStaff));

                if (holidayStaff.length > 0) {
                    const s = holidayStaff[0];
                    matrix[s.id][d].symbol = missingRoute;
                    matrix[s.id][d].type = 'ROUTE';
                }
            });
        }
    }

    finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth = null) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 10 && !this.isGenerationTimeUp()) {
            changed = false;
            loops++;

            for (let d = startDay; d <= endDay; d++) {
                if (this.isGenerationTimeUp()) break;
                if (!dailySlots[d]) continue;

                const missingRoutes = [];
                dailySlots[d].forEach(req => {
                    const shortage = req.count - this.countRoute(matrix, allStaff, d, req.id);
                    for (let i = 0; i < shortage; i++) missingRoutes.push(req.id);
                });

                missingRoutes.forEach(routeId => {
                    if (this.isGenerationTimeUp()) return;
                    if (this.countRoute(matrix, allStaff, d, routeId) >= (dailySlots[d].find(req => req.id === routeId)?.count || 0)) {
                        return;
                    }

                    const candidate = [...targetStaff]
                        .sort(this.assignmentComparator(routeId, d, matrix, dailySlots[d] || [], targetStaff))
                        .find(s => {
                            const c = matrix[s.id][d];
                            if (c.locked) return false;
                            if (c.symbol && c.symbol !== '祝日') return false;
                            if (!this.canWorkRoute(s, c, routeId)) return false;
                            if (this.wouldBreakIntervals(matrix, s.id, d, routeId)) return false;

                            const backupSym = c.symbol;
                            const backupType = c.type;
                            c.symbol = routeId;
                            c.type = 'ROUTE';
                            const valid = this.respectsMaxConsecutiveWork(matrix, s.id, startDay, endDay);
                            c.symbol = backupSym;
                            c.type = backupType;
                            return valid;
                        });

                    if (candidate) {
                        const c = matrix[candidate.id][d];
                        c.symbol = routeId;
                        c.type = 'ROUTE';
                        changed = true;
                    } else if (yearMonth && this.trySwapRoute(matrix, targetStaff, d, routeId, startDay, endDay, yearMonth, dailySlots)) {
                        changed = true;
                    } else if (this.repairDayWithRouteRematch(matrix, allStaff, targetStaff, dailySlots, d, startDay, endDay)) {
                        changed = true;
                    }
                });
            }
        }
    }

    repairMissingWithAugmentingSearch(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 8 && !this.isGenerationTimeUp()) {
            changed = false;
            loops++;

            const missing = this.sortMissingSlots(
                this.getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay),
                matrix,
                targetStaff,
                dailySlots
            );

            for (const slot of missing) {
                if (this.isGenerationTimeUp()) break;
                const req = dailySlots[slot.day]?.find(r => r.id === slot.routeId);
                if (!req || this.countRoute(matrix, allStaff, slot.day, slot.routeId) >= req.count) continue;

                if (this.trySwapRoute(matrix, targetStaff, slot.day, slot.routeId, startDay, endDay, yearMonth, dailySlots)) {
                    changed = true;
                }
            }
        }
    }

    getCalendarWeekStartDay(yearMonth, day) {
        const [y, m] = yearMonth.split('-').map(Number);
        const date = new Date(y, m - 1, day);
        return day - date.getDay();
    }

    getCalendarWeekRanges(startDay, endDay, sampleCell) {
        if (!sampleCell?.dateStr) return [];
        const [y, m] = sampleCell.dateStr.split('-').map(Number);
        const weeks = [];
        let cursor = startDay;
        while (cursor <= endDay) {
            const date = new Date(y, m - 1, cursor);
            const weekStart = cursor - date.getDay();
            const weekEnd = weekStart + 6;
            const visibleStart = Math.max(startDay, weekStart);
            const visibleEnd = Math.min(endDay, weekEnd);
            weeks.push({ weekStart, weekEnd, visibleStart, visibleEnd });
            cursor = visibleEnd + 1;
        }
        return weeks;
    }

    countHibanCoverageViolations(matrix, staffId, startDay, endDay) {
        const staff = this.store.state.staff.find(s => String(s.id) === String(staffId));
        if (!this.requiresWeeklyHiban(staff)) return 0;

        const weeks = this.getCalendarWeekRanges(startDay, endDay, matrix[staffId]?.[startDay]);
        let violations = 0;

        weeks.forEach(week => {
            const visibleDays = week.visibleEnd - week.visibleStart + 1;
            if (visibleDays < 4) return;

            let exactWeekHiban = 0;
            for (let d = week.visibleStart; d <= week.visibleEnd; d++) {
                if (matrix[staffId]?.[d]?.symbol === '非番') exactWeekHiban++;
            }
            if (exactWeekHiban >= 3) violations++;

            let hasHibanNearWeek = false;
            const nearStart = Math.max(startDay, week.weekStart - 3);
            const nearEnd = Math.min(endDay, week.weekEnd + 3);
            for (let d = nearStart; d <= nearEnd; d++) {
                if (matrix[staffId]?.[d]?.symbol === '非番') {
                    hasHibanNearWeek = true;
                    break;
                }
            }
            if (!hasHibanNearWeek) violations++;
        });

        return violations;
    }

    requiresWeeklyHiban(staff) {
        if (!staff) return false;
        if (this.getStaffMaxConsecutive(staff) >= 6) return false;
        const allCaps = [
            ...(staff.capabilities || []),
            ...(staff.satCapabilities || []),
            ...(staff.sunCapabilities || [])
        ];
        return allCaps.some(routeId => {
            const groups = this.getRouteDemandGroups(routeId);
            return groups.includes('team1') || groups.includes('team2') || groups.includes('shared-special');
        });
    }

    repairWeeklyHibanCoverage(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 4 && !this.isGenerationTimeUp()) {
            changed = false;
            loops++;

            for (const staff of targetStaff) {
                if (this.isGenerationTimeUp()) break;
                if (!this.requiresWeeklyHiban(staff)) continue;
                const weeks = this.getCalendarWeekRanges(startDay, endDay, matrix[staff.id]?.[startDay]);

                for (const week of weeks) {
                    const visibleDays = week.visibleEnd - week.visibleStart + 1;
                    if (visibleDays < 4) continue;

                    const nearStart = Math.max(startDay, week.weekStart - 3);
                    const nearEnd = Math.min(endDay, week.weekEnd + 3);
                    let hasHibanNearWeek = false;
                    for (let d = nearStart; d <= nearEnd; d++) {
                        if (matrix[staff.id]?.[d]?.symbol === '非番') {
                            hasHibanNearWeek = true;
                            break;
                        }
                    }
                    if (hasHibanNearWeek) continue;

                    const candidates = [];
                    for (let d = nearStart; d <= nearEnd; d++) {
                        const cell = matrix[staff.id][d];
                        if (cell.locked || cell.isHol || cell.symbol === '週休' || cell.symbol === '非番') continue;
                        if (this.countHibanInWeek(matrix, staff.id, yearMonth, d, startDay, endDay) >= 2) continue;

                        const currentSym = cell.symbol;
                        let score = cell.isSunOrHol ? 60 : cell.isSat ? 45 : 0;
                        if (!currentSym) {
                            score += 200;
                        } else if (this.isRouteAssignmentSym(currentSym)) {
                            const capable = targetStaff.filter(s => this.canWorkRoute(s, matrix[s.id][d], currentSym)).length;
                            score += capable * 10;
                            if (this.countRoute(matrix, allStaff, d, currentSym) > (dailySlots[d]?.find(req => req.id === currentSym)?.count || 0)) {
                                score += 80;
                            }
                        } else {
                            continue;
                        }

                        candidates.push({ day: d, score });
                    }

                    candidates.sort((a, b) => b.score - a.score || Math.abs(a.day - week.visibleStart) - Math.abs(b.day - week.visibleStart));

                    for (const candidate of candidates) {
                        const cell = matrix[staff.id][candidate.day];
                        const previousSymbol = cell.symbol;
                        const previousViolations = this.countHibanCoverageViolations(matrix, staff.id, startDay, endDay);
                        const previousShortage = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay);
                        const backup = this.snapshotRange(matrix, allStaff, startDay, endDay);
                        cell.symbol = '非番';
                        cell.type = 'OFF';
                        cell.fixed = true;

                        if (this.isRouteAssignmentSym(previousSymbol) &&
                            this.dayRouteShortage(matrix, allStaff, dailySlots, candidate.day) > 0) {
                            this.trySwapRoute(
                                matrix,
                                targetStaff,
                                candidate.day,
                                previousSymbol,
                                startDay,
                                endDay,
                                yearMonth,
                                dailySlots,
                                0,
                                new Set([String(staff.id)])
                            );
                            this.repairDayWithRouteRematch(matrix, allStaff, targetStaff, dailySlots, candidate.day, startDay, endDay);
                        }

                        const valid = this.respectsMaxConsecutiveWork(matrix, staff.id, startDay, endDay) &&
                            this.countHibanCoverageViolations(matrix, staff.id, startDay, endDay) < previousViolations &&
                            this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay) <= previousShortage;

                        if (valid) {
                            changed = true;
                            break;
                        }

                        this.restoreCells(matrix, backup);
                    }
                }
            }
        }
    }

    hasShukyuInWeek(matrix, staffId, yearMonth, day, startDay, endDay) {
        const weekStart = this.getCalendarWeekStartDay(yearMonth, day);
        const weekEnd = weekStart + 6;
        for (let d = Math.max(startDay, weekStart); d <= Math.min(endDay, weekEnd); d++) {
            if (matrix[staffId][d]?.symbol === '週休') return true;
        }
        return false;
    }

    countHibanInWeek(matrix, staffId, yearMonth, day, startDay, endDay) {
        const weekStart = this.getCalendarWeekStartDay(yearMonth, day);
        const weekEnd = weekStart + 6;
        let count = 0;
        for (let d = Math.max(startDay, weekStart); d <= Math.min(endDay, weekEnd); d++) {
            if (matrix[staffId][d]?.symbol === '非番') count++;
        }
        return count;
    }

    chooseInsertedRestSymbol(matrix, staff, cell, yearMonth, day, startDay, endDay) {
        if (cell.isHol) return '祝日';
        if (!this.requiresWeeklyShukyu(staff)) return null;
        if (!this.hasShukyuInWeek(matrix, staff.id, yearMonth, day, startDay, endDay)) return '週休';
        return this.requiresWeeklyHiban(staff) ? '非番' : null;
    }

    findRestInsertionCandidates(matrix, staff, startDay, endDay) {
        const staffMax = this.store.getMaxConsecutiveWork
            ? this.store.getMaxConsecutiveWork(staff)
            : (this.store.state.settings?.maxConsecutiveWork ?? 5);
        const streaks = [];
        let current = [];

        for (let d = startDay; d <= endDay; d++) {
            const sym = matrix[staff.id][d].symbol;
            if (this.isRouteAssignmentSym(sym)) {
                current.push(d);
            } else {
                if (current.length > 0) streaks.push(current);
                current = [];
            }
        }
        if (current.length > 0) streaks.push(current);

        const longStreakDays = streaks
            .filter(streak => streak.length > staffMax)
            .flatMap(streak => {
                const center = Math.floor(streak.length / 2);
                return [...streak].sort((a, b) => Math.abs(streak.indexOf(a) - center) - Math.abs(streak.indexOf(b) - center));
            });

        const fallbackDays = [];
        for (let d = startDay; d <= endDay; d++) {
            if (this.isRouteAssignmentSym(matrix[staff.id][d].symbol)) fallbackDays.push(d);
        }

        return [...new Set([...longStreakDays, ...fallbackDays])];
    }

    repairHolidayRuleViolations(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        for (const staff of targetStaff) {
            let attempts = 0;
            while (!this.isGenerationTimeUp() && !this.validateHolidayRules(matrix, staff.id, startDay, endDay) && attempts < 4) {
                attempts++;
                const candidates = this.findRestInsertionCandidates(matrix, staff, startDay, endDay);
                let repaired = false;

                for (const day of candidates) {
                    if (this.isGenerationTimeUp()) break;
                    const cell = matrix[staff.id][day];
                    if (cell.locked || !this.isRouteAssignmentSym(cell.symbol)) continue;

                    const droppedRoute = cell.symbol;
                    const restSymbol = this.chooseInsertedRestSymbol(matrix, staff, cell, yearMonth, day, startDay, endDay);
                    if (!restSymbol) continue;
                    if (restSymbol === '非番' &&
                        this.countHibanInWeek(matrix, staff.id, yearMonth, day, startDay, endDay) >= 2) {
                        continue;
                    }
                    const beforeMissing = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay);
                    const backup = this.snapshotRange(matrix, allStaff, startDay, endDay);

                    cell.symbol = restSymbol;
                    cell.type = 'OFF';
                    cell.fixed = true;

                    const excluded = new Set([String(staff.id)]);
                    if (this.trySwapRoute(matrix, targetStaff, day, droppedRoute, startDay, endDay, yearMonth, dailySlots, 0, excluded) &&
                        this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay) <= beforeMissing &&
                        this.totalRouteOverage(matrix, allStaff, dailySlots, startDay, endDay) === 0) {
                        repaired = true;
                        break;
                    }

                    this.restoreCells(matrix, backup);
                }

                if (!repaired) break;
            }
        }
    }

    labelSurplusBlanks(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        const targetMaxBlank = 2;
        let changed = true;
        let loops = 0;

        while (changed && loops < 4 && !this.isGenerationTimeUp()) {
            changed = false;
            loops++;

            const days = [];
            for (let d = startDay; d <= endDay; d++) {
                days.push({
                    day: d,
                    blanks: this.blankCount(matrix, targetStaff, d),
                    shortage: this.dayRouteShortage(matrix, allStaff, dailySlots, d)
                });
            }

            days
                .filter(item => item.shortage === 0 && item.blanks > targetMaxBlank)
                .sort((a, b) => b.blanks - a.blanks)
                .forEach(item => {
                    if (this.isGenerationTimeUp()) return;

                    const candidates = [...targetStaff]
                        .filter(staff => {
                            const cell = matrix[staff.id][item.day];
                            return !cell.locked && !cell.symbol;
                        })
                        .sort((a, b) => {
                            const cellA = matrix[a.id][item.day];
                            const cellB = matrix[b.id][item.day];
                            const usableA = this.getUsableCapabilityCount(a, cellA, dailySlots[item.day] || []);
                            const usableB = this.getUsableCapabilityCount(b, cellB, dailySlots[item.day] || []);
                            if (usableA !== usableB) return usableA - usableB;
                            return String(a.id).localeCompare(String(b.id));
                        });

                    for (const staff of candidates) {
                        if (this.blankCount(matrix, targetStaff, item.day) <= targetMaxBlank) break;
                        const cell = matrix[staff.id][item.day];
                        const symbol = this.chooseInsertedRestSymbol(matrix, staff, cell, yearMonth, item.day, startDay, endDay);
                        if (!symbol) continue;

                        if (symbol === '非番' &&
                            this.countHibanInWeek(matrix, staff.id, yearMonth, item.day, startDay, endDay) >= 2) {
                            continue;
                        }

                        const backup = this.snapshotCells(matrix, [{ staffId: staff.id, day: item.day }]);
                        cell.symbol = symbol;
                        cell.type = 'OFF';
                        cell.fixed = true;

                        const valid = this.validateHolidayRules(matrix, staff.id, startDay, endDay) &&
                            this.dayRouteShortage(matrix, allStaff, dailySlots, item.day) === 0;

                        if (valid) {
                            changed = true;
                        } else {
                            this.restoreCells(matrix, backup);
                        }
                    }
                });
        }
    }

    sacrificeSoftRoutesForHardMissing(matrix, allStaff, targetStaff, dailySlots, startDay, endDay) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 20 && !this.isGenerationTimeUp()) {
            changed = false;
            loops++;

            const hardMissing = this.sortMissingSlots(
                this.getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay, { includeSoft: false }),
                matrix,
                targetStaff,
                dailySlots
            );

            for (const slot of hardMissing) {
                if (this.isGenerationTimeUp()) break;
                const req = dailySlots[slot.day]?.find(item => item.id === slot.routeId);
                if (!req || this.countRoute(matrix, allStaff, slot.day, slot.routeId) >= req.count) continue;

                // Soft 欠区 is only allowed after ordinary empty capacity on that
                // day has already been exhausted. Until then, normal fill logic
                // should keep trying to cover both hard and soft routes.
                if (this.blankCount(matrix, targetStaff, slot.day) > 0) continue;

                const candidates = targetStaff
                    .filter(staff => {
                        const cell = matrix[staff.id][slot.day];
                        if (!cell || cell.locked) return false;
                        if (!this.isSoftMissingRouteId(cell.symbol)) return false;
                        if (!this.canWorkRoute(staff, cell, slot.routeId)) return false;
                        if (this.wouldBreakIntervals(matrix, staff.id, slot.day, slot.routeId)) return false;
                        return true;
                    })
                    .sort(this.assignmentComparator(slot.routeId, slot.day, matrix, dailySlots[slot.day] || [], targetStaff));

                for (const staff of candidates) {
                    const cell = matrix[staff.id][slot.day];
                    const backup = { symbol: cell.symbol, type: cell.type, fixed: cell.fixed };
                    const beforeHard = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay, { includeSoft: false });

                    cell.symbol = slot.routeId;
                    cell.type = 'ROUTE';
                    cell.fixed = false;

                    const afterHard = this.totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay, { includeSoft: false });
                    const valid = afterHard < beforeHard &&
                        this.respectsMaxConsecutiveWork(matrix, staff.id, startDay, endDay) &&
                        this.validateHolidayRules(matrix, staff.id, startDay, endDay) &&
                        this.totalRouteOverage(matrix, allStaff, dailySlots, slot.day, slot.day) === 0;

                    if (valid) {
                        changed = true;
                        break;
                    }

                    cell.symbol = backup.symbol;
                    cell.type = backup.type;
                    cell.fixed = backup.fixed;
                }

                if (changed) break;
            }
        }
    }

    getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay, options = {}) {
        const includeHard = options.includeHard !== false;
        const includeSoft = options.includeSoft !== false;
        const missing = [];
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;
            dailySlots[d].forEach(req => {
                const isSoft = this.isSoftMissingRouteId(req.id);
                if ((isSoft && !includeSoft) || (!isSoft && !includeHard)) return;
                const shortage = req.count - this.countRoute(matrix, allStaff, d, req.id);
                for (let i = 0; i < shortage; i++) missing.push({ day: d, routeId: req.id });
            });
        }
        return missing;
    }

    dayRouteShortage(matrix, allStaff, dailySlots, day, options = {}) {
        if (!dailySlots[day]) return 0;
        const includeHard = options.includeHard !== false;
        const includeSoft = options.includeSoft !== false;
        return dailySlots[day].reduce((total, req) => {
            const isSoft = this.isSoftMissingRouteId(req.id);
            if ((isSoft && !includeSoft) || (!isSoft && !includeHard)) return total;
            return total + Math.max(0, req.count - this.countRoute(matrix, allStaff, day, req.id));
        }, 0);
    }

    totalRouteShortage(matrix, allStaff, dailySlots, startDay, endDay, options = {}) {
        let total = 0;
        for (let d = startDay; d <= endDay; d++) {
            total += this.dayRouteShortage(matrix, allStaff, dailySlots, d, options);
        }
        return total;
    }

    totalRouteOverage(matrix, allStaff, dailySlots, startDay, endDay) {
        let total = 0;
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;
            dailySlots[d].forEach(req => {
                total += Math.max(0, this.countRoute(matrix, allStaff, d, req.id) - req.count);
            });
        }
        return total;
    }

    emptyCount(matrix, staffList, day) {
        return staffList.reduce((count, staff) => {
            const sym = matrix[staff.id][day].symbol;
            return count + (!sym || sym === '祝日' ? 1 : 0);
        }, 0);
    }

    getRestDestinationScore(matrix, allStaff, staff, day) {
        const cell = matrix[staff.id]?.[day];
        const weekendWeight = cell?.isSunOrHol ? 24 : cell?.isSat ? 16 : 0;
        return this.emptyCount(matrix, allStaff, day) * 10 + weekendWeight;
    }

    blankCount(matrix, staffList, day) {
        return staffList.reduce((count, staff) => (
            !matrix[staff.id][day].symbol ? count + 1 : count
        ), 0);
    }

    canMoveRestBetweenDays(restSymbol, fromDay, toDay, yearMonth) {
        if (restSymbol === '非番') {
            return Math.abs(toDay - fromDay) <= 3;
        }
        if (restSymbol === '週休') {
            const [y, m] = yearMonth.split('-').map(Number);
            const fromDate = new Date(y, m - 1, fromDay);
            const toDate = new Date(y, m - 1, toDay);
            const fromWeekStart = new Date(fromDate);
            fromWeekStart.setDate(fromDate.getDate() - fromDate.getDay());
            const toWeekStart = new Date(toDate);
            toWeekStart.setDate(toDate.getDate() - toDate.getDay());
            return fromWeekStart.getTime() === toWeekStart.getTime();
        }
        return false;
    }

    rebalanceCoveredSurplusDays(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 50) {
            changed = false;
            loops++;

            const missing = this.sortMissingSlots(
                this.getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay),
                matrix,
                targetStaff,
                dailySlots
            );

            for (const slot of missing) {
                if (this.countRoute(matrix, allStaff, slot.day, slot.routeId) >= (dailySlots[slot.day].find(req => req.id === slot.routeId)?.count || 0)) {
                    continue;
                }

                const restCandidates = [...targetStaff]
                    .filter(s => {
                        const c = matrix[s.id][slot.day];
                        if (c.locked) return false;
                        if (c.symbol !== '週休' && c.symbol !== '非番') return false;
                        if (!this.canWorkRoute(s, c, slot.routeId)) return false;
                        if (this.wouldBreakIntervals(matrix, s.id, slot.day, slot.routeId)) return false;
                        return true;
                    })
                    .sort(this.assignmentComparator(slot.routeId, slot.day, matrix, dailySlots[slot.day] || [], targetStaff));

                for (const staff of restCandidates) {
                    const sourceCell = matrix[staff.id][slot.day];
                    const restSymbol = sourceCell.symbol;
                    const destinationDays = [];

                    for (let d = startDay; d <= endDay; d++) {
                        if (d === slot.day) continue;
                        if (this.dayRouteShortage(matrix, allStaff, dailySlots, d) > 0) continue;
                        const destCell = matrix[staff.id][d];
                        if (destCell.locked || destCell.symbol) continue;
                        if (!this.canMoveRestBetweenDays(restSymbol, slot.day, d, yearMonth)) continue;
                        destinationDays.push(d);
                    }

                    destinationDays.sort((a, b) => (
                        this.getRestDestinationScore(matrix, allStaff, staff, b) -
                        this.getRestDestinationScore(matrix, allStaff, staff, a)
                    ));

                    for (const destDay of destinationDays) {
                        const destCell = matrix[staff.id][destDay];
                        const sourceBackup = { symbol: sourceCell.symbol, type: sourceCell.type, fixed: sourceCell.fixed };
                        const destBackup = { symbol: destCell.symbol, type: destCell.type, fixed: destCell.fixed };

                        sourceCell.symbol = slot.routeId;
                        sourceCell.type = 'ROUTE';
                        sourceCell.fixed = false;
                        destCell.symbol = restSymbol;
                        destCell.type = 'OFF';
                        destCell.fixed = true;

                        const valid = this.validateHolidayRules(matrix, staff.id, startDay, endDay) &&
                            !this.wouldBreakIntervals(matrix, staff.id, slot.day, slot.routeId) &&
                            this.dayRouteShortage(matrix, allStaff, dailySlots, destDay) === 0;

                        if (valid) {
                            changed = true;
                            break;
                        }

                        sourceCell.symbol = sourceBackup.symbol;
                        sourceCell.type = sourceBackup.type;
                        sourceCell.fixed = sourceBackup.fixed;
                        destCell.symbol = destBackup.symbol;
                        destCell.type = destBackup.type;
                        destCell.fixed = destBackup.fixed;
                    }

                    if (changed) break;
                }

                if (changed) break;
            }
        }
    }

    applyMatrixToSchedule(yearMonth, matrix, stateSchedule, staffList, startDay, endDay) {
        if (!stateSchedule[yearMonth]) stateSchedule[yearMonth] = {};

        staffList.forEach(s => {
            if (!stateSchedule[yearMonth][s.id]) stateSchedule[yearMonth][s.id] = {};
            for (let d = startDay; d <= endDay; d++) {
                const cell = matrix[s.id][d];
                const dStr = String(d).padStart(2, '0');
                if (cell.symbol) {
                    stateSchedule[yearMonth][s.id][dStr] = {
                        symbol: cell.symbol,
                        type: cell.type || 'ROUTE',
                        locked: cell.locked,
                        auto: true
                    };
                } else {
                    delete stateSchedule[yearMonth][s.id][dStr]; // If empty, clear it in state
                }
            }
        });
        this.store.updateSchedule(yearMonth, stateSchedule[yearMonth]);
    }
}
