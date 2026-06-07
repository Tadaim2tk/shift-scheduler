import { Utils } from '../utils/utils.js';
import { Generator } from '../utils/generator.js';
import { Exporter } from '../utils/exporter.js';
import { AIService } from '../utils/ai.js';
import { JapaneseCalendar } from '../utils/holidays.js';

export class EditorView {
  constructor() {
    this.store = window.app.store;
    this.generator = new Generator(this.store);
    this.aiService = new AIService(this.store);
    this.currentStartDate = Utils.getCurrentStartDate();
    // Keep currentYM for internal ref or title only, but logic drives from start date
    // Or just derive it.
  }

  refresh() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(this.render());
    this.onMount();
  }

  prevMonth() {
    const [y, m, d] = this.currentStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 28);
    this.currentStartDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    Utils.saveCurrentStartDate(this.currentStartDate);
    this.refresh();
  }

  nextMonth() {
    const [y, m, d] = this.currentStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 28);
    this.currentStartDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    Utils.saveCurrentStartDate(this.currentStartDate);
    this.refresh();
  }
  getVisibleRangeInfo() {
    const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const ranges = {}; // ym -> {min, max}

    for (let i = 0; i < 28; i++) {
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

      // Calculate End Date for display (28 days later - 1)
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 27);
      const endY = endDate.getFullYear();
      const endM = endDate.getMonth() + 1;
      const endD = endDate.getDate();

      const rangeTitle = `${sy}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')} ～ ${endY}-${String(endM).padStart(2, '0')}-${String(endD).padStart(2, '0')}`;

      // Build 28 Columns
      const columns = [];
      for (let i = 0; i < 28; i++) {
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
        if (isSat) {
          reqs = [
            { id: '混早1', count: 1 }, { id: '混早2', count: 1 },
            { id: '混遅1', count: 1 }, { id: '混遅2', count: 1 },
            { id: '弥彦早', count: 1 }, { id: '弥彦遅', count: 1 },
            { id: '特早', count: 1 }, { id: '特遅', count: 1 },
            { id: '夕方区分', count: 1 }, { id: '1班予備', count: 1 }, { id: '2班予備', count: 1 }
          ];
        } else if (isSunOrHol) {
          reqs = [
            { id: '混早1', count: 1 }, { id: '混早2', count: 1 },
            { id: '混遅1', count: 1 }, { id: '混遅2', count: 1 },
            { id: '弥彦早', count: 1 }, { id: '弥彦遅', count: 1 },
            { id: '特早', count: 1 }, { id: '特遅', count: 1 }
          ];
        } else {
          reqs = [{ id: '夕方区分', count: 1 }];
          const coreWeekendRoutes = ['混早1', '混早2', '混遅1', '混遅2', '特早', '特遅'];
          coreWeekendRoutes.forEach(id => reqs.push({ id, count: 1 }));
          const newCoreRoutes = ['弥彦早', '弥彦遅', '計画', '夕差立'];
          newCoreRoutes.forEach(id => reqs.push({ id, count: 1 }));
          for (let i = 1; i <= 13; i++) {
            reqs.push({ id: `${i}区`, count: 1 });
          }
        }

        // Add Daily Overrides (Monday Augmentation)
        const daySettings = this.store.getDaySettings(col.ym, col.day);
        if (daySettings.extraRoutes) {
          daySettings.extraRoutes.forEach(routeId => {
            reqs.push({ id: routeId, count: 1 });
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
          const dateStr = col.dateStr;
          const isWeekendOrHol = JapaneseCalendar.isSaturday(dateStr) ||
            JapaneseCalendar.isSunday(dateStr) ||
            JapaneseCalendar.isHoliday(dateStr);

          let limit = 1;
          if (key === '夕方区分' || key === '夕方') {
            // No Evening shift on Sun/Hol
            if (JapaneseCalendar.isSunday(dateStr) || JapaneseCalendar.isHoliday(dateStr)) {
              limit = 0;
            } else {
              limit = 2; // Default 2 for weekdays/Saturdays
            }
          }
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
             <button id="btn-home" class="outline">← Home</button>
             <div class="calendar-nav">
                <button id="btn-prev-month">◀</button>
                <span id="current-month-display" style="font-size:1.2em; font-weight:bold; min-width:260px; text-align:center;">
                   ${rangeTitle}
                </span>
                <button id="btn-next-month">▶</button>
             </div>
          </div>
          <div style="display:flex; gap:10px;">
            <button id="btn-clear" class="danger outline">Clear All</button>
            <div class="button-group">
              <!-- Valid IDs: btn-auto-ai, btn-auto-fill, btn-auto-full -->
              <button id="btn-auto-ai" class="info" title="Use AI to fill gaps">✨ AI Fill (Beta)</button>
              <button id="btn-auto-fill" title="Fill empty cells only (Keep manual edits)">✨ Fill Remaining</button>
              <button id="btn-auto-full" class="warning" title="Reset non-locked cells and fill">🔒 Reset & Fill</button>
            </div>
            <button id="btn-pdf-export" class="outline">📄 PDF Export</button>
            <button id="btn-save" class="primary">Save</button>
          </div>
        </div>

        <div id="validation-errors" style="display:none; background: #522; color: #fbb; padding: 10px; margin-bottom: 1rem; border-radius: 4px;"></div>

        <div class="card" style="overflow: auto; max-height: 85vh; border: 1px solid #444; padding: 0;">
             <!-- Day Settings Modal (Hidden) -->
             <div id="day-settings-modal" class="hidden" style="position:fixed; z-index:1010; top:50%; left:50%; transform:translate(-50%, -50%); background:#333; border:1px solid #555; padding:20px; border-radius:8px; min-width: 300px; color:#ddd;">
                <h3 id="day-modal-title" style="margin-top:0; color:#fff; border-bottom:1px solid #555; padding-bottom:10px;">Day Settings</h3>
                <div style="margin: 15px 0; display:flex; flex-direction:column; gap:10px;">
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-1yobi"> 1班予備</label>
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-2yobi"> 2班予備</label>
                    <label style="display:block; cursor:pointer;"><input type="checkbox" id="check-yahiko"> 弥彦予備</label>
                </div>
                <div style="text-align:right; gap:10px;">
                    <button id="day-modal-cancel" class="small outline" style="margin-right:8px;">Cancel</button>
                    <button id="day-modal-save" class="small primary">Save</button>
                </div>
            </div>

            <!-- Picker Modal logic is handled by event listeners, element created here -->
             <div id="picker-modal" class="hidden" style="position:fixed; z-index:1000; background:rgba(45, 45, 45, 0.95); border:1px solid #444; padding:10px; border-radius:6px; max-width: 340px;">
                 <div class="picker-header" style="display:flex; justify-content:space-between; margin-bottom:5px; color:#aaa;">
                    <span>Editing <span id="picker-count" style="color:white;">1</span> cell(s)</span>
                    <label><input type="checkbox" id="picker-lock"> 🔒 Lock</label>
                 </div>
                 <div id="picker-content" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
                 <div style="text-align:right; margin-top:8px;"><button class="small outline" id="picker-close">Close</button></div>
             </div>
             
             <!-- Confirm Modal -->
             <div id="confirm-modal" class="hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:2000; display:flex; justify-content:center; align-items:center;">
                 <div class="card" style="min-width:300px; text-align:center;">
                     <h3>Confirm Clear</h3>
                     <p style="margin-bottom:1.5rem;">Are you sure you want to clear the entire schedule?</p>
                     <div class="flex justify-between">
                         <button id="confirm-no" class="outline">Cancel</button>
                         <button id="confirm-yes" class="danger">Clear All</button>
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
    addListener('#btn-home', 'click', () => { window.location.hash = 'home'; });

    // Buttons - FIXED IDs
    addListener('#btn-auto-ai', 'click', async () => {
      const btn = container.querySelector('#btn-auto-ai');
      btn.innerText = 'Calculating...';
      btn.disabled = true;
      try {
        const ranges = this.getVisibleRangeInfo();
        const staffList = this.store.state.staff;
        const constraints = { consecutiveLimit: this.store.state.settings.consecutiveLimit };
        for (const range of ranges) {
          const sch = this.store.getSchedule(range.ym);
          const updates = await this.aiService.fillGaps(range.ym, staffList, sch, constraints);
          const finalSch = JSON.parse(JSON.stringify(sch || {}));
          updates.forEach(assign => {
            if (assign.day < range.startDay || assign.day > range.endDay) return;
            if (!finalSch[assign.staffId]) finalSch[assign.staffId] = {};
            if (!finalSch[assign.staffId][String(assign.day).padStart(2, '0')]) {
              finalSch[assign.staffId][String(assign.day).padStart(2, '0')] = {
                symbol: assign.symbol, type: 'WORK', auto: true
              };
            }
          });
          this.store.updateSchedule(range.ym, finalSch);
        }
        window.location.reload();
      } catch (e) { alert(e.message); btn.disabled = false; }
    });

    addListener('#btn-auto-fill', 'click', async () => {
      const { Generator } = await import('../utils/generator.js');
      const gen = new Generator(this.store);
      const ranges = this.getVisibleRangeInfo();
      const btn = container.querySelector('#btn-auto-fill');
      btn.innerText = 'Processing...'; btn.disabled = true;
      try {
        for (const range of ranges) {
          gen.generate(range.ym, { clearUnlocked: false, startDay: range.startDay, endDay: range.endDay });
        }
        window.location.reload();
      } catch (e) { console.error(e); alert(e.message); btn.disabled = false; }
    });

    addListener('#btn-auto-full', 'click', async () => {
      // confirm removed due to browser auto-dismiss glitch
      const { SolverAPI } = await import('../api/solver_api.js');
      const ranges = this.getVisibleRangeInfo();
      const btn = container.querySelector('#btn-auto-full');
      btn.innerText = 'Processing...'; btn.disabled = true;
      try {
        let flatDates = [];
        ranges.forEach(range => {
            for (let d = range.startDay; d <= range.endDay; d++) {
                flatDates.push(`${range.ym}-${String(d).padStart(2, '0')}`);
            }
        });

        const payload = SolverAPI.buildPayload(this.store, flatDates);
        const result = await SolverAPI.solve(payload);

        if (result.status === 'success') {
            Object.keys(result.matrix).forEach(s_id => {
                const daysMap = result.matrix[s_id];
                Object.keys(daysMap).forEach(idx_str => {
                    const originalDateStr = payload.dateLabels[idx_str].originalDate;
                    const [y, m, dstr] = originalDateStr.split('-');
                    const ym = `${y}-${m}`;
                    const customDayStr = String(parseInt(dstr, 10)).padStart(2, '0');

                    let sch = this.store.getSchedule(ym) || {};
                    if (!sch[s_id]) sch[s_id] = {};
                    sch[s_id][customDayStr] = {
                        symbol: daysMap[idx_str].symbol,
                        locked: daysMap[idx_str].locked,
                        type: 'ROUTE'
                    };
                    this.store.updateSchedule(ym, sch);
                });
            });
        } else {
            alert('Optimization Error: ' + result.message);
        }
        window.location.reload();
      } catch (e) { 
        console.error(e); 
        alert('Server Error or Connection Refused. Is the Python solver running on port 8000? ' + e.message); 
        btn.disabled = false; 
        btn.innerText = '🔒 Reset & Fill'; 
      }
    });

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
        const limit = (key === '夕方' || key === '夕方区分') ? 2 : 1;
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

    // 4-Week Cycle Logic for Footer
    const [sy, sm, sd] = (this.currentStartDate || Utils.getCurrentStartDate()).split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);

    // Build 28 Columns
    const columns = [];
    for (let i = 0; i < 28; i++) {
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

      if (isSat) {
        reqs = [
          { id: '混早1', count: 1 }, { id: '混早2', count: 1 },
          { id: '混遅1', count: 1 }, { id: '混遅2', count: 1 },
          { id: '弥彦早', count: 1 }, { id: '弥彦遅', count: 1 },
          { id: '特早', count: 1 }, { id: '特遅', count: 1 },
          { id: '夕方区分', count: 1 }, { id: '1班予備', count: 1 }, { id: '2班予備', count: 1 }
        ];
      } else if (isSunOrHol) {
        reqs = [
          { id: '混早1', count: 1 }, { id: '混早2', count: 1 },
          { id: '混遅1', count: 1 }, { id: '混遅2', count: 1 },
          { id: '弥彦早', count: 1 }, { id: '弥彦遅', count: 1 },
          { id: '特早', count: 1 }, { id: '特遅', count: 1 }
        ];
      } else {
        // Weekday
        reqs = [{ id: '夕方区分', count: 1 }];

        const coreWeekendRoutes = ['混早1', '混早2', '混遅1', '混遅2', '特早', '特遅'];
        coreWeekendRoutes.forEach(id => reqs.push({ id, count: 1 }));

        const newCoreRoutes = ['弥彦早', '弥彦遅', '計画', '夕差立'];
        newCoreRoutes.forEach(id => reqs.push({ id, count: 1 }));

        // Standard Routes
        for (let i = 1; i <= 13; i++) {
          reqs.push({ id: `${i}区`, count: 1 });
        }
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
        const limit = (key === '夕方' || key === '夕方区分') ? 2 : 1;
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
