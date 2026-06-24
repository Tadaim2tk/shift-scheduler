import { Utils } from '../utils/utils.js';
import { Generator } from '../utils/generator.js';
import { Exporter } from '../utils/exporter.js';
import { JapaneseCalendar } from '../utils/holidays.js';

export class EditorView {
  constructor() {
    this.store = window.app.store;
    this.generator = new Generator(this.store);
    this.currentStartDate = Utils.getCurrentStartDate();
    this.periodDays = Utils.getCurrentPeriodDays();
    // Keep currentYM for internal ref or title only, but logic drives from start date
    // Or just derive it.
  }

  refresh() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(this.render());
    this.onMount();
  }

  // 矢印ナビ：現在の期間日数ぶんだけ前後にずらす（任意期間でも「次の区間」を表示）。
  shiftRange(deltaDays) {
    const [y, m, d] = this.currentStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + deltaDays);
    this.currentStartDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    Utils.saveCurrentStartDate(this.currentStartDate);
    this.refresh();
  }

  prevMonth() {
    this.shiftRange(-this.periodDays);
  }

  nextMonth() {
    this.shiftRange(this.periodDays);
  }

  // 起点・終点を任意の区間に変更する。終点は含む（inclusive）。
  setCustomRange(startStr, endStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      alert('日付の形式が不正です。');
      return;
    }
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const days = Math.round((end - start) / 86400000) + 1;
    if (days < 1) {
      alert('終了日は開始日以降にしてください。');
      return;
    }
    if (days > Utils.MAX_PERIOD_DAYS) {
      alert(`期間が長すぎます（最大 ${Utils.MAX_PERIOD_DAYS} 日）。`);
      return;
    }
    this.currentStartDate = startStr;
    this.periodDays = days;
    Utils.saveCurrentStartDate(startStr);
    Utils.saveCurrentPeriodDays(days);
    this.refresh();
  }
  getVisibleRangeInfo() {
    const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const ranges = {}; // ym -> {min, max}

    for (let i = 0; i < this.periodDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const ym = `${y}-${String(m).padStart(2, '0')}`;

      if (!ranges[ym]) ranges[ym] = { min: 32, max: 0 };
      if (day < ranges[ym].min) ranges[ym].min = day;
      if (day > ranges[ym].max) ranges[ym].max = day;
    }

    return Object.keys(ranges).map(ym => ({
      ym,
      startDay: ranges[ym].min,
      endDay: ranges[ym].max
    }));
  }

  render() {
    try {
      const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
      const startDate = new Date(sy, sm - 1, sd);

      // Calculate End Date for display (期間日数ぶん先 - 1, inclusive)
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (this.periodDays - 1));
      const endY = endDate.getFullYear();
      const endM = endDate.getMonth() + 1;
      const endD = endDate.getDate();

      const startISO = `${sy}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
      const endISO = `${endY}-${String(endM).padStart(2, '0')}-${String(endD).padStart(2, '0')}`;
      const rangeTitle = `${startISO} ～ ${endISO}（${this.periodDays}日）`;

      // Build columns for the selected period
      const columns = [];
      for (let i = 0; i < this.periodDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const ym = `${y}-${String(m).padStart(2, '0')}`;
        columns.push({
          year: y, month: m, day: day,
          ym: ym,
          dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        });
      }

      // Fetch Data
      const uniqueYMs = [...new Set(columns.map(c => c.ym))];
      const schedules = {};
      uniqueYMs.forEach(ym => {
        schedules[ym] = this.store.getSchedule(ym) || {};
      });

      const staffList = this.store.state.staff;
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

      // Header Row HTML
      const headerRow = columns.map(col => {
        const dateObj = new Date(col.year, col.month - 1, col.day);
        const dayOfWeek = dateObj.getDay();
        let bgStyle = '';
        const isHol = JapaneseCalendar.isHoliday(col.dateStr);
        if (dayOfWeek === 0 || isHol) bgStyle = 'background-color: #3d1a1a; color: #ffcccc;';
        else if (dayOfWeek === 6) bgStyle = 'background-color: #1a2333; color: #cce5ff;';

        // Day Settings (Monday Augmentation)
        const daySettings = this.store.getDaySettings(col.ym, col.day);
        const hasExtras = daySettings.extraRoutes && daySettings.extraRoutes.length > 0;
        const indicator = hasExtras ? '<span style="color:#4caf50; font-weight:bold; margin-left:4px;">+</span>' : '';

        return `<th class="date-header" data-ym="${col.ym}" data-day="${col.day}" style="${bgStyle} cursor:pointer;" title="Click to add extra routes">
                  ${col.month}/${col.day}<br><small>(${dayNames[dayOfWeek]})</small>${indicator}
                </th>`;
      }).join('');

      // Body Rows HTML
      const bodyRows = staffList.map((s, sIdx) => {
        const cells = columns.map((col, dIdx) => {
          const activeSchedule = schedules[col.ym] || {};
          const staffSchedule = activeSchedule[s.id] || {};
          const cell = staffSchedule[String(col.day).padStart(2, '0')] || {};

          const val = cell.symbol || '';
          const locked = cell.locked || false;
          let bg = this.getSymbolColor(val);
          if (val === '／') {
            bg = 'repeating-linear-gradient(45deg, #444, #444 5px, #555 5px, #555 10px)';
          }

          let displayVal = val;
          const routeObj = this.store.state.routes.find(r => r.id === val);
          if (routeObj) displayVal = routeObj.name;

          const dateStr = `${col.year}-${String(col.month).padStart(2, '0')}-${String(col.day).padStart(2, '0')}`;

          return `<td class="cell" 
                    data-staff="${s.id}" 
                    data-day="${col.day}"
                    data-ym="${col.ym}"
                    data-date="${dateStr}"
                    data-row="${sIdx}"
                    data-col="${dIdx}"
                    style="background: ${bg || this.getDayBackgroundColor(col.ym, col.day)}; cursor: pointer; position: relative; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 2px;">
                    <span style="mix-blend-mode: difference; color: white; opacity: 0.9; font-weight: 500;">${displayVal}</span>
                    ${locked ? '<span style="position:absolute; top:2px; right:2px; font-size:0.6em; opacity:0.7;">🔒</span>' : ''}
                  </td>`;
        }).join('');

        return `<tr><td class="sticky-col name-col">${s.name}</td>${cells}</tr>`;
      }).join('');

      // Footer: Missing Row
      const missingCells = columns.map(col => {
        const isSat = JapaneseCalendar.isSaturday(col.dateStr);
        const isSun = JapaneseCalendar.isSunday(col.dateStr);
        const isHol = JapaneseCalendar.isHoliday(col.dateStr);
        const isSunOrHol = isSun || isHol;

        let reqs = [];
        this.store.state.routes.forEach(r => {
            let count = 0;
            if (isSunOrHol) count = r.required?.sun ?? (typeof r.required === 'number' ? r.required : 0);
            else if (isSat) count = r.required?.sat ?? (typeof r.required === 'number' ? r.required : 0);
            else count = r.required?.weekday ?? (typeof r.required === 'number' ? r.required : 0);
            if (count > 0) reqs.push({ id: r.id, count });
        });

        // Add Daily Overrides (Monday Augmentation)
        const daySettings = this.store.getDaySettings(col.ym, col.day);
        if (daySettings.extraRoutes) {
          daySettings.extraRoutes.forEach(routeId => {
            const existing = reqs.find(r => r.id === routeId);
            if (existing) existing.count++;
            else reqs.push({ id: routeId, count: 1 });
          });
        }

        const missingList = [];
        const activeSchedule = schedules[col.ym] || {};

        reqs.forEach(r => {
          let count = 0;
          staffList.forEach(s => {
            const staffSch = activeSchedule[s.id] || {};
            const cell = staffSch[String(col.day).padStart(2, '0')];
            if (!cell) return;
            if (cell.symbol === r.id) count++;
            if (r.id === '1班予備' && cell.symbol === '1予備') count++;
            if (r.id === '2班予備' && cell.symbol === '2予備') count++;
            if (r.id === '夕方区分' && cell.symbol === '夕方') count++;
            if (r.id.startsWith('混遅') && cell.symbol === '混中') count++;
          });
          if (count < r.count) {
            missingList.push(`${r.id}${r.count > 1 ? `(${r.count - count})` : ''}`);
          }
        });

        if (missingList.length === 0) return '<td></td>';
        return `<td style="background:#2d0a0a; color:#ffaaaa; font-size:0.75em; vertical-align:top;">${missingList.join('<br>')}</td>`;
      }).join('');

      // Footer: Empty Row
      const emptyCells = columns.map(col => {
        const activeSchedule = schedules[col.ym] || {};
        let emptyCount = 0;
        staffList.forEach(s => {
          const staffSch = activeSchedule[s.id] || {};
          const cell = staffSch[String(col.day).padStart(2, '0')];
          if (!cell || !cell.symbol) emptyCount++;
        });
        return `<td style="text-align:center; color:#aaffaa; font-weight:bold;">${emptyCount}</td>`;
      }).join('');

      // Footer: Surplus Row
      const surplusCells = columns.map(col => {
        const activeSchedule = schedules[col.ym] || {};
        let emptyCount = 0;
        staffList.forEach(s => {
          const staffSch = activeSchedule[s.id] || {};
          const cell = staffSch[String(col.day).padStart(2, '0')];
          if (!cell || !cell.symbol) emptyCount++;
        });

        if (emptyCount > 0) return '<td></td>';

        const symbolMap = {};
        staffList.forEach(s => {
          const staffSch = activeSchedule[s.id] || {};
          const cell = staffSch[String(col.day).padStart(2, '0')];
          if (cell && cell.symbol) {
            const sym = cell.symbol;
            const symbolDef = this.store.state.symbols.find(x => x.symbol === sym);
            if (symbolDef && (symbolDef.type === 'OFF' || symbolDef.type === 'BLOCKED')) return;
            if (!symbolMap[sym]) symbolMap[sym] = 0;
            symbolMap[sym]++;
          }
        });

        let duplicateCount = 0;
        Object.keys(symbolMap).forEach(key => {
          const limit = this.getRequiredCountForRoute(key, col.dateStr, col.ym, col.day);
          if (symbolMap[key] > limit) {
            duplicateCount += (symbolMap[key] - limit);
          }
        });

        if (duplicateCount > 0) {
          return `<td style="text-align:center; color:#ffcc99; font-weight:bold;">${duplicateCount}</td>`;
        }
        return '<td></td>';
      }).join('');

      const div = document.createElement('div');
      div.id = 'editor-view-root'; // UNIQUE ID ASSIGNED HERE
      div.className = 'container';
      div.style.padding = '10px';

      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <div style="display:flex; gap:10px; align-items:center;">
             <button id="btn-home" class="outline">← ホーム</button>
             <div class="calendar-nav">
                <button id="btn-prev-month">◀</button>
                <span id="current-month-display" style="font-size:1.2em; font-weight:bold; min-width:260px; text-align:center;">
                   ${rangeTitle}
                </span>
                <button id="btn-next-month">▶</button>
             </div>
             <div class="range-editor" style="display:flex; gap:6px; align-items:center; font-size:0.85em;">
                <input type="date" id="range-start" value="${startISO}" style="padding:4px;">
                <span>〜</span>
                <input type="date" id="range-end" value="${endISO}" style="padding:4px;">
                <button id="btn-apply-range" class="small">期間を適用</button>
             </div>
          </div>
          <div style="display:flex; gap:10px;">
            <button id="btn-clear" class="danger outline">すべてクリア</button>
            <div class="button-group">
              <!-- Valid IDs: btn-auto-fill, btn-auto-repair, btn-auto-full -->
              <button id="btn-auto-fill" title="手動入力を保持して空き枠を埋める">✨ 空き枠を自動入力</button>
              <button id="btn-auto-repair" class="outline" title="ロック以外の既存配置を必要最小限だけ動かして欠員を解消">🔧 自動リペア</button>
              <button id="btn-auto-full" class="warning" title="ロックされていないセルをクリアして全体を再構築">🔒 リセット＆再構築</button>
            </div>
            <button id="btn-pdf-export" class="outline">📄 PDF出力</button>
            <button id="btn-save" class="primary">保存</button>
          </div>
        </div>

        <div id="validation-errors" style="display:none; background: #522; color: #fbb; padding: 10px; margin-bottom: 1rem; border-radius: 4px;"></div>

        <div class="card" style="overflow: auto; max-height: 85vh; border: 1px solid #444; padding: 0;">
             <!-- Day Settings Modal (Hidden) -->
             <div id="day-settings-modal" class="hidden" style="position:fixed; z-index:1010; top:50%; left:50%; transform:translate(-50%, -50%); background:#333; border:1px solid #555; padding:20px; border-radius:8px; min-width: 300px; color:#ddd;">
                <h3 id="day-modal-title" style="margin-top:0; color:#fff; border-bottom:1px solid #555; padding-bottom:10px;">日別設定</h3>
                <div style="margin: 15px 0; display:flex; flex-direction:column; gap:10px;">
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-1yobi"> 1班予備</label>
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-2yobi"> 2班予備</label>
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-yahiko"> 弥彦予備</label>
                </div>
                <div style="text-align:right; gap:10px;">
                    <button id="day-modal-cancel" class="small outline" style="margin-right:8px;">キャンセル</button>
                    <button id="day-modal-save" class="small primary">保存</button>
                </div>
            </div>

            <!-- Picker Modal logic is handled by event listeners, element created here -->
             <div id="picker-modal" class="hidden" style="position:fixed; z-index:1000; background:rgba(45, 45, 45, 0.95); border:1px solid #444; padding:10px; border-radius:6px; max-width: 340px;">
                 <div class="picker-header" style="display:flex; justify-content:space-between; margin-bottom:5px; color:#aaa;">
                    <span>選択中: <span id="picker-count" style="color:white;">1</span> セル</span>
                    <label><input type="checkbox" id="picker-lock"> 🔒 固定</label>
                 </div>
                 <div id="picker-content" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
                 <div style="text-align:right; margin-top:8px;"><button class="small outline" id="picker-close">閉じる</button></div>
             </div>
             
             <!-- Confirm Modal -->
             <div id="confirm-modal" class="hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:2000; display:flex; justify-content:center; align-items:center;">
                 <div class="card" style="min-width:300px; text-align:center;">
                     <h3>クリアの確認</h3>
                     <p style="margin-bottom:1.5rem;">スケジュール全体をクリアしてもよろしいですか？</p>
                     <div class="flex justify-between">
                         <button id="confirm-no" class="outline">キャンセル</button>
                         <button id="confirm-yes" class="danger">すべてクリア</button>
                     </div>
                 </div>
            </div>

            <table class="schedule-table">
              <thead>
                <tr><th class="sticky-col">Name</th>${headerRow}</tr>
              </thead>
              <tbody id="schedule-body">
                ${bodyRows}
              </tbody>
              <tfoot style="border-top: 3px double #666;">
                 <tr><td class="sticky-col" style="background:#222; font-weight:bold; color:#ff9999;">Missing</td>${missingCells}</tr>
                 <tr><td class="sticky-col" style="background:#222; font-weight:bold; color:#aaffaa;">空き</td>${emptyCells}</tr>
                 <tr><td class="sticky-col" style="background:#222; font-weight:bold; color:#ffcc99;">余剰</td>${surplusCells}</tr>
              </tfoot>
            </table>
        </div>
      `;
      return div;

    } catch (e) {
      alert('Render Error: ' + e.message + '\\n' + e.stack);
      console.error(e);
      return document.createElement('div');
    }
  }

  getSymbolColor(symbol) {
    if (!symbol) return 'transparent';
    if (symbol === '祝日') return '#ffaaaa';
    const s = this.store.state.symbols.find(sym => sym.symbol === symbol);
    return s ? s.color : 'transparent';
  }

  getDayBackgroundColor(ym, day) {
    const [y, m] = ym.split('-').map(Number);
    const dateObj = new Date(y, m - 1, day);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0) return '#3d1a1a'; // Sunday Red
    if (dayOfWeek === 6) return '#1a2333'; // Saturday Blue
    return 'transparent';
  }

  onMount() {
    // Wait for DOM
    requestAnimationFrame(() => this._initListeners());
  }

  _initListeners() {
    const container = document.getElementById('editor-view-root');
    if (!container) {
      console.warn('Editor view root not found, retrying...');
      setTimeout(() => this._initListeners(), 50);
      return;
    }

    // Styles
    if (!document.getElementById('editor-styles')) {
      const style = document.createElement('style');
      style.id = 'editor-styles';
      style.innerHTML = `
        .schedule-table {border-collapse: separate; border-spacing: 0; min-width: 800px; width: 100%;}
        .schedule-table th, .schedule-table td {border-right: 1px solid #444; border-bottom: 1px solid #444; padding: 2px; text-align: center; min-width: 32px; height: 36px; user-select: none; color: #eee; position: relative; font-size: 0.9em; background: var(--bg-color);}
        .schedule-table th {background: #252525; font-weight: 600; position: sticky; top: 0; z-index: 20; box-shadow: 0 2px 2px rgba(0,0,0,0.5);}
        .duplicate-error {box-shadow: inset 0 0 0 4px #ff0000 !important; z-index: 100 !important; position: relative;}
        
        /* Sticky Left Column (Name) */
        .sticky-col {position: sticky !important; left: 0 !important; background: #252525 !important; z-index: 25; border-right: 2px solid #888 !important;}
        /* The top-left corner cell needs the highest z-index so it stays above both scrolling rows and columns */
        th.sticky-col {z-index: 35 !important;}
        
        .name-col {font-weight: bold; min-width: 110px; text-align: left !important; padding-left: 8px; white-space: nowrap;}
        
        /* Hover Effects */
        .cell:hover {background-color: rgba(255,255,255,0.1) !important; z-index: 15;}
        .cell.selected {box-shadow: inset 0 0 0 2px #646cff; background-image: linear-gradient(rgba(100, 108, 255, 0.15), rgba(100, 108, 255, 0.15));}
        .schedule-table tbody tr:hover .name-col {background: #4a4a4a !important; color: #fff; z-index: 30;}
        th.date-header.column-hover {background: #4a4a4a !important; color: #fff; box-shadow: 0px 4px 6px rgba(0,0,0,0.8); z-index: 22;}
      `;
      document.head.appendChild(style);
    }

    // Helper for safe listening
    const addListener = (selector, event, handler) => {
      const el = container.querySelector(selector);
      if (el) el.addEventListener(event, handler);
      else console.warn(`Element not found: ${selector}`);
    };

    // --- Day Settings Modal ---
    const dayModal = container.querySelector('#day-settings-modal');
    const dayModalTitle = container.querySelector('#day-modal-title');
    const btnDayCancel = container.querySelector('#day-modal-cancel');
    const btnDaySave = container.querySelector('#day-modal-save');
    let currentDayEdit = null;

    const closeDayModal = () => {
      dayModal.classList.add('hidden');
      currentDayEdit = null;
    };

    if (btnDayCancel) btnDayCancel.addEventListener('click', closeDayModal);
    if (btnDaySave) btnDaySave.addEventListener('click', () => {
      if (!currentDayEdit) return;
      const extras = [];
      if (container.querySelector('#check-1yobi').checked) extras.push('1班予備');
      if (container.querySelector('#check-2yobi').checked) extras.push('2班予備');
      if (container.querySelector('#check-yahiko').checked) extras.push('弥彦予備');
      this.store.updateDaySettings(currentDayEdit.ym, currentDayEdit.day, { extraRoutes: extras });
      closeDayModal();
      this.refresh();
    });

    // Date Header Click
    container.addEventListener('click', (e) => {
      const header = e.target.closest('.date-header');
      if (header) {
        const ym = header.dataset.ym;
        const day = parseInt(header.dataset.day);
        const dateStr = `${ym}-${String(day).padStart(2, '0')}`;
        currentDayEdit = { ym, day };
        dayModalTitle.innerText = `Settings for ${dateStr}`;
        const settings = this.store.getDaySettings(ym, day);
        const extras = settings.extraRoutes || [];
        container.querySelector('#check-1yobi').checked = extras.includes('1班予備');
        container.querySelector('#check-2yobi').checked = extras.includes('2班予備');
        container.querySelector('#check-yahiko').checked = extras.includes('弥彦予備');
        dayModal.classList.remove('hidden');
        e.stopPropagation();
      }
    });

    // Crosshair Hover
    const scheduleTable = container.querySelector('.schedule-table');
    if (scheduleTable) {
      scheduleTable.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('.cell');
        if (cell) {
          const ym = cell.dataset.ym;
          const day = cell.dataset.day;
          const header = container.querySelector(`th.date-header[data-ym="${ym}"][data-day="${day}"]`);
          if (header) header.classList.add('column-hover');
        }
      });
      scheduleTable.addEventListener('mouseout', (e) => {
        const cell = e.target.closest('.cell');
        if (cell) {
          const ym = cell.dataset.ym;
          const day = cell.dataset.day;
          const header = container.querySelector(`th.date-header[data-ym="${ym}"][data-day="${day}"]`);
          if (header) header.classList.remove('column-hover');
        }
      });
    }

    // Nav
    addListener('#btn-prev-month', 'click', () => this.prevMonth());
    addListener('#btn-next-month', 'click', () => this.nextMonth());
    addListener('#btn-apply-range', 'click', () => {
      const startEl = container.querySelector('#range-start');
      const endEl = container.querySelector('#range-end');
      if (startEl && endEl) this.setCustomRange(startEl.value, endEl.value);
    });
    addListener('#btn-home', 'click', () => { window.location.hash = 'home'; });

    // Buttons - FIXED IDs
    const runOptimization = async (btnId, mode, originalText) => {
      const { SolverAPI } = await import('../api/solver_api.js');
      const ranges = this.getVisibleRangeInfo();
      const btn = container.querySelector(btnId);
      btn.innerText = 'Solving...'; btn.disabled = true;

      // Lower score = better schedule.  Coverage is most important, then hard
      // business violations, then rest-rule softness.
      // Hard operational rules first (must never be sacrificed for coverage):
      // capability, no duplicates, special-duty monthly caps, rest-day counts,
      // and consecutive-work limits.
      // Missing routes (欠区) are intentionally the lowest priority because the
      // user fills shortages manually.
      const hardViolationScore = (result) => {
        const m = result?.metrics || {};
        return (m.illegalAssignments || 0) * 1e6
          + (m.overfill || 0) * 1e5
          + (m.specialDutyLimitViolations || 0) * 8e4
          + (m.managerPresenceViolations || 0) * 1e4
          + (m.weeklyRestViolations || 0) * 1e3
          + (m.minOffViolations || 0) * 1e2
          + (m.consecutiveViolations || 0) * 10;
      };

      // Used only to pick the better of two candidate schedules: hard rules
      // dominate, then fewer missing routes, then fewer disruptive changes.
      const qualityScore = (result) => {
        const m = result?.metrics || {};
        const hardUnderfill = m.hardUnderfill ?? m.underfill ?? 0;
        const softUnderfill = m.softUnderfill ?? 0;
        return hardViolationScore(result) * 1e4
          + hardUnderfill * 1000
          + softUnderfill * 10;
      };

      const resultCoversVisiblePeriod = (result, payload) => {
        if (!result?.matrix || !payload?.dateLabels) return false;
        const expectedIndexes = Object.keys(payload.dateLabels);
        return this.store.state.staff.every(staff => {
          const row = result.matrix[String(staff.id)];
          return row && expectedIndexes.every(dayIndex => row[dayIndex]);
        });
      };

      const summarizeUnfilled = (result) => {
        const items = result?.unfilledRequirements || [];
        if (!items.length) return '';
        const sorted = [...items].sort((a, b) => Number(a.softMissing === true) - Number(b.softMissing === true));
        const examples = sorted.slice(0, 12).map(item => {
          const capable = item.capableStaff === 0 ? '担当可能者0人' : `担当可能者${item.capableStaff}人`;
          const lockedAway = item.lockedAwayCapableStaff ? ` / ロックで使用不可${item.lockedAwayCapableStaff}人` : '';
          const soft = item.softMissing ? ' / 不足OK' : '';
          return `${item.date}: ${item.routeId} 不足${item.shortage} (${capable}${lockedAway}${soft})`;
        });
        const more = items.length > examples.length ? `\nほか ${items.length - examples.length} 件` : '';
        return `${examples.join('\n')}${more}`;
      };

      const summarizeMetrics = (result) => {
        const m = result?.metrics || {};
        const changed = result?.changedCells?.length ?? m.changedCells ?? 0;
        return [
          `欠員:${m.underfill ?? 0}`,
          `硬い欠員:${m.hardUnderfill ?? m.underfill ?? 0}`,
          `不足OK欠員:${m.softUnderfill ?? 0}`,
          `能力外:${m.illegalAssignments ?? 0}`,
          `重複/不要:${m.overfill ?? 0}`,
          `特殊上限:${m.specialDutyLimitViolations ?? 0}`,
          `管理者不在(平日):${m.managerPresenceViolations ?? 0}`,
          `週休非番違反:${m.weeklyRestViolations ?? 0}`,
          `連勤違反:${m.consecutiveViolations ?? 0}`,
          `4週休不足:${m.minOffViolations ?? 0}`,
          `変更:${changed}`
        ].join(' / ');
      };

      const applySolverResult = (result, payload, effectiveMode) => {
        Object.keys(result.matrix).forEach(s_id => {
          const daysMap = result.matrix[s_id];
          Object.keys(daysMap).forEach(idx_str => {
            const originalDateStr = payload.dateLabels[idx_str].originalDate;
            const [y, m, dstr] = originalDateStr.split('-');
            const ym = `${y}-${m}`;
            const customDayStr = String(parseInt(dstr, 10)).padStart(2, '0');

            let sch = this.store.getSchedule(ym) || {};
            if (!sch[s_id]) sch[s_id] = {};

            const originalCell = this.store.getSchedule(ym)?.[s_id]?.[customDayStr] || {};
            const solvedSymbol = daysMap[idx_str].symbol;
            if (!solvedSymbol || solvedSymbol === '空き') {
              delete sch[s_id][customDayStr];
            } else {
              sch[s_id][customDayStr] = {
                symbol: solvedSymbol,
                locked: effectiveMode === 'fill' && originalCell.symbol ? (originalCell.locked || false) : daysMap[idx_str].locked,
                type: ['週休', '非番', '年休', '祝日', '希', '欠', '／'].includes(solvedSymbol) ? 'OFF' : 'ROUTE'
              };
            }
            this.store.updateSchedule(ym, sch);
          });
        });
      };

      // Throws only when the solver could not produce a usable schedule at all
      // (network/timeout/error or a structurally incomplete matrix).  A schedule
      // with residual shortages or soft-rule violations is NOT thrown away: it is
      // genuine progress and is applied so repeated runs can keep improving it.
      const solveOnce = async (flatDates, effectiveMode) => {
        const payload = SolverAPI.buildPayload(this.store, flatDates, effectiveMode === 'fill', effectiveMode);
        const result = await SolverAPI.solve(payload);
        if (result.status !== 'success') {
          throw Object.assign(new Error('Optimization Error: ' + result.message), { solverFailed: true, result });
        }
        if (!resultCoversVisiblePeriod(result, payload)) {
          throw Object.assign(new Error('Solver returned an incomplete schedule for the visible period.'), { solverFailed: true, result });
        }
        return { payload, result, mode: effectiveMode };
      };

      const runJsFallback = () => {
        btn.innerText = '自動入力中...';
        const specialDutyPeriodDates = [];
        ranges.forEach(range => {
          for (let d = range.startDay; d <= range.endDay; d++) {
            specialDutyPeriodDates.push(`${range.ym}-${String(d).padStart(2, '0')}`);
          }
        });
        ranges.forEach(range => {
          this.generator.generate(range.ym, {
            clearUnlocked: mode !== 'fill',
            startDay: range.startDay,
            endDay: range.endDay,
            timeBudgetMs: 12000,
            attempts: 10,
            specialDutyPeriodDates
          });
        });
        this.normalizeVisibleWeeklyHiban();
      };

      try {
        let flatDates = [];
        ranges.forEach(range => {
          for (let d = range.startDay; d <= range.endDay; d++) {
            flatDates.push(`${range.ym}-${String(d).padStart(2, '0')}`);
          }
        });

        const candidates = [];
        const primary = await solveOnce(flatDates, mode);
        candidates.push(primary);

        // If the requested mode still leaves shortages/violations, try the more
        // flexible repair pass (it may move non-locked cells) and keep whichever
        // result is better.
        if (mode !== 'repair' && qualityScore(primary.result) > 0) {
          btn.innerText = 'Repairing...';
          try {
            candidates.push(await solveOnce(flatDates, 'repair'));
          } catch (repairError) {
            console.warn('Repair pass failed; keeping primary result.', repairError);
          }
        }

        candidates.sort((a, b) => {
          const qa = qualityScore(a.result);
          const qb = qualityScore(b.result);
          if (qa !== qb) return qa - qb;
          const ca = a.result.changedCells?.length || 0;
          const cb = b.result.changedCells?.length || 0;
          return ca - cb;
        });
        const best = candidates[0];

        applySolverResult(best.result, best.payload, best.mode);

        const changed = best.result.changedCells?.length || 0;
        const usedRepair = best.mode === 'repair' && mode !== 'repair';
        const missing = best.result.metrics?.underfill || 0;
        const hardMissing = best.result.metrics?.hardUnderfill ?? missing;
        const softMissing = best.result.metrics?.softUnderfill ?? 0;
        const blankCount = Object.values(best.result.matrix || {}).reduce((acc, row) => (
          acc + Object.values(row).filter(cell => !cell.symbol || cell.symbol === '空き').length
        ), 0);

        if (hardViolationScore(best.result) === 0) {
          // All absolute rules (休み数 / 連勤 / 能力 / 重複 / 特殊上限) are satisfied.
          // Missing routes and idle (空き) are intentionally left for the
          // planner to resolve manually (欠区・計画・有休). The solver never
          // auto-assigns 年休 or fabricates 欠区 placeholders.
          const notes = [];
          if (usedRepair && changed > 0) {
            const sample = (best.result.changedCells || []).slice(0, 8).map(item => `${item.date} ${item.staffId}: ${item.from}→${item.to}`);
            const more = changed > sample.length ? `\nほか ${changed - sample.length} 件` : '';
            notes.push(`空き枠固定では解けなかったため、自動リペアで既存配置を ${changed} 箇所だけ動かしました。\n変更例:\n${sample.join('\n')}${more}`);
          }
          if (missing > 0) {
            const missingNote = hardMissing === 0 && softMissing > 0
              ? `通常担務は埋め切り、不足OKの担務だけ ${softMissing} 件を未配置にしました。`
              : `人員不足のため未配置のままにした区が ${missing} 件あります（硬い欠員 ${hardMissing} / 不足OK ${softMissing}）。`;
            notes.push(`${missingNote} 欠区/計画などの対応はこちらで手動で割り当ててください（自動では欠区にしていません）。\n\n${summarizeUnfilled(best.result)}`);
          }
          if (blankCount > 0) {
            notes.push(`空き（余剰）が ${blankCount} 人日あります。有休消化などで誰かを追加で休ませる場合は手動で割り当ててください（年休は自動付与していません）。`);
          }
          const head = (missing > 0 || blankCount > 0)
            ? '生成しました（休み・連勤・能力・重複・特殊上限・平日管理者の違反は0です）。'
            : '生成しました（欠員・空きなし、違反なし）。';
          if (notes.length || missing > 0 || blankCount > 0) {
            alert(`${head}\n${summarizeMetrics(best.result)}${notes.length ? '\n\n' + notes.join('\n\n') : ''}`);
          }
        } else {
          // A hard rule could not be satisfied — almost always because of
          // conflicting locked cells or fixed leave.
          const body = [
            'ベストな結果を反映しましたが、絶対ルール（休み数・連勤・能力・重複・特殊上限・平日の課長代理以上の配置）に違反が残っています。',
            summarizeMetrics(best.result),
            '\nこれは通常、ロック（鍵マーク）や固定休が矛盾しているときに起きます。該当セルのロックを外して「自動リペア」を再実行してください。',
          ];
          alert(body.join('\n'));
        }
        window.location.reload();
      } catch (e) {
        console.error(e);
        // The Python solver itself could not return a schedule (timeout / network
        // / server error).  Apply the in-browser generator as a last resort so the
        // table still makes progress, but label it clearly.
        try {
          console.warn('Python solver unavailable. Falling back to in-browser generator.', e);
          runJsFallback();
          const reason = e.name === 'AbortError'
            ? 'Python solver が時間内に応答しませんでした'
            : 'Python solver に接続できませんでした';
          alert(`${reason}。\n簡易のブラウザ内生成で暫定的に表を更新しました（最適化ソルバーより品質は劣ります）。\n時間をおいて「自動リペア」を再実行すると改善します。`);
          window.location.reload();
        } catch (fallbackError) {
          console.error(fallbackError);
          alert('自動生成に失敗しました。Python solver とJS生成の両方でエラーが発生しました: ' + fallbackError.message);
          btn.disabled = false;
          btn.innerText = originalText;
        }
      }
    };

    addListener('#btn-auto-fill', 'click', () => runOptimization('#btn-auto-fill', 'fill', '✨ 空き枠を自動入力'));
    addListener('#btn-auto-repair', 'click', () => runOptimization('#btn-auto-repair', 'repair', '🔧 自動リペア'));
    addListener('#btn-auto-full', 'click', () => runOptimization('#btn-auto-full', 'full', '🔒 リセット＆再構築'));

    addListener('#btn-clear', 'click', () => {
      container.querySelector('#confirm-modal').classList.remove('hidden');
    });

    addListener('#confirm-no', 'click', () => {
      container.querySelector('#confirm-modal').classList.add('hidden');
    });

    addListener('#confirm-yes', 'click', () => {
      const ranges = this.getVisibleRangeInfo();
      ranges.forEach(range => {
        const oldSch = this.store.getSchedule(range.ym) || {};
        const newSch = JSON.parse(JSON.stringify(oldSch));
        Object.keys(newSch).forEach(staffId => {
          for (let d = range.startDay; d <= range.endDay; d++) {
            const dayKey = String(d).padStart(2, '0');
            if (newSch[staffId][dayKey] && !newSch[staffId][dayKey].locked) {
              delete newSch[staffId][dayKey];
            }
          }
        });
        this.store.updateSchedule(range.ym, newSch);
      });
      window.location.reload();
    });

    addListener('#btn-pdf-export', 'click', async () => {
      const { Exporter } = await import('../utils/exporter.js');
      const exporter = new Exporter();
      const tableWrapper = container.querySelector('.card');
      tableWrapper.id = 'schedule-print-area';
      const ranges = this.getVisibleRangeInfo();
      // Force PDF export immediately or handle async
      exporter.exportToPDF('schedule-print-area', 'schedule.pdf');
    });

    addListener('#btn-save', 'click', () => alert('Saved!'));

    // Selection & Picker
    let selectionStart = null;
    const selectedCells = new Set();
    const picker = container.querySelector('#picker-modal');
    const pickerContent = container.querySelector('#picker-content');
    const pickerCount = container.querySelector('#picker-count');

    const clearSelection = () => {
      selectedCells.forEach(cell => cell.classList.remove('selected'));
      selectedCells.clear();
    };

    const selectRange = (endCell) => {
      if (!selectionStart) return;
      clearSelection();
      const sRow = parseInt(selectionStart.dataset.row);
      const sCol = parseInt(selectionStart.dataset.col);
      const eRow = parseInt(endCell.dataset.row);
      const eCol = parseInt(endCell.dataset.col);
      const minRow = Math.min(sRow, eRow); const maxRow = Math.max(sRow, eRow);
      const minCol = Math.min(sCol, eCol); const maxCol = Math.max(sCol, eCol);
      container.querySelectorAll('.cell').forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (r >= minRow && r <= maxRow && c >= minCol && c <= maxCol) {
          cell.classList.add('selected');
          selectedCells.add(cell);
        }
      });
    };

    container.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        // Stop propagation NOT needed here actually, but good practice if nested
        // But cell click is key.

        if (e.shiftKey && selectionStart) {
          selectRange(cell);
        } else if (e.metaKey || e.ctrlKey) {
          if (selectedCells.has(cell)) {
            selectedCells.delete(cell);
            cell.classList.remove('selected');
            if (selectionStart === cell) selectionStart = null;
          } else {
            selectedCells.add(cell);
            cell.classList.add('selected');
            selectionStart = cell;
          }
        } else {
          if (!cell.classList.contains('selected') || selectedCells.size > 1) {
            clearSelection();
            selectionStart = cell;
            cell.classList.add('selected');
            selectedCells.add(cell);
          }
        }

        // Open Picker
        const rect = cell.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 5;
        if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
        if (top + 360 > window.innerHeight) top = rect.top - 365;
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        picker.classList.remove('hidden');
        pickerCount.innerText = selectedCells.size;

        this._populatePicker(pickerContent, selectedCells, picker);
      });
    });

    addListener('#picker-close', 'click', () => picker.classList.add('hidden'));

    setTimeout(() => this.checkDuplicates(), 500);
  }

  _populatePicker(content, cells, picker) {
    const uniqueStaffIds = new Set(Array.from(cells).map(c => c.dataset.staff));
    let allowedRoutes = [];
    const allRoutes = this.store.state.routes;

    if (uniqueStaffIds.size === 1) {
      const staffId = [...uniqueStaffIds][0];
      const staff = this.store.state.staff.find(s => s.id === staffId);

      // We need to know if the clicked cell is a weekend/holiday to show the right menu
      // Let's grab the first cell from the set (assuming bulk edit usually spans same day types, or we just use the first as representative)
      const firstCell = Array.from(cells)[0];
      const ym = firstCell.dataset.ym;
      const day = firstCell.dataset.day;
      const dateStr = `${ym}-${String(day).padStart(2, '0')}`;

      const { JapaneseCalendar } = window.app.models || {}; // Or import if needed, but since it's global... wait, JapaneseCalendar is in utils. Let's just do a basic check or assume the store/generator knows.
      // Actually, we can check the header color or just do a quick Date check. But holidays are tricky without JapaneseCalendar.
      // Let's do a basic Date check for sat/sun, and fallback to weekday caps if unsure.
      const [y, m] = ym.split('-');
      const dObj = new Date(y, m - 1, day);
      const dayOfWeek = dObj.getDay();

      // To be perfectly accurate we would use JapaneseCalendar.isHoliday(dateStr), but since it's a UI menu, we'll approximate or use the generator's helper if available globally.
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;

      // Let's check if the header has the holiday color as a hacky but 100% accurate client-side check
      const headerCell = document.querySelector(`th.date-header[data-ym="${ym}"][data-day="${day}"]`);
      const isHolColor = headerCell && headerCell.style.backgroundColor === 'rgb(61, 26, 26)'; // #3d1a1a

      const isSunOrHol = isSun || isHolColor;

      const baseCaps = staff.capabilities || [];
      const satCaps = staff.satCapabilities || baseCaps;
      const sunCaps = staff.sunCapabilities || baseCaps;

      if (isSunOrHol) {
        allowedRoutes = sunCaps;
      } else if (isSat) {
        allowedRoutes = satCaps;
      } else {
        allowedRoutes = baseCaps;
      }

    } else {
      allowedRoutes = allRoutes.map(r => r.id);
    }

    const symbols = this.store.state.symbols;
    let html = '';
    symbols.filter(s => ['OFF', 'WORK', 'BLOCKED'].includes(s.type)).forEach(s => {
      html += `<button class="picker-opt" data-val="${s.symbol}" style="background:${s.color}; color:#000 !important; text-shadow:none; border:1px solid #999; margin:2px; padding:6px; font-weight:bold;">${s.symbol}</button>`;
    });
    html += '<hr>';
    allRoutes.filter(r => allowedRoutes.includes(r.id)).forEach(r => {
      html += `<button class="picker-opt" data-val="${r.id}" style="background:#ddd; color:#000 !important; text-shadow:none; border:1px solid #999; margin:2px; padding:6px; font-weight:bold;">${r.name}</button>`;
    });
    html += '<hr><button class="picker-opt" data-val="">Clear</button>';
    content.innerHTML = html;

    content.querySelectorAll('.picker-opt').forEach(btn => {
      btn.onclick = (e) => {
        this.saveBulk(cells, e.target.dataset.val);
        picker.classList.add('hidden');
      };
    });
  }


  saveBulk(cells, val) {
    // Group cells by YearMonth
    const updates = {}; // { '2026-01': { staffId: { day: ... } } }

    const isLocked = document.getElementById('picker-lock')?.checked || false;

    // Type detection
    let type = 'UNKNOWN';
    if (!val) {
      type = 'EMPTY';
    } else {
      const sObj = this.store.state.symbols.find(s => s.symbol === val);
      if (sObj) type = sObj.type;
      else {
        const rObj = this.store.state.routes.find(r => r.id === val);
        if (rObj) type = 'ROUTE';
      }
    }

    cells.forEach(cell => {
      const ym = cell.dataset.ym; // Critical: Use the YM from the cell
      const staffId = cell.dataset.staff;
      const day = cell.dataset.day;

      if (!updates[ym]) {
        updates[ym] = this.store.getSchedule(ym) || {};
      }

      const schedule = updates[ym];
      if (!schedule[staffId]) schedule[staffId] = {};

      const dKey = String(day).padStart(2, '0');

      if (!val) {
        delete schedule[staffId][dKey];
        // UI Update
        cell.querySelector('span').innerText = '';
        cell.style.backgroundColor = 'transparent';
        if (cell.children.length > 1) cell.children[1].remove();
      } else {
        schedule[staffId][dKey] = {
          symbol: val,
          type: type,
          locked: isLocked
        };
        // UI Update
        cell.querySelector('span').innerText = val;
        cell.style.backgroundColor = this.getSymbolColor(val);

        let lockIcon = cell.querySelector('span:nth-child(2)');
        if (isLocked) {
          if (!lockIcon) {
            lockIcon = document.createElement('span');
            lockIcon.style.cssText = 'position:absolute; top:2px; right:2px; font-size:0.6em; opacity:0.7;';
            lockIcon.innerText = '🔒';
            cell.appendChild(lockIcon);
          }
        } else {
          if (lockIcon) lockIcon.remove();
        }
      }
    });

    // Save all affected months
    Object.keys(updates).forEach(ym => {
      this.store.updateSchedule(ym, updates[ym]);
    });

    cells.forEach(c => c.classList.remove('selected'));
    // Since we reload usually, footer update might be tricky if we don't have the columns logic here.
    // Ideally we re-render or just assume simplistic footer update (CSS only).
    // Actually, updateFooter and checkDuplicates rely on DOM or simple schedule fetch.
    // They need to be updated to support the split access.
    // But since we are likely just doing quick edits, a simple checkDuplicates is fine?
    // Let's call render() entirely? Rerender can break focus.
    // checkDuplicates needs to be smart.
    this.checkDuplicates();
    this.updateFooter();
  }

  getSolverResultIssues(result, payload) {
    const dateIndexes = Object.keys(payload.dateLabels || {}).sort((a, b) => Number(a) - Number(b));
    const issues = { missing: 0, softMissing: 0, invalid: 0, streak: 0, hiban: 0 };
    const staffById = new Map(this.store.state.staff.map(staff => [String(staff.id), staff]));

    dateIndexes.forEach(dayIndex => {
      const label = payload.dateLabels[dayIndex];
      const dateStr = label.originalDate;
      const [, , dStr] = dateStr.split('-');
      const ym = dateStr.slice(0, 7);
      const day = Number(dStr);

      this.store.state.routes.forEach(route => {
        const required = this.getRequiredCountForRoute(route.id, dateStr, ym, day);
        if (required <= 0) return;

        let assigned = 0;
        Object.keys(result.matrix || {}).forEach(staffId => {
          const symbol = result.matrix[staffId]?.[dayIndex]?.symbol;
          if (this.solverSymbolCountsForRoute(symbol, route.id)) assigned++;
        });
        if (assigned < required) {
          if (route.softMissing) issues.softMissing += required - assigned;
          else issues.missing += required - assigned;
        }
      });

      Object.keys(result.matrix || {}).forEach(staffId => {
        const staff = staffById.get(String(staffId));
        const symbol = result.matrix[staffId]?.[dayIndex]?.symbol;
        if (!staff || !this.isSolverRouteSymbol(symbol)) return;
        if (!this.solverStaffCanWork(staff, symbol, label)) issues.invalid++;
      });
    });

    this.store.state.staff.forEach(staff => {
      const row = result.matrix?.[String(staff.id)];
      if (!row) return;
        if (this.countSolverMaxStreakViolations(staff, row, dateIndexes, payload.dateLabels || {}) > 0) issues.streak++;
      issues.hiban += this.countSolverHibanViolations(staff, row, dateIndexes, payload.dateLabels || {});
    });

    issues.total = issues.missing + issues.invalid + issues.streak + issues.hiban;
    return issues;
  }

  solverSymbolCountsForRoute(symbol, routeId) {
    if (symbol === routeId) return true;
    if (routeId === '夕方区分' && symbol === '夕方') return true;
    if (routeId === '1班予備' && symbol === '1予備') return true;
    if (routeId === '混遅1' && symbol === '混中1') return true;
    if (routeId === '混遅2' && symbol === '混中2') return true;
    return false;
  }

  isSolverOffSymbol(symbol) {
    return !symbol || ['空き', '週休', '非番', '年休', '祝日', '希', '欠', '／', '/'].includes(symbol);
  }

  isSolverRouteSymbol(symbol) {
    return !!symbol && !this.isSolverOffSymbol(symbol);
  }

  solverStaffCanWork(staff, routeId, label) {
    let caps;
    if (label.isSat) {
      caps = staff.satCapabilities || staff.weekendCapabilities || staff.capabilities || [];
    } else if (label.isSun || label.isHol) {
      caps = staff.sunCapabilities || staff.weekendCapabilities || staff.capabilities || [];
    } else {
      caps = staff.capabilities || [];
    }
    return caps.includes(routeId);
  }

  countSolverMaxStreakViolations(staff, row, dateIndexes, labels = {}) {
    const maxConsecutive = this.store.getMaxConsecutiveWork
      ? this.store.getMaxConsecutiveWork(staff)
      : (this.store.state.settings?.maxConsecutiveWork ?? 5);
    const sortedIndexes = [...dateIndexes].sort((a, b) => Number(a) - Number(b));
    const firstDateStr = labels[sortedIndexes[0]]?.originalDate;
    const lastDateStr = labels[sortedIndexes[sortedIndexes.length - 1]]?.originalDate;
    if (!firstDateStr || !lastDateStr) {
      let streak = 0;
      let violations = 0;
      sortedIndexes.forEach(dayIndex => {
        const symbol = row?.[dayIndex]?.symbol;
        if (this.isSolverRouteSymbol(symbol)) {
          streak++;
          if (streak > maxConsecutive) violations++;
        } else {
          streak = 0;
        }
      });
      return violations;
    }

    const indexByDate = new Map(
      sortedIndexes
        .filter(dayIndex => labels[dayIndex]?.originalDate)
        .map(dayIndex => [labels[dayIndex].originalDate, dayIndex])
    );
    const addDays = (dateStr, offset) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const getStoredSymbol = (dateStr) => {
      const [year, month, day] = dateStr.split('-');
      return this.store.getSchedule(`${year}-${month}`)?.[staff.id]?.[day]?.symbol;
    };

    let streak = 0;
    let violations = 0;
    const dateStrs = Array.from({ length: sortedIndexes.length + maxConsecutive * 2 }, (_, idx) => addDays(firstDateStr, idx - maxConsecutive))
      .filter(dateStr => dateStr <= addDays(lastDateStr, maxConsecutive));

    dateStrs.forEach(dateStrOrIndex => {
      const dayIndex = indexByDate.get(dateStrOrIndex) || dateStrOrIndex;
      const symbol = indexByDate.has(dateStrOrIndex)
        ? row?.[dayIndex]?.symbol
        : getStoredSymbol(dateStrOrIndex);
      if (this.isSolverRouteSymbol(symbol)) {
        streak++;
        if (streak > maxConsecutive) violations++;
      } else {
        streak = 0;
      }
    });
    return violations;
  }

  solverRequiresWeeklyHiban(staff) {
    const maxConsecutive = this.store.getMaxConsecutiveWork
      ? this.store.getMaxConsecutiveWork(staff)
      : (this.store.state.settings?.maxConsecutiveWork ?? 5);
    if (maxConsecutive >= 6) return false;

    const allCaps = [
      ...(staff.capabilities || []),
      ...(staff.satCapabilities || []),
      ...(staff.sunCapabilities || [])
    ];
    return allCaps.some(routeId => (
      /^[1-9]区$/.test(routeId) ||
      /^1[0-3]区$/.test(routeId) ||
      routeId.startsWith('混') ||
      routeId.startsWith('弥彦') ||
      routeId.startsWith('特') ||
      routeId.includes('予備')
    ));
  }

  countSolverHibanViolations(staff, row, dateIndexes, labels) {
    if (!this.solverRequiresWeeklyHiban(staff)) return 0;
    const dates = dateIndexes.map(dayIndex => {
      const [year, month, day] = labels[dayIndex].originalDate.split('-').map(Number);
      return {
        dayIndex,
        date: new Date(year, month - 1, day)
      };
    });
    let violations = 0;
    let cursor = 0;

    while (cursor < dates.length) {
      const base = dates[cursor].date;
      const weekStart = new Date(base);
      weekStart.setDate(base.getDate() - base.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekDates = dates.filter(item => item.date >= weekStart && item.date <= weekEnd);
      if (weekDates.length >= 4) {
        const hibanInWeek = weekDates.filter(item => row?.[item.dayIndex]?.symbol === '非番').length;
        if (hibanInWeek >= 3) violations++;

        const nearStart = new Date(weekStart);
        nearStart.setDate(weekStart.getDate() - 3);
        const nearEnd = new Date(weekEnd);
        nearEnd.setDate(weekEnd.getDate() + 3);
        const hasNearHiban = dates.some(item => (
          item.date >= nearStart &&
          item.date <= nearEnd &&
          row?.[item.dayIndex]?.symbol === '非番'
        ));
        if (!hasNearHiban) violations++;
      }

      cursor += weekDates.length || 1;
    }

    return violations;
  }

  normalizeVisibleWeeklyHiban() {
    const columns = this.getVisibleColumnsForValidation();
    if (columns.length === 0) return;

    const dateIndexes = columns.map(col => String(col.index));
    const labels = Object.fromEntries(columns.map(col => [String(col.index), {
      originalDate: col.dateStr,
      isSat: col.isSat,
      isSun: col.isSun,
      isHol: col.isHol
    }]));
    const rows = this.buildVisibleScheduleRows(columns);
    const weeks = this.getVisibleWeekGroups(columns);
    const scheduleUpdates = {};
    let changed = false;

    const getMonthSchedule = ym => {
      if (!scheduleUpdates[ym]) {
        scheduleUpdates[ym] = JSON.parse(JSON.stringify(this.store.getSchedule(ym) || {}));
      }
      return scheduleUpdates[ym];
    };

    this.store.state.staff.forEach(staff => {
      if (!this.solverRequiresWeeklyHiban(staff)) return;
      const staffId = String(staff.id);
      const row = rows[staffId];
      if (!row) return;

      weeks.forEach(weekColumns => {
        if (weekColumns.length < 4) return;

        let hibanColumns = weekColumns.filter(col => row[String(col.index)]?.symbol === '非番');
        while (hibanColumns.length >= 3) {
          const before = this.countSolverHibanViolations(staff, row, dateIndexes, labels);
          const candidate = hibanColumns
            .filter(col => {
              const cell = this.store.getSchedule(col.ym)?.[staffId]?.[col.dayKey];
              return !cell?.locked;
            })
            .sort((a, b) => {
              const weekendA = (a.isSat || a.isSun || a.isHol) ? 1 : 0;
              const weekendB = (b.isSat || b.isSun || b.isHol) ? 1 : 0;
              if (weekendA !== weekendB) return weekendA - weekendB;
              return Math.abs(a.dayOfWeek - 3) - Math.abs(b.dayOfWeek - 3);
            })
            .find(col => {
              const key = String(col.index);
              const original = row[key];
              row[key] = { ...original, symbol: '空き' };
              const after = this.countSolverHibanViolations(staff, row, dateIndexes, labels);
              row[key] = original;
              return after < before;
            });

          if (!candidate) break;

          const monthSchedule = getMonthSchedule(candidate.ym);
          if (monthSchedule[staffId]) {
            delete monthSchedule[staffId][candidate.dayKey];
          }
          row[String(candidate.index)] = { symbol: '空き', locked: false };
          changed = true;
          hibanColumns = weekColumns.filter(col => row[String(col.index)]?.symbol === '非番');
        }
      });
    });

    if (changed) {
      Object.entries(scheduleUpdates).forEach(([ym, schedule]) => {
        this.store.updateSchedule(ym, schedule);
      });
    }
  }

  getVisibleColumnsForValidation() {
    const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const columns = [];

    for (let i = 0; i < this.periodDays; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const dateStr = `${ym}-${String(day).padStart(2, '0')}`;
      columns.push({
        index: i + 1,
        ym,
        day,
        dayKey: String(day).padStart(2, '0'),
        dateStr,
        dayOfWeek: date.getDay(),
        isSat: JapaneseCalendar.isSaturday(dateStr),
        isSun: JapaneseCalendar.isSunday(dateStr),
        isHol: JapaneseCalendar.isHoliday(dateStr)
      });
    }

    return columns;
  }

  buildVisibleScheduleRows(columns) {
    const rows = {};
    this.store.state.staff.forEach(staff => {
      const staffId = String(staff.id);
      rows[staffId] = {};
      columns.forEach(col => {
        const cell = this.store.getSchedule(col.ym)?.[staffId]?.[col.dayKey];
        rows[staffId][String(col.index)] = {
          symbol: cell?.symbol || '空き',
          locked: !!cell?.locked
        };
      });
    });
    return rows;
  }

  getVisibleWeekGroups(columns) {
    const grouped = new Map();
    columns.forEach(col => {
      const [year, month, day] = col.dateStr.split('-').map(Number);
      const weekStart = new Date(year, month - 1, day);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(col);
    });
    return [...grouped.values()];
  }

  getRequiredCountForRoute(routeId, dateStr, ym, day) {
    const route = this.store.state.routes.find(r => r.id === routeId || r.name === routeId);
    if (!route) return 0;

    const isSat = JapaneseCalendar.isSaturday(dateStr);
    const isSunOrHol = JapaneseCalendar.isSunday(dateStr) || JapaneseCalendar.isHoliday(dateStr);
    let count = 0;
    if (typeof route.required === 'number') {
      count = route.required;
    } else if (isSunOrHol) {
      count = route.required?.sun ?? 0;
    } else if (isSat) {
      count = route.required?.sat ?? 0;
    } else {
      count = route.required?.weekday ?? 0;
    }

    const daySettings = this.store.getDaySettings(ym, day);
    if (daySettings.extraRoutes) {
      count += daySettings.extraRoutes.filter(id => id === route.id).length;
    }
    return count;
  }

  checkDuplicates() {
    const container = document.querySelector('.container');
    if (!container) return;

    // Clear existing errors
    container.querySelectorAll('.duplicate-error').forEach(c => c.classList.remove('duplicate-error'));

    // Validation text display removed as per user request
    // Duplicates are highlighted by checkDuplicates() called in saveBulk/saveCell

    const tableBody = container.querySelector('#schedule-body');
    const cellsByDay = {};
    container.querySelectorAll('.cell').forEach(cell => {
      const d = cell.dataset.day;
      if (!cellsByDay[d]) cellsByDay[d] = [];
      cellsByDay[d].push(cell);
    });

    Object.keys(cellsByDay).forEach(d => {
      const cells = cellsByDay[d];
      const symbolMap = {};

      cells.forEach(cell => {
        const val = cell.querySelector('span').innerText;
        if (!val) return;
        // Ignore non-route symbols?
        // Usually '〇' (Work) or '週休' (Off) can be duplicated.
        // We only care about Routes like "1区", "特早".
        // So check if val is a Route ID.
        const isRoute = this.store.state.routes.some(r => r.id === val);
        if (!isRoute) return;

        if (!symbolMap[val]) symbolMap[val] = [];
        symbolMap[val].push(cell);
      });

      // Highlight duplicates
      Object.keys(symbolMap).forEach(key => {
        const firstCell = symbolMap[key][0];
        const limit = this.getRequiredCountForRoute(
          key,
          firstCell.dataset.date,
          firstCell.dataset.ym,
          parseInt(firstCell.dataset.day, 10)
        );
        if (symbolMap[key].length > limit) {
          symbolMap[key].forEach(cell => cell.classList.add('duplicate-error'));
        }
      });
    });
  }

  updateCell(staffId, day, symbol) {
    // Deprecated in favor of saveBulk
  }

  updateFooter() {
    const table = document.querySelector('.schedule-table');
    if (!table) return;
    const tfoot = table.querySelector('tfoot');
    if (!tfoot) return;

    // Footer logic for the selected period
    const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);

    // Build columns for the selected period
    const columns = [];
    for (let i = 0; i < this.periodDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      columns.push({
        year: y, month: m, day: day,
        ym: ym,
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }

    // Determine relevant YMs to fetch
    const uniqueYMs = [...new Set(columns.map(c => c.ym))];
    const schedules = {};
    uniqueYMs.forEach(ym => {
      schedules[ym] = this.store.getSchedule(ym) || {};
    });

    const staffList = this.store.state.staff;
    // alert(`Debug: Columns=${columns.length}, Staff=${staffList.length}`);
    if (!staffList || staffList.length === 0) {
      alert('Critical Error: Staff List is empty!');
    }

    const footerHTML = `
           <tr>
              <td class="sticky-col" style="background:#222; font-weight:bold; color:#ff9999;">Missing</td>
              ${columns.map(col => {
      const activeSchedule = schedules[col.ym];
      const schedule = activeSchedule; // Alias

      // Logic copied/adapted from Generator to determine Requirements
      const isSat = JapaneseCalendar.isSaturday(col.dateStr);
      const isSun = JapaneseCalendar.isSunday(col.dateStr);
      const isHol = JapaneseCalendar.isHoliday(col.dateStr);
      const isSunOrHol = isSun || isHol;

      let reqs = []; // Array of {id, count}
      this.store.state.routes.forEach(r => {
          let count = 0;
          if (isSunOrHol) count = r.required?.sun ?? (typeof r.required === 'number' ? r.required : 0);
          else if (isSat) count = r.required?.sat ?? (typeof r.required === 'number' ? r.required : 0);
          else count = r.required?.weekday ?? (typeof r.required === 'number' ? r.required : 0);
          if (count > 0) reqs.push({ id: r.id, count });
      });

      // Add Daily Overrides (Monday Augmentation)
      const daySettings = this.store.getDaySettings(col.ym, col.day);
      if (daySettings.extraRoutes) {
          daySettings.extraRoutes.forEach(routeId => {
              const existing = reqs.find(r => r.id === routeId);
              if (existing) existing.count++;
              else reqs.push({ id: routeId, count: 1 });
          });
      }

      // Calculate Missing Needs
      const missingList = [];
      reqs.forEach(r => {
        let count = 0;
        staffList.forEach(s => {
          const cell = (schedule[s.id] || {})[String(col.day).padStart(2, '0')];
          if (!cell) return;
          if (cell.symbol === r.id) count++;

          // Alias Logic
          if (r.id === '夕方区分' && cell.symbol === '夕方') count++;
          if (r.id === '1班予備' && cell.symbol === '1予備') count++;
          // Mixed-Mid counts as Mixed-Late
          if (r.id === '混遅1' && cell.symbol === '混中1') count++;
          if (r.id === '混遅2' && cell.symbol === '混中2') count++;
        });

        if (count < r.count) {
          missingList.push(`${r.id}${r.count > 1 ? `(${r.count - count})` : ''}`);
        }
      });

      if (missingList.length === 0) return '<td></td>';
      return `<td style="background:#2d0a0a; color:#ffaaaa; font-size:0.75em; vertical-align:top;">
                  ${missingList.join('<br>')}
              </td>`;
    }).join('')}
  </tr>
  <tr>
      <td class="sticky-col" style="background:#222; font-weight:bold; color:#aaffaa;">空き</td>
      ${columns.map(col => {
      const activeSchedule = schedules[col.ym];
      // We need to count empty slots for staff
      let emptyCount = 0;
      staffList.forEach(s => {
        const cell = (activeSchedule[s.id] || {})[String(col.day).padStart(2, '0')];
        if (!cell || !cell.symbol) emptyCount++;
      });
      return `<td style="text-align:center; color:#aaffaa; font-weight:bold;">${emptyCount}</td>`;
    }).join('')}
  </tr>
  <tr>
      <td class="sticky-col" style="background:#222; font-weight:bold; color:#ffcc99;">余剰</td>
      ${columns.map(col => {
      const activeSchedule = schedules[col.ym];
      // Count empty slots
      let emptyCount = 0;
      staffList.forEach(s => {
        const cell = (activeSchedule[s.id] || {})[String(col.day).padStart(2, '0')];
        if (!cell || !cell.symbol) emptyCount++;
      });

      // Only calculate surplus if no empty slots
      if (emptyCount > 0) {
        return `<td style="text-align:center; color:#999;"></td>`;
      }

      // Count duplicates
      const symbolMap = {};
      staffList.forEach(s => {
        const cell = (activeSchedule[s.id] || {})[String(col.day).padStart(2, '0')];
        if (cell && cell.symbol) {
          const sym = cell.symbol;
          const symbolDef = this.store.state.symbols.find(x => x.symbol === sym);
          if (symbolDef && (symbolDef.type === 'OFF' || symbolDef.type === 'BLOCKED')) return;

          if (!symbolMap[sym]) symbolMap[sym] = [];
          symbolMap[sym].push(s.id);
        }
      });

      let duplicateCount = 0;
      Object.keys(symbolMap).forEach(key => {
        const limit = this.getRequiredCountForRoute(key, col.dateStr, col.ym, col.day);
        if (symbolMap[key].length > limit) {
          duplicateCount += symbolMap[key].length - limit;
        }
      });

      const surplus = duplicateCount;
      return `<td style="text-align:center; color:#ffcc99; font-weight:bold;">${surplus > 0 ? surplus : ''}</td>`;
    }).join('')}
  </tr>`;

    tfoot.innerHTML = footerHTML;
  }
  generateDayColumns(ym) {
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const cols = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      cols.push({
        day: d,
        date: date
      });
    }
    return cols;
  }
}
