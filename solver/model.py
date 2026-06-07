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
    OFF_ROUTES = ['週休', '非番', '年休', '祝日', '空き']
    
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

    # 5. Consecutive Work Limit (Max 5 days) - HARD CONSTRAINT
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
                    
            model.Add(sum(off_shifts) >= 1)

    # 6. Weekly Rest Requirement (1 週休 per week) - HARD CONSTRAINT
    sundays = [d for d in days if date_labels.get(str(d), {}).get("isSun", False)]
    for s_idx in range(num_staff):
        for sun_d in sundays:
            week_days = [d for d in range(sun_d, sun_d + 7) if d <= days_in_month]
            if len(week_days) == 7:
                model.Add(sum(x[(s_idx, d, '週休')] for d in week_days) >= 1)

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
        objective_terms.append(shukyu_slack_over[s_idx] * -100)
        objective_terms.append(hiban_slack_under[s_idx] * -100)
        objective_terms.append(hiban_slack_over[s_idx] * -100)
    
    # Minimize explicit empty assignments to keep schedule dense
    total_empty = sum(x[(s, d, '空き')] for s in range(num_staff) for d in days)
    objective_terms.append(total_empty * -5)

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
    # Solve
    # ----------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0 # 60 sec timeout
    
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
