from ortools.sat.python import cp_model
from typing import Dict, Any
from datetime import datetime, timedelta

def run_optimization(request_data: Dict[str, Any]) -> Dict[str, Any]:
    # Parse incoming JSON data
    staff_list = request_data.get('staff', [])
    routes = request_data.get('routes', [])
    days_in_month = request_data.get('daysInMonth', 28)
    day_settings = request_data.get('daySettings', {})
    current_schedule = request_data.get('currentSchedule', {})
    date_labels = request_data.get('dateLabels', {}) # maps "day_index" -> {"isSun", "isSat", "isHol"}
    
    # Define generic off-duty routes, adding '空き' to absorb excess staff capacity
    # Add special UI locked states as valid OFF routes
    OFF_ROUTES = ['週休', '非番', '年休', '祝日', '空き', '希', '欠', '／']
    
    model = cp_model.CpModel()
    
    # ----------------------------------------------------
    # Variables
    # ----------------------------------------------------
    x = {} # x[s, d, r]
    
    num_staff = len(staff_list)
    days = range(1, days_in_month + 1)
    
    # Standard route IDs
    route_ids = [r['id'] for r in routes]
    all_route_ids = route_ids + OFF_ROUTES

    day_meta = {}
    weeks = {}
    for d in days:
        labels = date_labels.get(str(d), {})
        original_date = labels.get("originalDate")
        parsed_date = None
        if original_date:
            try:
                parsed_date = datetime.strptime(original_date, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = None

        if parsed_date:
            # UI/JS weekday convention: Sun=0 ... Sat=6
            day_of_week = (parsed_date.weekday() + 1) % 7
            week_start = parsed_date - timedelta(days=day_of_week)
            weeks.setdefault(week_start.isoformat(), []).append(d)
        else:
            day_of_week = 0 if labels.get("isSun") else 6 if labels.get("isSat") else None

        day_meta[d] = {
            "originalDate": original_date,
            "dayOfWeek": day_of_week,
            "isSat": labels.get("isSat", False),
            "isSun": labels.get("isSun", False),
            "isSunHol": labels.get("isSun", False) or labels.get("isHol", False),
        }

    full_weeks = [sorted(week_days) for week_days in weeks.values() if len(week_days) == 7]

    def required_count_for(route, d):
        required_val = route.get('required', 0)
        meta = day_meta.get(d, {})
        if isinstance(required_val, dict):
            if meta.get("isSunHol"):
                return int(required_val.get('sun', 0))
            if meta.get("isSat"):
                return int(required_val.get('sat', 0))
            return int(required_val.get('weekday', 0))
        return int(required_val)
    
    for s_idx, staff in enumerate(staff_list):
        for d in days:
            for r_id in all_route_ids:
                x[(s_idx, d, r_id)] = model.NewBoolVar(f'x_s{s_idx}_d{d}_r{r_id}')
                
    # ----------------------------------------------------
    # Constraints
    # ----------------------------------------------------
    
    # 1. Exactly one route per day per staff
    for s_idx in range(num_staff):
        for d in days:
            model.AddExactlyOne(x[(s_idx, d, r_id)] for r_id in all_route_ids)
            
    # 2. Staff Capabilities (Skill check)
    for s_idx, staff in enumerate(staff_list):
        for d in days:
            d_str = str(d)
            meta = day_meta.get(d, {})
            is_sat = meta.get("isSat", False)
            is_sun_hol = meta.get("isSunHol", False)
            unavailable_days = set(staff.get('preferredOffDays', []))
            day_of_week = meta.get("dayOfWeek")
            is_locked = current_schedule.get(str(staff.get('id')), {}).get(d_str, {}).get('locked') is True
            
            # Determine which capability array to use
            if is_sun_hol:
                caps = staff.get('sunCapabilities', staff.get('capabilities', []))
            elif is_sat:
                caps = staff.get('satCapabilities', staff.get('capabilities', []))
            else:
                caps = staff.get('weekdayCapabilities', staff.get('capabilities', []))
                
            allowed_routes = set(caps)
            if (not is_locked) and day_of_week in unavailable_days:
                allowed_routes = set()

            required_today = {r['id'] for r in routes if required_count_for(r, d) > 0}
            usable_required_routes = allowed_routes.intersection(required_today)
            if (not is_locked) and (is_sat or meta.get("isSun", False)) and not usable_required_routes:
                # 土日祝に担当可能な必要担務が無い社員は、空欄/空き逃げではなく休みに固定する。
                model.Add(x[(s_idx, d, '空き')] == 0)
                if meta.get("isSun", False):
                    # 日曜に出勤しない場合、その週の休みは日曜の週休として扱う。
                    model.Add(x[(s_idx, d, '週休')] == 1)

            if (not is_locked) and meta.get("isSun", False):
                # 日曜は「出勤する」または「週休」。未ロックの日曜は非番/空きにしない。
                model.Add(x[(s_idx, d, '非番')] == 0)
                model.Add(x[(s_idx, d, '空き')] == 0)
                
            for r_id in route_ids:
                if r_id not in allowed_routes:
                    # If they don't have the skill, force it to 0
                    model.Add(x[(s_idx, d, r_id)] == 0)

    # Slack variables for requirements
    slack_under = {}

    # 3. Requirement Fulfillment (Daily assignments) - SOFT CONSTRAINT via Slack
    for d in days:
        d_str = str(d)
        
        for r in routes:
            r_id = r['id']
            required_count = required_count_for(r, d)
            
            route_sum = sum(x[(s_idx, d, r_id)] for s_idx in range(num_staff))
            
            if required_count == 0:
                model.Add(route_sum == 0)
            else:
                locked_count = 0
                for s in staff_list:
                    s_id = str(s.get('id'))
                    locked_cell = current_schedule.get(s_id, {}).get(d_str, {})
                    if locked_cell.get('locked') is True and locked_cell.get('symbol') == r_id:
                        locked_count += 1

                # 欠員はソフトに許容するが、過剰配置(区の被り)は生成しない。
                # 既にロック済みで過剰な場合だけ、ロック尊重のため上限を広げる。
                model.Add(route_sum <= max(required_count, locked_count))
                slack_under[(d, r_id)] = model.NewIntVar(0, num_staff, f'slack_under_{d}_{r_id}')
                model.Add(route_sum + slack_under[(d, r_id)] >= required_count)

    # 4. Locked Shifts from UI
    # If the user manually locked a shift, force the solver to respect it.
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff['id'])
        if s_id in current_schedule:
            for d_str, cell in current_schedule[s_id].items():
                d = int(d_str)
                if cell.get('locked') is True:
                    symbol = cell.get('symbol')
                    if symbol in all_route_ids:
                        model.Add(x[(s_idx, d, symbol)] == 1)

    # 5. Consecutive Work Limit (Max 5 days) - SOFT CONSTRAINT via slack
    # ハード制約だと「解なし」になりやすいため、違反を許容しつつ目的関数で重くペナルティを課す。
    consec_slack = {}
    for s_idx in range(num_staff):
        attrs = staff_list[s_idx].get('attributes', {})
        max_work = attrs.get('maxConsecutiveWork', 5)
        limit_days = max_work + 1 # e.g. 6 days window

        for start_d in range(1, days_in_month - limit_days + 2):
            window = range(start_d, start_d + limit_days)
            off_shifts = []
            for wd in window:
                for off_r in OFF_ROUTES:
                    off_shifts.append(x[(s_idx, wd, off_r)])

            # slack=1 のとき制約が緩和される（連勤超過を許容）。
            consec_slack[(s_idx, start_d)] = model.NewBoolVar(f'consec_slack_{s_idx}_{start_d}')
            model.Add(sum(off_shifts) + consec_slack[(s_idx, start_d)] >= 1)

    # 6. Weekly rest rules
    # 週休: 完全な日曜〜土曜週ごとにちょうど1回。
    # 非番: 週数分を確保し、各週の±3日範囲に少なくとも1回。同一週3回は禁止。
    for s_idx in range(num_staff):
        if full_weeks:
            model.Add(sum(x[(s_idx, d, '非番')] for d in days) == len(full_weeks))

        for week_days in full_weeks:
            model.Add(sum(x[(s_idx, d, '週休')] for d in week_days) == 1)
            model.Add(sum(x[(s_idx, d, '非番')] for d in week_days) <= 2)

            ext_start = max(1, week_days[0] - 3)
            ext_end = min(days_in_month, week_days[-1] + 3)
            extended_days = range(ext_start, ext_end + 1)
            model.Add(sum(x[(s_idx, d, '非番')] for d in extended_days) >= 1)

    # 8. Prevent solver from inventing 祝日 or 年休 or special UI states
    # Only allow them if the user explicitly locked them in the UI.
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff['id'])
        for d in days:
            is_locked_holiday = False
            is_locked_paid_leave = False
            is_locked_kibou = False
            is_locked_ketsu = False
            is_locked_block = False
            if s_id in current_schedule and str(d) in current_schedule[s_id]:
                cell = current_schedule[s_id][str(d)]
                if cell.get('locked') is True:
                    sym = cell.get('symbol')
                    if sym == '祝日': is_locked_holiday = True
                    elif sym == '年休': is_locked_paid_leave = True
                    elif sym == '希': is_locked_kibou = True
                    elif sym == '欠': is_locked_ketsu = True
                    elif sym == '／': is_locked_block = True
            
            if not is_locked_holiday:
                model.Add(x[(s_idx, d, '祝日')] == 0)
            if not is_locked_paid_leave:
                model.Add(x[(s_idx, d, '年休')] == 0)
            if not is_locked_kibou:
                model.Add(x[(s_idx, d, '希')] == 0)
            if not is_locked_ketsu:
                model.Add(x[(s_idx, d, '欠')] == 0)
            if not is_locked_block:
                model.Add(x[(s_idx, d, '／')] == 0)

    # 9. Workload Balancing (Minimize max work days)
    max_work_days = model.NewIntVar(0, days_in_month, 'max_work_days')
    for s_idx in range(num_staff):
        total_work_days = sum(x[(s_idx, d, r_id)] for d in days for r_id in route_ids)
        model.Add(total_work_days <= max_work_days)

    # ----------------------------------------------------
    # Objective
    # ----------------------------------------------------
    objective_terms = []
    
    # Penalize slacks heavily
    for d in days:
        for r in routes:
            r_id = r['id']
            if (d, r_id) in slack_under:
                objective_terms.append(slack_under[(d, r_id)] * -10000)  # 欠員を最優先で減らす
                
    # 連勤上限のソフト制約違反へのペナルティ。
    # 欠員ペナルティよりは軽く、しかし通常運用では十分に強い重み。
    for key in consec_slack:
        objective_terms.append(consec_slack[key] * -200)   # 連勤超過のペナルティ
    
    # Penalize the maximum work days across all staff to balance the workload
    objective_terms.append(max_work_days * -20)

    # Specialist & Bridge Protection (Past Conversation Rule)
    # 選択肢（スキル）が少ない社員から優先的に埋める（数理的LRVヒューリスティック）
    # We do this by assigning a massive bonus to work shifts inversely proportional to their skill count.
    # We also apply a small penalty if a true 'bridge' staff is used for basic one-sided group tasks.
    max_skills_found = max([len(st.get('weekdayCapabilities', st.get('capabilities', []))) for st in staff_list]) if staff_list else 1
    
    for s_idx, staff in enumerate(staff_list):
        caps = staff.get('weekdayCapabilities', staff.get('capabilities', []))
        choice_count = len(caps)
        
        # 専門スタッフ（選択肢が少ない人）ほど、仕事を割り当てられた時のボーナスが大きくなる
        # これにより、ソルバーは「森山さん（1スキル）」に優先的にその仕事を振るようになる
        # Keep this bonus small so it never outweighs core staffing constraints.
        specialist_bonus = max(0, max_skills_found - choice_count) * 2
        
        knows_g1 = any(r in caps for r in ['1区', '2区', '3区', '4区', '5区', '6区'])
        knows_g2 = any(r in caps for r in ['7区', '8区', '9区', '10区', '11区', '12区', '13区'])
        is_bridge = knows_g1 and knows_g2
        primary_group = staff.get('attributes', {}).get('group', '')
        
        for d in days:
            for r_id in route_ids:
                # 一般的なルート担当時の専門特化ボーナス
                objective_terms.append(x[(s_idx, d, r_id)] * specialist_bonus)
                
                if is_bridge:
                    # 橋渡しスタッフ（虎谷など）はなるべく難しい仕事に残しておくため、
                    # 自分の元の班の単なる基本ルートに使われた場合は軽いペナルティを与える
                    if primary_group == '一斑' and r_id in ['1区', '2区', '3区', '4区', '5区', '6区']:
                        objective_terms.append(x[(s_idx, d, r_id)] * -5)
                    elif primary_group == '二班' and r_id in ['7区', '8区', '9区', '10区', '11区', '12区', '13区']:
                        objective_terms.append(x[(s_idx, d, r_id)] * -5)

    model.Maximize(sum(objective_terms))

    # ----------------------------------------------------
    # Warm-start (solution hints)
    # 既存スケジュール(current_schedule)を初期解のヒントとしてソルバーに与え、
    # 探索を高速化する。ロックの有無にかかわらず有効な記号はヒントにする。
    # ヒントは制約ではないため、矛盾していてもソルバーは無視するだけで安全。
    # ----------------------------------------------------
    hinted = set()
    for s_idx, staff in enumerate(staff_list):
        s_id = str(staff['id'])
        if s_id not in current_schedule:
            continue
        for d_str, cell in current_schedule[s_id].items():
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

    # ----------------------------------------------------
    # Solve
    # ----------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120.0 # 欠員削減を優先して少し長めに探索
    solver.parameters.num_search_workers = 8     # 並列探索でレスポンスを改善

    status = solver.Solve(model)
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        # Build solution matrix
        result_matrix = {}
        for s_idx, staff in enumerate(staff_list):
            s_id = str(staff['id'])
            result_matrix[s_id] = {}
            for d in days:
                for r_id in all_route_ids:
                    if solver.Value(x[(s_idx, d, r_id)]) == 1:
                        # Extract locked status if it was locked
                        is_locked = False
                        if s_id in current_schedule and str(d) in current_schedule[s_id]:
                             if current_schedule[s_id][str(d)].get('locked') is True:
                                 is_locked = True
                        
                        result_matrix[s_id][str(d)] = {
                            "symbol": r_id,
                            "locked": is_locked
                        }
                        break # Optimization: only one route is assigned per day

        unfilled_requirements = []
        for d in days:
            d_str = str(d)
            original_date = day_meta.get(d, {}).get("originalDate")
            if not original_date:
                original_date = date_labels.get(d_str, {}).get("originalDate", d_str)
            for r in routes:
                r_id = r['id']
                required_count = required_count_for(r, d)
                if required_count <= 0:
                    continue
                assigned_count = sum(
                    1 for staff in staff_list
                    if result_matrix[str(staff['id'])][d_str]["symbol"] == r_id
                )
                shortage = required_count - assigned_count
                if shortage > 0:
                    capable_count = 0
                    for staff in staff_list:
                        meta = day_meta.get(d, {})
                        if meta.get("isSunHol"):
                            caps = staff.get('sunCapabilities', staff.get('capabilities', []))
                        elif meta.get("isSat"):
                            caps = staff.get('satCapabilities', staff.get('capabilities', []))
                        else:
                            caps = staff.get('weekdayCapabilities', staff.get('capabilities', []))
                        if r_id in caps:
                            capable_count += 1
                    unfilled_requirements.append({
                        "day": d,
                        "date": original_date,
                        "routeId": r_id,
                        "required": required_count,
                        "assigned": assigned_count,
                        "shortage": shortage,
                        "capableStaff": capable_count
                    })
                        
        return {
            "status": "success",
            "message": "Optimization solved successfully.",
            "matrix": result_matrix,
            "unfilledRequirements": unfilled_requirements,
            "status_code": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        }
    else:
        return {
            "status": "error",
            "message": "Solver could not find a feasible schedule satisfying all constraints. Please relax constraints or resolve conflicts."
        }
