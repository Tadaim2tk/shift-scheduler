from ortools.sat.python import cp_model
from typing import Dict, Any

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
            labels = date_labels.get(d_str, {"isSun": False, "isSat": False, "isHol": False})
            is_sat = labels.get("isSat", False)
            is_sun_hol = labels.get("isSun", False) or labels.get("isHol", False)
            
            # Determine which capability array to use
            if is_sun_hol:
                caps = staff.get('sunCapabilities', staff.get('capabilities', []))
            elif is_sat:
                caps = staff.get('satCapabilities', staff.get('capabilities', []))
            else:
                caps = staff.get('weekdayCapabilities', staff.get('capabilities', []))
                
            allowed_routes = set(caps)
                
            for r_id in route_ids:
                if r_id not in allowed_routes:
                    # If they don't have the skill, force it to 0
                    model.Add(x[(s_idx, d, r_id)] == 0)

    # Slack variables for requirements
    slack_under = {}
    slack_over = {}

    # 3. Requirement Fulfillment (Daily assignments) - SOFT CONSTRAINT via Slack
    for d in days:
        d_str = str(d)
        labels = date_labels.get(d_str, {"isSun": False, "isSat": False, "isHol": False})
        is_sat = labels.get("isSat", False)
        is_sun_hol = labels.get("isSun", False) or labels.get("isHol", False)
        
        for r in routes:
            r_id = r['id']
            required_val = r.get('required', 0)
            
            if isinstance(required_val, dict):
                if is_sun_hol:
                    required_count = int(required_val.get('sun', 0))
                elif is_sat:
                    required_count = int(required_val.get('sat', 0))
                else:
                    required_count = int(required_val.get('weekday', 0))
            else:
                required_count = int(required_val)
            
            route_sum = sum(x[(s_idx, d, r_id)] for s_idx in range(num_staff))
            
            if required_count == 0:
                model.Add(route_sum == 0)
            else:
                # 穴埋めをスラック変数を使ったソフト制約に変更
                slack_under[(d, r_id)] = model.NewIntVar(0, num_staff, f'slack_under_{d}_{r_id}')
                slack_over[(d, r_id)] = model.NewIntVar(0, num_staff, f'slack_over_{d}_{r_id}')
                # OR-Tools limitation: avoid subtraction. Use addition on both sides.
                model.Add(route_sum + slack_under[(d, r_id)] == required_count + slack_over[(d, r_id)])

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

    # 6. Weekly Rest Requirement (1 週休 per week) - SOFT CONSTRAINT via slack
    sundays = [d for d in days if date_labels.get(str(d), {}).get("isSun", False)]
    rest_slack = {}
    for s_idx in range(num_staff):
        for sun_d in sundays:
            week_days = [d for d in range(sun_d, sun_d + 7) if d <= days_in_month]
            if len(week_days) == 7:
                rest_slack[(s_idx, sun_d)] = model.NewBoolVar(f'rest_slack_{s_idx}_{sun_d}')
                model.Add(sum(x[(s_idx, d, '週休')] for d in week_days) + rest_slack[(s_idx, sun_d)] >= 1)

    # 7. Total Holiday Counts - SOFT CONSTRAINT via Slack
    shukyu_slack_under = {}
    shukyu_slack_over = {}
    hiban_slack_under = {}
    hiban_slack_over = {}
    
    for s_idx in range(num_staff):
        shukyu_slack_under[s_idx] = model.NewIntVar(0, 31, f'shukyu_under_{s_idx}')
        shukyu_slack_over[s_idx] = model.NewIntVar(0, 31, f'shukyu_over_{s_idx}')
        # Usually 4 shukyu in a 28 day period. Scale proportionally based on days_in_month.
        shukyu_target = round(days_in_month / 7)
        # Avoid subtraction: Variable + Under == Target + Over
        model.Add(sum(x[(s_idx, d, '週休')] for d in days) + shukyu_slack_under[s_idx] == shukyu_target + shukyu_slack_over[s_idx])
        
        hiban_slack_under[s_idx] = model.NewIntVar(0, 31, f'hiban_under_{s_idx}')
        hiban_slack_over[s_idx] = model.NewIntVar(0, 31, f'hiban_over_{s_idx}')
        hiban_target = round(days_in_month / 7)
        model.Add(sum(x[(s_idx, d, '非番')] for d in days) + hiban_slack_under[s_idx] == hiban_target + hiban_slack_over[s_idx])

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
                objective_terms.append(slack_under[(d, r_id)] * -500)  # Massive penalty for missing a shift
            if (d, r_id) in slack_over:
                objective_terms.append(slack_over[(d, r_id)] * -300)   # Big penalty for overstaffing a shift
                
    for s_idx in range(num_staff):
        objective_terms.append(shukyu_slack_under[s_idx] * -100)
        objective_terms.append(shukyu_slack_over[s_idx] * -5)   # Small penalty for extra shukyu to prefer '空き'
        objective_terms.append(hiban_slack_under[s_idx] * -100)
        objective_terms.append(hiban_slack_over[s_idx] * -5)    # Small penalty for extra hiban to prefer '空き'

    # 連勤上限・週休のソフト制約違反へのペナルティ。
    # 必須シフト欠員(-500)よりは軽く、しかし通常運用では十分に強い重み。
    for key in consec_slack:
        objective_terms.append(consec_slack[key] * -200)   # 連勤超過のペナルティ
    for key in rest_slack:
        objective_terms.append(rest_slack[key] * -150)     # 週休未取得のペナルティ
    
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
        # Multiplier reduced to 2 to prevent bonus from exceeding the slack_over penalty (300)
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
    solver.parameters.max_time_in_seconds = 60.0 # 60 sec timeout
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
                        
        return {
            "status": "success",
            "message": "Optimization solved successfully.",
            "matrix": result_matrix,
            "status_code": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        }
    else:
        return {
            "status": "error",
            "message": "Solver could not find a feasible schedule satisfying all constraints. Please relax constraints or resolve conflicts."
        }
