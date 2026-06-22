import { ShiftConstraints } from './constraints.js';
import { JapaneseCalendar } from './holidays.js';

export class Generator {
    constructor(store) {
        this.store = store;
        this.constraints = new ShiftConstraints(store);
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

    isOffSym(sym) {
        if (!sym) return false;
        return this.constraints.isOff(sym) || sym === '希' || sym === '欠' || sym === '/';
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
        const { clearUnlocked = true, startDay = 1, endDay = 31 } = options;
        const state = this.store.state;
        const daysInMonth = this.getDaysInMonth(yearMonth);
        const allStaff = state.staff;
        const targetStaff = state.staff.filter(s => !(s.attributes && s.attributes.type === 'helper'));

        const matrix = this.buildInitialMatrix(yearMonth, daysInMonth, allStaff, state.schedule, clearUnlocked);

        const dailySlots = {};
        for (let d = startDay; d <= endDay; d++) {
            const dateStr = this.getDateStr(yearMonth, d);
            const isSat = JapaneseCalendar.isSaturday(dateStr);
            const isSunOrHol = JapaneseCalendar.isSunday(dateStr) || JapaneseCalendar.isHoliday(dateStr);
            const daySettings = this.store.getDaySettings ? this.store.getDaySettings(yearMonth, d) : {};
            dailySlots[d] = this.getRequiredRoutes(state.routes, isSat, isSunOrHol, daySettings.extraRoutes || []);
        }

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
        this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay);
        this.rebalanceCoveredSurplusDays(matrix, allStaff, targetStaff, dailySlots, startDay, endDay, yearMonth);
        this.finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay);

        console.log('[Generator] Applying to Store...');
        this.applyMatrixToSchedule(yearMonth, matrix, state.schedule, allStaff, startDay, endDay);

        return true;
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
                    .sort((a, b) => this.compareSpecialistFirst(a, b, d, matrix, dailySlots[d]));

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

    getScheduleSym(staffId, dateStr) {
        const [y, m, d] = dateStr.split('-');
        return this.store.state.schedule[`${y}-${m}`]?.[staffId]?.[d]?.symbol || null;
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

                if (cell.isSun) {
                    cell.symbol = '週休';
                    cell.type = 'OFF';
                    cell.fixed = true;
                    existingShukyuCount++;
                } else if (cell.isSat) {
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
            let hibanRemaining = hasWeekendWorkOption ? Math.max(0, hibanTarget - existingHibanCount) : 0;
            let shukyuRemaining = hasWeekendWorkOption ? Math.max(0, Math.round(periodLength / 7) - existingShukyuCount) : 0;

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
                        } else if (hibanRemaining > 0) {
                            matrix[s.id][d].symbol = '非番';
                            matrix[s.id][d].type = 'OFF';
                            matrix[s.id][d].fixed = true;
                            hibanRemaining--;
                        }
                    }
                }
            }

            // 1. Place exactly 1 週休 per calendar week
            validWeeks.forEach(weekDays => {
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
            let neededHiban = hasWeekendWorkOption ? Math.max(0, hibanTarget - existingHibanCount) : 0;
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
            : (this.store.state.settings?.maxConsecutiveWork ?? 5);

        // 1. Ensure maximum consecutive explicitly placed work does not exceed staff/global setting.
        let currentWorkStreak = 0;
        let maxStreak = 0;
        for (let d = startDay; d <= endDay; d++) {
            const sym = matrix[staffId][d].symbol;
            if (this.isOffSym(sym) || sym === '祝日' || !sym) {
                currentWorkStreak = 0;
            } else {
                currentWorkStreak++;
                if (currentWorkStreak > maxStreak) maxStreak = currentWorkStreak;
                if (currentWorkStreak > maxConsecutive) return false;
            }
        }

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

        return true;
    }

    respectsMaxConsecutiveWork(matrix, staffId, startDay, endDay) {
        const staff = this.store.state.staff.find(s => String(s.id) === String(staffId));
        const maxConsecutive = this.store.getMaxConsecutiveWork
            ? this.store.getMaxConsecutiveWork(staff)
            : (this.store.state.settings?.maxConsecutiveWork ?? 5);

        let currentWorkStreak = 0;
        for (let d = startDay; d <= endDay; d++) {
            const sym = matrix[staffId][d].symbol;
            if (this.isOffSym(sym) || sym === '祝日' || !sym) {
                currentWorkStreak = 0;
            } else {
                currentWorkStreak++;
                if (currentWorkStreak > maxConsecutive) return false;
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
        missing.sort((a, b) => {
            // Count how many staff CAN fill 'a' vs 'b'
            let capableA = 0;
            let capableB = 0;
            allStaff.forEach(s => {
                const cA = matrix[s.id][a.day];
                if (!cA.symbol || cA.symbol === '祝日') {
                    if (this.canWorkRoute(s, cA, a.routeId)) capableA++;
                }
                const cB = matrix[s.id][b.day];
                if (!cB.symbol || cB.symbol === '祝日') {
                    if (this.canWorkRoute(s, cB, b.routeId)) capableB++;
                }
            });

            // If a route has fewer capable staff, it is HARDER to fill, so prioritize it (sort lower)
            if (capableA !== capableB) {
                return capableA - capableB; 
            }

            // Fallback: weekend priority
            const cellA = matrix[targetStaff[0]?.id]?.[a.day];
            const cellB = matrix[targetStaff[0]?.id]?.[b.day];
            const sumA = cellA?.isSunOrHol ? 20 : cellA?.isSat ? 10 : 0;
            const sumB = cellB?.isSunOrHol ? 20 : cellB?.isSat ? 10 : 0;
            return sumB - sumA;
        });

        // --- PRE-BALANCE: Move Holidays from Deficit Days to Surplus Days ---
        let preBalanceChanged = true;
        let preBalanceLoops = 0;
        while (preBalanceChanged && preBalanceLoops < 100) {
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
                let maxSurp = 0;
                for (let d = startDay; d <= endDay; d++) {
                    if (dailyStats[d] && dailyStats[d].surplus > maxSurp) {
                        bestSurplusDay = d;
                        maxSurp = dailyStats[d].surplus;
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
        while (missing.length > 0 && changed && iterations < 2000) {
            changed = false;
            iterations++;
            const stillMissing = [];

            for (const slot of missing) {
                const directCandidate = [...targetStaff]
                    .sort((a, b) => this.compareSpecialistFirst(a, b, slot.day, matrix, dailySlots[slot.day] || []))
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

                if (this.trySwapRoute(matrix, targetStaff, slot.day, slot.routeId, startDay, endDay)) {
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

    trySwapRoute(matrix, targetStaff, targetDay, targetRoute, startDay, endDay) {
        // We use a Breadth-First Search (BFS) to find an "Augmenting Path" in the bipartite graph of Staff and Routes.
        // This allows chains of arbitrary length: Staff A gives up Route X -> Staff B takes X, gives up Y -> Staff C takes Y, gives up "Free" (祝日).
        const queue = [];
        queue.push({
            routeToFill: targetRoute,
            path: [] // Array of { staff: s, takes: routeToFill, drops: currentRoute }
        });

        const visitedRoutes = new Set([targetRoute]);
        const visitedStaff = new Set();

        while (queue.length > 0) {
            const { routeToFill, path } = queue.shift();

            // Safety limit to prevent runaway BFS. 
            // The user requested extreme depth (10+ steps), so we allow up to 30.
            if (path.length > 30) continue;

            const candidates = [...targetStaff].sort((a, b) => {
                const cellA = matrix[a.id][targetDay];
                const cellB = matrix[b.id][targetDay];
                const totalA = this.getCapabilities(a, cellA.isSat, cellA.isSunOrHol).length;
                const totalB = this.getCapabilities(b, cellB.isSat, cellB.isSunOrHol).length;
                return totalA - totalB;
            });

            for (const s of candidates) {
                if (visitedStaff.has(s.id)) continue;

                const cell = matrix[s.id][targetDay];
                if (cell.locked) continue;

                const currentSym = cell.symbol;

                // Skip if the staff is on a protected holiday, missing, or already on the target route.
                // We only allow "stealing" staff from actual Routes or '祝日' (Free).
                if (!currentSym || this.isOffSym(currentSym) || currentSym === '欠' || currentSym === '／' || currentSym === '希') continue;
                if (currentSym === routeToFill) continue;

                // Can the staff work this route?
                if (!this.canWorkRoute(s, cell, routeToFill)) continue;

                // Will this route break their cross-day resting intervals?
                if (this.wouldBreakIntervals(matrix, s.id, targetDay, routeToFill)) continue;

                if (currentSym === '祝日') {
                    // FOUND A FREE STAFF! This completes the augmenting path.
                    // Let's do a final strict validation just in case.
                    const backupSym = currentSym;
                    matrix[s.id][targetDay].symbol = routeToFill;
                    const isValid = this.validateHolidayRules(matrix, s.id, startDay, endDay);
                    matrix[s.id][targetDay].symbol = backupSym;

                    if (isValid) {
                        const finalPath = [...path, { staff: s, takes: routeToFill, drops: currentSym }];

                        // Apply the entire chain backwards (technically order doesn't matter on a single day since they are distinct staff)
                        for (const move of finalPath) {
                            matrix[move.staff.id][targetDay].symbol = move.takes;
                            matrix[move.staff.id][targetDay].type = 'ROUTE';
                        }
                        return true;
                    }
                } else {
                    // Staff is currently on another route. We queue that route to be filled by someone else!
                    if (!visitedRoutes.has(currentSym)) {
                        visitedRoutes.add(currentSym);
                        visitedStaff.add(s.id);

                        queue.push({
                            routeToFill: currentSym,
                            path: [...path, { staff: s, takes: routeToFill, drops: currentSym }]
                        });
                    }
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

            validRange.sort(() => Math.random() - 0.5);

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
                        .sort((a, b) => this.compareSpecialistFirst(b, a, d, matrix, dailySlots[d] || []));
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
                }).sort((a, b) => this.compareSpecialistFirst(a, b, d, matrix, dailySlots[d] || []));

                if (holidayStaff.length > 0) {
                    const s = holidayStaff[0];
                    matrix[s.id][d].symbol = missingRoute;
                    matrix[s.id][d].type = 'ROUTE';
                }
            });
        }
    }

    finalFillMissingRoutes(matrix, allStaff, targetStaff, dailySlots, startDay, endDay) {
        let changed = true;
        let loops = 0;

        while (changed && loops < 20) {
            changed = false;
            loops++;

            for (let d = startDay; d <= endDay; d++) {
                if (!dailySlots[d]) continue;

                const missingRoutes = [];
                dailySlots[d].forEach(req => {
                    const shortage = req.count - this.countRoute(matrix, allStaff, d, req.id);
                    for (let i = 0; i < shortage; i++) missingRoutes.push(req.id);
                });

                missingRoutes.forEach(routeId => {
                    if (this.countRoute(matrix, allStaff, d, routeId) >= (dailySlots[d].find(req => req.id === routeId)?.count || 0)) {
                        return;
                    }

                    const candidate = [...targetStaff]
                        .sort((a, b) => this.compareSpecialistFirst(a, b, d, matrix, dailySlots[d] || []))
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
                    }
                });
            }
        }
    }

    getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay) {
        const missing = [];
        for (let d = startDay; d <= endDay; d++) {
            if (!dailySlots[d]) continue;
            dailySlots[d].forEach(req => {
                const shortage = req.count - this.countRoute(matrix, allStaff, d, req.id);
                for (let i = 0; i < shortage; i++) missing.push({ day: d, routeId: req.id });
            });
        }
        return missing;
    }

    dayRouteShortage(matrix, allStaff, dailySlots, day) {
        if (!dailySlots[day]) return 0;
        return dailySlots[day].reduce((total, req) => {
            return total + Math.max(0, req.count - this.countRoute(matrix, allStaff, day, req.id));
        }, 0);
    }

    emptyCount(matrix, staffList, day) {
        return staffList.reduce((count, staff) => {
            const sym = matrix[staff.id][day].symbol;
            return count + (!sym || sym === '祝日' ? 1 : 0);
        }, 0);
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

            const missing = this.getMissingRouteSlots(matrix, allStaff, dailySlots, startDay, endDay)
                .sort((a, b) => {
                    const capableA = targetStaff.filter(s => this.canWorkRoute(s, matrix[s.id][a.day], a.routeId)).length;
                    const capableB = targetStaff.filter(s => this.canWorkRoute(s, matrix[s.id][b.day], b.routeId)).length;
                    return capableA - capableB;
                });

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
                    .sort((a, b) => this.compareSpecialistFirst(a, b, slot.day, matrix, dailySlots[slot.day] || []));

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

                    destinationDays.sort((a, b) => this.emptyCount(matrix, allStaff, b) - this.emptyCount(matrix, allStaff, a));

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
