from ortools.sat.python import cp_model
from typing import Dict, Any, List
from datetime import datetime, timedelta
import math


def run_optimization(request_data: Dict[str, Any]) -> Dict[str, Any]:
    staff_list = request_data.get('staff', [])
    routes = request_data.get('routes', [])
    days_in_month = int(request_data.get('daysInMonth', 28))
    current_schedule = request_data.get('currentSchedule', {}) or {}
    date_labels = request_data.get('dateLabels', {}) or {}
    settings = request_data.get('settings', {}) or {}
    generation_mode = request_data.get('generationMode', 'fill') or 'fill'

    # Generic off-duty / UI symbols.  空き is intentionally included so the solver
    # can leave truly unused capacity blank without creating bogus work.
    OFF_ROUTES = ['週休', '非番', '年休', '祝日', '空き', '希', '欠', '／']
    LOCKED_ONLY_OFF_ROUTES = ['年休', '希', '欠', '／']

    model = cp_model.CpModel()

    num_staff = len(staff_list)
    days = range(1, days_in_month + 1)
    route_ids = [r['id'] for r in routes]
    route_by_id = {r['id']: r for r in routes}
    all_route_ids = route_ids + OFF_ROUTES

    # ----------------------------------------------------
    # Date metadata
    # ----------------------------------------------------
    day_meta = {}
    weeks = {}
    for d in days:
        labels = date_labels.get(str(d), {})
        original_date = labels.get('originalDate')
        parsed_date = None
        if original_date:
            try:
                parsed_date = datetime.strptime(original_date, '%Y-%m-%d').date()
            except ValueError:
                parsed_date = None

        if parsed_date:
            # JavaScript convention: Sun=0 ... Sat=6
            day_of_week = (parsed_date.weekday() + 1) % 7
            week_start = parsed_date - timedelta(days=day_of_week)
            weeks.setdefault(week_start.isoformat(), []).append(d)
        else:
            day_of_week = 0 if labels.get('isSun') else 6 if labels.get('isSat') else None

        day_meta[d] = {
            'originalDate': original_date,
            'dayOfWeek': day_of_week,
            'isSat': labels.get('isSat', False),
            'isSun': labels.get('isSun', False),
            'isHol': labels.get('isHol', False),
            'isSunHol': labels.get('isSun', False) or labels.get('isHol', False),
        }

    full_weeks = [sorted(week_days) for week_days in weeks.values() if len(week_days) == 7]
    hiban_weeks = [sorted(week_days) for week_days in weeks.values() if len(week_days) >= 4]

    def required_count_for(route: Dict[str, Any], d: int) -> int:
        required_val = route.get('required', 0)
        meta = day_meta.get(d, {})
        if isinstance(required_val, dict):
            if meta.get('isSunHol'):
                return int(required_val.get('sun', 0) or 0)
            if meta.get('isSat'):
                return int(required_val.get('sat', 0) or 0)
            return int(required_val.get('weekday', 0) or 0)
        return int(required_val or 0)

    def staff_caps_for_day(staff: Dict[str, Any], d: int) -> List[str]:
        meta = day_meta.get(d, {})
        if meta.get('isSunHol'):
            return staff.get('sunCapabilities', staff.get('capabilities', [])) or []
        if meta.get('isSat'):
            return staff.get('satCapabilities', staff.get('capabilities', [])) or []
        return staff.get('weekdayCapabilities', staff.get('capabilities', [])) or staff.get('capabilities', []) or []

    def all_staff_caps(staff: Dict[str, Any]) -> List[str]:
        caps = []
        for key in ('weekdayCapabilities', 'capabilities', 'satCapabilities', 'sunCapabilities'):
            caps.extend(staff.get(key, []) or [])
        return list(dict.fromkeys(caps))

    def requires_weekly_hiban(staff: Dict[str, Any]) -> bool:
        # Keep this aligned with the frontend post-solve validator.  People who
        # only exist for historical imports, or only have office/evening helper
        # duties, should not distort the carrier/off-day rule.
        for route_id in all_staff_caps(staff):
            if (
                route_id.endswith('区')
                or route_id.startswith('混')
                or route_id.startswith('弥彦')
                or route_id.startswith('特')
                or '予備' in route_id
            ):
                return True
        return False

    def has_any_operational_capability(staff: Dict[str, Any]) -> bool:
        return any(cap in route_by_id for cap in all_staff_caps(staff))

    def locked_cell_for(staff: Dict[str, Any], d: int) -> Dict[str, Any]:
        return (current_schedule.get(str(staff.get('id')), {}) or {}).get(str(d), {}) or {}

    # ----------------------------------------------------
    # Variables
    # ----------------------------------------------------
    x = {}
    for s_idx, _staff in enumerate(staff_list):
        for d in days:
            for r_id in all_route_ids:
                x[(s_idx, d, r_id)] = model.NewBoolVar(f'x_s{s_idx}_d{d}_r{r_id}')

    # ----------------------------------------------------
    # Constraints and metric collectors
    # ----------------------------------------------------
    for s_idx in range(num_staff):
        for d in days:
            model.AddExactlyOne(x[(s_idx, d, r_id)] for r_id in all_route_ids)

    illegal_route_terms = []
    sunday_rule_terms = []

    # Staff skill/availability rules.  Capability violations stay soft so that
    # a locked legacy cell can be preserved and diagnosed instead of causing an
    # opaque infeasible result.
    for s_idx, staff in enumerate(staff_list):
        for d in days:
            meta = day_meta.get(d, {})
            is_sat = meta.get('isSat', False)
            day_of_week = meta.get('dayOfWeek')
            unavailable_days = set(staff.get('preferredOffDays', []) or [])
            locked_cell = locked_cell_for(staff, d)
            is_locked = locked_cell.get('locked') is True
            locked_symbol = locked_cell.get('symbol')

            allowed_routes = set(staff_caps_for_day(staff, d))
            if (not is_locked) and day_of_week in unavailable_days:
                allowed_routes = set()

            if (not is_locked) and meta.get('isHol', False):
                # Holidays are either worked or marked as holiday-off.  Do not
                # burn normal weekly rest/non-carrier days on a holiday unless
                # the user locked that symbol manually.
                model.Add(x[(s_idx, d, '祝日')] + sum(x[(s_idx, d, r_id)] for r_id in route_ids) == 1)
                model.Add(x[(s_idx, d, '週休')] == 0)
                model.Add(x[(s_idx, d, '非番')] == 0)
                model.Add(x[(s_idx, d, '空き')] == 0)

            required_today = {r['id'] for r in routes if required_count_for(r, d) > 0}
            usable_required_routes = allowed_routes.intersection(required_today)
            if (not is_locked) and (is_sat or meta.get('isSun', False)) and not meta.get('isHol', False) and not usable_required_routes:
                if meta.get('isSun', False):
                    # If a person has no usable Sunday assignment, treat Sunday
                    # as weekly rest rather than a dangling blank.
                    model.Add(x[(s_idx, d, '週休')] == 1)
                elif is_sat:
                    model.Add(x[(s_idx, d, '非番')] == 1)

            if (not is_locked) and meta.get('isSun', False) and not meta.get('isHol', False):
                sunday_rule_terms.extend([x[(s_idx, d, '非番')], x[(s_idx, d, '空き')]])

            for r_id in route_ids:
                if r_id not in allowed_routes and not (is_locked and locked_symbol == r_id):
                    # Capability / availability is a hard rule: never assign a
                    # route to a staff member who cannot do it on that day
                    # (manually locked cells are the only exception).  Leaving a
                    # route short (欠区) is preferred over an out-of-skill match.
                    model.Add(x[(s_idx, d, r_id)] == 0)
                    illegal_route_terms.append(x[(s_idx, d, r_id)])

    # Route coverage.  Underfill and overfill are soft variables; the staged
    # solve makes underfill the top priority instead of letting rest-rule
    # penalties win over visible route holes.
    slack_under = {}
    slack_over = {}
    for d in days:
        for r in routes:
            r_id = r['id']
            required_count = required_count_for(r, d)
            route_sum = sum(x[(s_idx, d, r_id)] for s_idx in range(num_staff))

            locked_count = 0
            for staff in staff_list:
                cell = locked_cell_for(staff, d)
                if cell.get('locked') is True and cell.get('symbol') == r_id:
                    locked_count += 1

            slack_over[(d, r_id)] = model.NewIntVar(0, num_staff, f'slack_over_{d}_{r_id}')
            if required_count == 0:
                model.Add(route_sum <= locked_count + slack_over[(d, r_id)])
            else:
                model.Add(route_sum <= max(required_count, locked_count) + slack_over[(d, r_id)])
                slack_under[(d, r_id)] = model.NewIntVar(0, num_staff, f'slack_under_{d}_{r_id}')
                model.Add(route_sum + slack_under[(d, r_id)] >= required_count)

    # Locked shifts from UI / payload.  In repair mode the frontend deliberately
    # sends normal existing cells as unlocked hints, so only true locks stay hard.
    for s_idx, staff in enumerate(staff_list):
        for d in days:
            cell = locked_cell_for(staff, d)
            symbol = cell.get('symbol')
            if cell.get('locked') is True and symbol in all_route_ids:
                model.Add(x[(s_idx, d, symbol)] == 1)

    # Consecutive work soft rule.
    consec_slack = []
    for s_idx, staff in enumerate(staff_list):
        global_max = int(settings.get('maxConsecutiveWork', 5) or 5)
        max_work = int((staff.get('attributes', {}) or {}).get('maxConsecutiveWork', global_max) or global_max)
        limit_days = max_work + 1
        if limit_days <= 1 or days_in_month < limit_days:
            continue
        for start_d in range(1, days_in_month - limit_days + 2):
            window = range(start_d, start_d + limit_days)
            slack = model.NewBoolVar(f'consec_slack_{s_idx}_{start_d}')
            model.Add(sum(x[(s_idx, wd, off_r)] for wd in window for off_r in OFF_ROUTES) + slack >= 1)
            consec_slack.append(slack)

    # Weekly rest rules.
    weekly_rule_slacks = []
    min_off_slacks = []
    weekly_shukyu = max(0, int(settings.get('weeklyShukyu', 1) or 1))
    min_off_per_4w = max(0, int(settings.get('minOffPer4Weeks', 8) or 8))
    prorated_min_off = int(math.ceil(min_off_per_4w * days_in_month / 28)) if days_in_month else 0

    for s_idx, staff in enumerate(staff_list):
        active = has_any_operational_capability(staff)
        if not active:
            # Historical/import-only staff should not receive weekly carrier
            # rules.  Other calendar rules (holiday/Sun/Sat defaults) may still
            # assign visible rest symbols, so do not force 空き here.
            continue

        for week_days in full_weeks:
            shukyu_count = sum(x[(s_idx, d, '週休')] for d in week_days)
            shukyu_under = model.NewIntVar(0, len(week_days), f'shukyu_under_{s_idx}_{week_days[0]}')
            shukyu_over = model.NewIntVar(0, len(week_days), f'shukyu_over_{s_idx}_{week_days[0]}')
            model.Add(shukyu_count + shukyu_under == weekly_shukyu + shukyu_over)
            weekly_rule_slacks.extend([shukyu_under, shukyu_over])

            if requires_weekly_hiban(staff):
                hiban_week_count = sum(x[(s_idx, d, '非番')] for d in week_days)
                hiban_week_over = model.NewIntVar(0, len(week_days), f'hiban_week_over_{s_idx}_{week_days[0]}')
                model.Add(hiban_week_count <= 2 + hiban_week_over)
                weekly_rule_slacks.append(hiban_week_over)

        if requires_weekly_hiban(staff):
            for week_days in hiban_weeks:
                ext_start = max(1, week_days[0] - 3)
                ext_end = min(days_in_month, week_days[-1] + 3)
                hiban_ext_under = model.NewIntVar(0, 1, f'hiban_ext_under_{s_idx}_{week_days[0]}')
                model.Add(sum(x[(s_idx, d, '非番')] for d in range(ext_start, ext_end + 1)) + hiban_ext_under >= 1)
                weekly_rule_slacks.append(hiban_ext_under)

        if requires_weekly_hiban(staff) and hiban_weeks:
            hiban_total = sum(x[(s_idx, d, '非番')] for d in days)
            hiban_total_under = model.NewIntVar(0, days_in_month, f'hiban_total_under_{s_idx}')
            hiban_total_over = model.NewIntVar(0, days_in_month, f'hiban_total_over_{s_idx}')
            model.Add(hiban_total + hiban_total_under == len(hiban_weeks) + hiban_total_over)
            weekly_rule_slacks.extend([hiban_total_under, hiban_total_over])

        if prorated_min_off > 0:
            off_count = sum(x[(s_idx, d, r_id)] for d in days for r_id in OFF_ROUTES if r_id != '空き')
            min_off_under = model.NewIntVar(0, days_in_month, f'min_off_under_{s_idx}')
            model.Add(off_count + min_off_under >= prorated_min_off)
            min_off_slacks.append(min_off_under)

    # Do not invent manual-only symbols unless the user locked them. 祝日 can be
    # created automatically on actual holidays; 年休/希/欠/／ never should be.
    for s_idx, staff in enumerate(staff_list):
        for d in days:
            cell = locked_cell_for(staff, d)
            sym = cell.get('symbol') if cell.get('locked') is True else None
            if sym != '祝日' and not day_meta.get(d, {}).get('isHol', False):
                model.Add(x[(s_idx, d, '祝日')] == 0)
            for off_symbol in LOCKED_ONLY_OFF_ROUTES:
                if sym != off_symbol:
                    model.Add(x[(s_idx, d, off_symbol)] == 0)

    # Workload balancing.
    max_work_days = model.NewIntVar(0, days_in_month, 'max_work_days')
    min_work_days = model.NewIntVar(0, days_in_month, 'min_work_days')
    active_work_staff_indexes = [
        s_idx for s_idx, staff in enumerate(staff_list)
        if has_any_operational_capability(staff)
    ]
    for s_idx in active_work_staff_indexes:
        total_work_days = sum(x[(s_idx, d, r_id)] for d in days for r_id in route_ids)
        model.Add(total_work_days <= max_work_days)
        model.Add(total_work_days >= min_work_days)

    # Existing schedule preservation for repair/full modes.  This is the key
    # difference from hard-locking every existing cell: the solver may move a
    # non-locked assignment if that is needed to fill real route holes.
    changed_terms = []
    preserved_terms = []
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff.get('id'))
        row = current_schedule.get(s_id, {}) or {}
        for d_str, cell in row.items():
            try:
                d = int(d_str)
            except (TypeError, ValueError):
                continue
            if d < 1 or d > days_in_month:
                continue
            symbol = cell.get('symbol')
            if symbol not in all_route_ids:
                continue
            if cell.get('locked') is True:
                continue
            changed = model.NewBoolVar(f'changed_{s_idx}_{d}')
            model.Add(x[(s_idx, d, symbol)] + changed == 1)
            changed_terms.append(changed)
            preserved_terms.append(x[(s_idx, d, symbol)])

    total_underfill = sum(slack_under.values()) if slack_under else 0
    total_overfill = sum(slack_over.values()) if slack_over else 0
    total_illegal = sum(illegal_route_terms) if illegal_route_terms else 0
    total_sunday_rule = sum(sunday_rule_terms) if sunday_rule_terms else 0
    total_consecutive = sum(consec_slack) if consec_slack else 0
    total_weekly = sum(weekly_rule_slacks) if weekly_rule_slacks else 0
    total_min_off = sum(min_off_slacks) if min_off_slacks else 0
    total_changed = sum(changed_terms) if changed_terms else 0
    total_preserved = sum(preserved_terms) if preserved_terms else 0
    workload_spread = max_work_days - min_work_days if active_work_staff_indexes else 0

    # Specialist & bridge heuristics.  Keep these strictly below hard business
    # penalties, so they help tie-break instead of deciding to leave holes.
    route_preference_terms = []
    cap_lengths = [len(st.get('weekdayCapabilities', st.get('capabilities', [])) or []) for st in staff_list]
    max_skills_found = max(cap_lengths) if cap_lengths else 1
    for s_idx, staff in enumerate(staff_list):
        weekday_caps = staff.get('weekdayCapabilities', staff.get('capabilities', [])) or []
        choice_count = len(weekday_caps)
        specialist_bonus = max(0, max_skills_found - choice_count) * 20
        if choice_count <= 1:
            specialist_bonus += 500
        elif choice_count == 2:
            specialist_bonus += 200

        knows_g1 = any(r in weekday_caps for r in ['1区', '2区', '3区', '4区', '5区', '6区'])
        knows_g2 = any(r in weekday_caps for r in ['7区', '8区', '9区', '10区', '11区', '12区', '13区'])
        is_bridge = knows_g1 and knows_g2
        primary_group = (staff.get('attributes', {}) or {}).get('group', '')

        for d in days:
            day_caps = set(staff_caps_for_day(staff, d))
            day_choice_count = len(day_caps)
            for r_id in route_ids:
                if r_id in day_caps:
                    day_bonus = specialist_bonus
                    if day_choice_count <= 1:
                        day_bonus += 300
                    route_preference_terms.append(x[(s_idx, d, r_id)] * day_bonus)
                if is_bridge:
                    if primary_group == '一斑' and r_id in ['1区', '2区', '3区', '4区', '5区', '6区']:
                        route_preference_terms.append(x[(s_idx, d, r_id)] * -5)
                    elif primary_group == '二班' and r_id in ['7区', '8区', '9区', '10区', '11区', '12区', '13区']:
                        route_preference_terms.append(x[(s_idx, d, r_id)] * -5)

    # Warm-start hints from the visible schedule.  They are intentionally not
    # hard constraints; non-locked cells can be moved by repair optimization.
    hinted = set()
    for s_idx, staff in enumerate(staff_list):
        row = current_schedule.get(str(staff.get('id')), {}) or {}
        for d_str, cell in row.items():
            try:
                d = int(d_str)
            except (TypeError, ValueError):
                continue
            if d < 1 or d > days_in_month:
                continue
            symbol = cell.get('symbol')
            if symbol in all_route_ids and (s_idx, d) not in hinted:
                model.AddHint(x[(s_idx, d, symbol)], 1)
                hinted.add((s_idx, d))

    def new_solver() -> cp_model.CpSolver:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(settings.get('solverTimeLimitSeconds', 120) or 120)
        solver.parameters.num_search_workers = int(settings.get('solverWorkers', 8) or 8)
        return solver

    def is_solved(status: int) -> bool:
        return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # ----------------------------------------------------
    # Staged optimization
    # ----------------------------------------------------
    phase_results = []

    # Phase 1: hard-business cleanliness before coverage.
    # Missing routes are acceptable operationally (欠区/計画などで手動対応),
    # but overfill / Sunday-rule leakage / hard-locked legacy skill conflicts
    # should be minimized first.
    solver = new_solver()
    severe_violation_score = (
        total_illegal * 100000
        + total_overfill * 80000
        + total_sunday_rule * 20000
    )
    model.Minimize(severe_violation_score)
    status = solver.Solve(model)
    if not is_solved(status):
        return {
            'status': 'error',
            'message': 'Solver could not find a feasible assignment for the hard-locked cells. Please unlock conflicting cells or relax fixed absences.',
            'status_code': solver.StatusName(status),
            'generationMode': generation_mode,
        }
    best_severe = int(solver.Value(severe_violation_score))
    phase_results.append({'phase': 'minimize_severe_violations', 'status': solver.StatusName(status), 'score': best_severe})
    model.Add(severe_violation_score == best_severe)

    # Phase 2: rest count and consecutive work rules are absolute operational
    # priorities.  Prefer leaving a route missing over breaking required rest,
    # overusing a person, or assigning out-of-pattern hiban/shukyu.
    solver = new_solver()
    model.ClearObjective()
    rest_violation_score = (
        total_weekly * 10000
        + total_min_off * 6000
        + total_consecutive * 3000
    )
    model.Minimize(rest_violation_score)
    status = solver.Solve(model)
    if not is_solved(status):
        return {
            'status': 'error',
            'message': 'Solver minimized severe violations but could not optimize rest rules.',
            'status_code': solver.StatusName(status),
            'generationMode': generation_mode,
        }
    best_rest = int(solver.Value(rest_violation_score))
    phase_results.append({'phase': 'minimize_rest_violations', 'status': solver.StatusName(status), 'score': best_rest})
    model.Add(rest_violation_score == best_rest)

    # Phase 3: now reduce visible missing routes as much as possible.  Remaining
    # underfill is handed back to the user for manual 欠区 / 計画 / no-assignment
    # decisions; the solver must not invent 年休 or 欠区 placeholders.
    solver = new_solver()
    model.ClearObjective()
    model.Minimize(total_underfill)
    status = solver.Solve(model)
    if not is_solved(status):
        return {
            'status': 'error',
            'message': 'Solver kept rest rules but could not minimize missing routes.',
            'status_code': solver.StatusName(status),
            'generationMode': generation_mode,
        }
    best_underfill = int(solver.Value(total_underfill)) if slack_under else 0
    phase_results.append({'phase': 'minimize_underfill', 'status': solver.StatusName(status), 'underfill': best_underfill})
    model.Add(total_underfill == best_underfill)

    # Phase 4: tie-break only.  Preserve existing cells and improve balance
    # without changing the above priorities.
    solver = new_solver()
    model.ClearObjective()
    if generation_mode == 'repair':
        change_weight = 120
    elif generation_mode == 'fill':
        change_weight = 300
    else:
        change_weight = 20
    final_score = (
        total_changed * change_weight
        + workload_spread * 20
        + max_work_days * 5
        - sum(route_preference_terms)
        - total_preserved * 2
    )
    model.Minimize(final_score)
    status = solver.Solve(model)
    if not is_solved(status):
        return {
            'status': 'error',
            'message': 'Solver found a valid priority level but failed during final tie-breaking.',
            'status_code': solver.StatusName(status),
            'generationMode': generation_mode,
        }
    phase_results.append({'phase': 'minimize_changes_and_balance', 'status': solver.StatusName(status)})

    # ----------------------------------------------------
    # Build response and diagnostics
    # ----------------------------------------------------
    result_matrix = {}
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff.get('id'))
        result_matrix[s_id] = {}
        for d in days:
            for r_id in all_route_ids:
                if solver.Value(x[(s_idx, d, r_id)]) == 1:
                    original_cell = locked_cell_for(staff, d)
                    result_matrix[s_id][str(d)] = {
                        'symbol': r_id,
                        'locked': original_cell.get('locked') is True,
                    }
                    break

    def solver_value(expr) -> int:
        return int(expr) if isinstance(expr, int) else int(solver.Value(expr))

    unfilled_requirements = []
    overfilled_requirements = []
    for d in days:
        d_str = str(d)
        original_date = day_meta.get(d, {}).get('originalDate') or date_labels.get(d_str, {}).get('originalDate', d_str)
        for r in routes:
            r_id = r['id']
            required_count = required_count_for(r, d)
            assigned_staff = [
                str(staff.get('id')) for staff in staff_list
                if result_matrix[str(staff.get('id'))][d_str]['symbol'] == r_id
            ]
            assigned_count = len(assigned_staff)
            locked_count = sum(
                1 for staff in staff_list
                if locked_cell_for(staff, d).get('locked') is True and locked_cell_for(staff, d).get('symbol') == r_id
            )
            if required_count > 0 and assigned_count < required_count:
                capable = []
                locked_away = []
                for staff in staff_list:
                    staff_id = str(staff.get('id'))
                    if r_id in staff_caps_for_day(staff, d):
                        capable.append(staff_id)
                        cell = locked_cell_for(staff, d)
                        if cell.get('locked') is True and cell.get('symbol') != r_id:
                            locked_away.append(staff_id)
                unfilled_requirements.append({
                    'day': d,
                    'date': original_date,
                    'routeId': r_id,
                    'required': required_count,
                    'assigned': assigned_count,
                    'shortage': required_count - assigned_count,
                    'capableStaff': len(capable),
                    'lockedAwayCapableStaff': len(locked_away),
                })
            allowed_count = max(required_count, locked_count)
            if assigned_count > allowed_count:
                overfilled_requirements.append({
                    'day': d,
                    'date': original_date,
                    'routeId': r_id,
                    'required': required_count,
                    'assigned': assigned_count,
                    'lockedAllowed': locked_count,
                    'surplus': assigned_count - allowed_count,
                })

    changed_cells = []
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff.get('id'))
        row = current_schedule.get(s_id, {}) or {}
        for d_str, cell in row.items():
            try:
                d = int(d_str)
            except (TypeError, ValueError):
                continue
            if d < 1 or d > days_in_month:
                continue
            old_symbol = cell.get('symbol')
            new_symbol = result_matrix.get(s_id, {}).get(str(d), {}).get('symbol')
            if old_symbol in all_route_ids and new_symbol in all_route_ids and old_symbol != new_symbol:
                changed_cells.append({
                    'staffId': s_id,
                    'day': d,
                    'date': day_meta.get(d, {}).get('originalDate') or str(d),
                    'from': old_symbol,
                    'to': new_symbol,
                })

    metrics = {
        'underfill': solver_value(total_underfill),
        'overfill': solver_value(total_overfill),
        'illegalAssignments': solver_value(total_illegal),
        'sundayRuleViolations': solver_value(total_sunday_rule),
        'weeklyRestViolations': solver_value(total_weekly),
        'minOffViolations': solver_value(total_min_off),
        'consecutiveViolations': solver_value(total_consecutive),
        'changedCells': len(changed_cells),
        'maxWorkDays': solver.Value(max_work_days),
        'minWorkDays': solver.Value(min_work_days) if active_work_staff_indexes else 0,
    }

    return {
        'status': 'success',
        'message': 'Optimization solved successfully.',
        'matrix': result_matrix,
        'unfilledRequirements': unfilled_requirements,
        'overfilledRequirements': overfilled_requirements,
        'changedCells': changed_cells,
        'metrics': metrics,
        'diagnostics': {
            'generationMode': generation_mode,
            'phases': phase_results,
            'hintedCells': len(hinted),
        },
        'status_code': solver.StatusName(status),
    }
