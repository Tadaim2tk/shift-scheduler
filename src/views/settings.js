import { Utils } from '../utils/utils.js';

export class SettingsView {
  constructor() {
    this.store = window.app.store;
    this.activeTab = 'staff'; // staff, routes, symbols
    window.app.settings = this; // Allow global access for inline onclicks
  }

  render() {
    const div = document.createElement('div');
    div.className = 'container';
    this.container = div;
    this.updateUI();

    return div;
  }

  updateUI() {
    const { staff, routes, symbols } = this.store.state;

    this.container.innerHTML = `
      <div class="header flex justify-between items-center" style="margin-bottom: 2rem;">
        <button class="outline" id="btn-back">← Back</button>
        <h2>Settings</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="tabs flex gap-4" style="border-bottom: 1px solid var(--border-color); margin-bottom: 1rem;">
        <button class="${this.activeTab === 'staff' ? '' : 'outline'}" data-tab="staff">社員 (Staff)</button>
        <button class="${this.activeTab === 'routes' ? '' : 'outline'}" data-tab="routes">通区 (Routes)</button>
        <button class="${this.activeTab === 'symbols' ? '' : 'outline'}" data-tab="symbols">記号 (Symbols)</button>
      </div>

      <div class="tab-content">
        ${this.renderTabContent(staff, routes, symbols)}
      </div>

      <!-- System Reset Section (Moved inside updateUI to persist) -->
      <div style="margin-top: 2rem; border-top: 1px solid #444; padding-top: 1rem;">
          <h3>System / Data</h3>

          <button id="btn-reset-data" class="danger outline">⚠️ Reset Data to Defaults</button>
      </div>

      <!-- Reset Confirm Modal -->
      <div id="reset-confirm-modal" class="hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:2000;display:flex;justify-content:center;align-items:center;">
          <div class="card" style="min-width:300px; text-align:center; border: 1px solid #666;">
              <h3>Confirm Reset</h3>
              <p style="margin-bottom:1.5rem; color:#ffcccc;">Warning: This will delete all current schedule data and staff changes.<br>It will restore the default 30-person roster.</p>
              <div class="flex justify-between">
                  <button id="reset-cancel" class="outline">Cancel</button>
                  <button id="reset-confirm" class="danger">Reset Now</button>
              </div>
          </div>
      </div>
    `;

    // Event Listeners
    // Event Listeners
    this.container.querySelector('#btn-back').addEventListener('click', () => {
      if (window.history.length > 2) window.history.back();
      else window.location.hash = 'home';
    });

    // Reset Modal Logic
    const resetModal = this.container.querySelector('#reset-confirm-modal');

    this.container.querySelector('#btn-reset-data').onclick = () => {
      resetModal.classList.remove('hidden');
    };
    this.container.querySelector('#reset-cancel').onclick = () => {
      resetModal.classList.add('hidden');
    };
    this.container.querySelector('#reset-confirm').onclick = () => {
      localStorage.removeItem('shift-scheduler-data');
      window.location.reload();
    };



    this.container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.dataset.tab;
        this.updateUI();
      });
    });

    this.attachTabListeners();
  }

  renderTabContent(staff, routes, symbols) {
    if (this.activeTab === 'staff') {
      return `
        <div class="card">
          <div class="flex justify-between items-center" style="margin-bottom: 1rem;">
            <h3>社員ステータス (${staff.length})</h3>
            <button id="btn-add-staff" class="secondary">+ Add</button>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 1rem;">
            <input type="text" id="staff-bulk-input" class="w-100" placeholder="追加したい社員の名前を入力" style="flex: 1;">
            <button id="btn-bulk-add" style="white-space: nowrap;">社員を追加</button>
          </div>
          
          <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <table style="width: 100%; min-width: 680px; table-layout: fixed; border-collapse: collapse; margin-top: 1rem;">
            <colgroup>
              <col style="width: 36px;">
              <col style="width: 30%;">
              <col style="width: 17%;">
              <col style="width: 15%;">
              <col style="width: 18%;">
              <col style="width: 14%;">
            </colgroup>
            <thead>
              <tr style="text-align: left; border-bottom: 2px solid #ddd;">
                <th></th>
                <th>Name</th>
                <th>Title (役職)</th>
                <th>Group (斑)</th>
                <th>通区状況</th>
                <th>削除</th>
              </tr>
            </thead>
            <tbody id="staff-tbody">
              ${staff.map((s, idx) => {
        const titles = this.store.getTitles();
        const currentTitle = s.attributes?.title || '新一般';

        // Helper to render options
        const renderOptions = () => {
          let html = '';
          for (const [groupLabel, subTitles] of Object.entries(titles)) {
            html += `<optgroup label="${groupLabel}">`;
            subTitles.forEach(t => {
              const isSelected = currentTitle === t;
              html += `<option value="${t}" ${isSelected ? 'selected' : ''}>${t}</option>`;
            });
            html += `</optgroup>`;
          }
          return html;
        };

        return `
                <tr class="draggable-row" data-type="staff" data-idx="${idx}" style="border-bottom: 1px solid #eee;">
                  <td class="drag-handle" style="padding: 8px; text-align: center; color: #888; cursor: grab; touch-action: none;" title="ドラッグで並び替え">≡</td>
                  <td style="padding: 8px;">
                    <input type="text" value="${s.name}" data-idx="${idx}" class="staff-name-input" style="width: 100%;">
                  </td>
                  <td style="padding: 8px 4px;">
                    <select data-idx="${idx}" class="staff-title-input" style="width: 100%;">
                      ${renderOptions()}
                    </select>
                  </td>
                  <td style="padding: 8px 4px;">
                    <select data-idx="${idx}" class="staff-group-input" style="width: 100%;">
                       <option value="">(None)</option>
                       ${this.store.getGroups().map(g => `<option value="${g}" ${s.attributes?.group === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                  </td>
                  <td style="padding: 8px 4px;">
                    <button class="small outline" style="width: 100%; white-space: nowrap;" onclick="window.app.settings.openCapabilityModal(${idx})">
                        ${s.capabilities && s.capabilities.length > 0 ? s.capabilities.length + ' routes' : 'Set Routes'}
                    </button>
                  </td>
                  <td style="padding: 8px 4px;">
                    <button class="danger small" style="width: 100%; white-space: nowrap;" data-idx="${idx}">🗑️ 削除</button>
                  </td>
                </tr>
              `;
      }).join('')}
            </tbody>
          </table>
          </div>

          <!-- Modal for Capabilities -->
          <div id="cap-modal" class="modal hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;">
            <div class="card" style="width: min(96vw, 1100px); max-height: 90vh; overflow-y: auto;">
                <h3 id="cap-modal-title">Select Allowed Routes</h3>
                <div id="cap-modal-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 1rem 0;"></div>
                <div class="flex justify-between">
                    <button id="cap-modal-close" class="outline">Cancel</button>
                    <button id="cap-modal-save" class="primary">Save</button>
                </div>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'routes') {
      return `
        <div class="card">
            <div class="flex justify-between items-center" style="margin-bottom: 1rem;">
                <h3>Routes Configuration</h3>
                <button id="btn-add-route" class="secondary">+ Add Route</button>
            </div>
            <p style="font-size: 0.85em; color: #ffeb3b; margin-bottom: 1rem;">⚠️ Warning: Changing a Route ID will untick it from staff capabilities and erase it from past schedules if they do not match exactly. Be careful when re-naming IDs.</p>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ddd; text-align: left;">
                        <th style="width: 30px;"></th>
                        <th>担務名 (ID)</th>
                        <th>シフト上の表示</th>
                        <th>配置する曜日</th>
                        <th>通区状況</th>
                        <th>削除</th>
                    </tr>
                </thead>
                <tbody id="routes-tbody">
                    ${routes.map((r, idx) => `
                        <tr class="draggable-route" data-idx="${idx}" style="border-bottom: 1px solid #eee;">
                            <td class="route-drag-handle" style="padding: 8px; text-align: center; color: #888; cursor: grab; touch-action: none;" title="ドラッグで並び替え">≡</td>
                            <td style="padding: 8px;">
                                <input class="route-input" data-field="id" data-idx="${idx}" value="${r.id}" style="width:100%;">
                            </td>
                            <td>
                                <input class="route-input" data-field="name" data-idx="${idx}" value="${r.name}" style="width:100%;">
                            </td>
                            <td>
                                <div id="route-req-container-${idx}" style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                    ${r.isMultiple ? `
                                        <div class="req-numbers" style="display:flex; gap:4px; align-items:center;">
                                            <div style="display:flex; flex-direction:column; align-items:center; font-size:0.7em;">
                                                <input class="route-input" data-field="required.weekday" data-idx="${idx}" type="number" value="${r.required?.weekday ?? 1}" style="width:50px; text-align:center; padding:4px;" title="平日">平
                                            </div>
                                            <div style="display:flex; flex-direction:column; align-items:center; font-size:0.7em;">
                                                <input class="route-input" data-field="required.sat" data-idx="${idx}" type="number" value="${r.required?.sat ?? 1}" style="width:50px; text-align:center; padding:4px;" title="土曜">土
                                            </div>
                                            <div style="display:flex; flex-direction:column; align-items:center; font-size:0.7em;">
                                                <input class="route-input" data-field="required.sun" data-idx="${idx}" type="number" value="${r.required?.sun ?? 1}" style="width:50px; text-align:center; padding:4px;" title="日祝">日
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="req-checkboxes" style="display:flex; gap:8px; align-items:center;">
                                            <label style="font-size:0.8em; cursor:pointer;"><input class="route-input" type="checkbox" data-field="required.weekday" data-idx="${idx}" ${(r.required?.weekday || 0) > 0 ? 'checked' : ''}> 平</label>
                                            <label style="font-size:0.8em; cursor:pointer;"><input class="route-input" type="checkbox" data-field="required.sat" data-idx="${idx}" ${(r.required?.sat || 0) > 0 ? 'checked' : ''}> 土</label>
                                            <label style="font-size:0.8em; cursor:pointer;"><input class="route-input" type="checkbox" data-field="required.sun" data-idx="${idx}" ${(r.required?.sun || 0) > 0 ? 'checked' : ''}> 日</label>
                                        </div>
                                    `}
                                    <label style="font-size:0.7em; color:#aaa; margin-top:4px; cursor:pointer;">
                                        <input class="route-multiple-toggle" type="checkbox" data-idx="${idx}" ${r.isMultiple ? 'checked' : ''}> 1日に2人以上必要な担務
                                    </label>
                                </div>
                            </td>
                            <td>
                                <button class="small outline" onclick="window.app.settings.openRouteStaffModal(${idx})">設定</button>
                            </td>
                            <td>
                                <button class="danger small" onclick="if(confirm('本当に削除しますか？')) { window.app.store.deleteRoute(${idx}); window.app.settings.updateUI(); }">🗑️ 削除</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- Modal for Route Staff -->
            <div id="route-staff-modal" class="modal hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;">
              <div class="card" style="width: min(96vw, 1000px); max-height: 90vh; display:flex; flex-direction:column; overflow:hidden;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex:0 0 auto;">
                      <button id="route-staff-prev" class="small outline" title="前の担務へ">◀ 前</button>
                      <h3 id="route-staff-modal-title" style="margin:0; text-align:center; flex:1;">担当社員の設定</h3>
                      <button id="route-staff-next" class="small outline" title="次の担務へ">次 ▶</button>
                  </div>
                  <div id="route-staff-modal-list"></div>
                  <div class="flex justify-between" style="flex:0 0 auto; margin-top:0.75rem;">
                      <button id="route-staff-modal-close" class="outline">Cancel</button>
                      <button id="route-staff-modal-save" class="primary">Save</button>
                  </div>
              </div>
            </div>
        </div>
      `;
    } else {
      return `
        <div class="card">
            <h3>Shift Symbols</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ddd; text-align: left;">
                        <th>Display Symbol</th>
                        <th>Canonical (Type)</th>
                        <th>Type</th>
                        <th>Color</th>
                    </tr>
                </thead>
                <tbody>
                    ${symbols.map((s, idx) => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px;">
                                <input class="symbol-input" data-field="symbol" data-idx="${idx}" value="${s.symbol}" style="width: 60px;">
                            </td>
                            <td>
                                <input class="symbol-input" data-field="canonical" data-idx="${idx}" value="${s.canonical}">
                            </td>
                            <td>${s.type}</td>
                            <td><div style="width: 20px; height: 20px; background: ${s.color}; border: 1px solid #ccc;"></div></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
      `;
    }
  }

  attachTabListeners() {
    if (this.activeTab === 'staff') {
      // Bulk Add
      const bulkBtn = this.container.querySelector('#btn-bulk-add');
      if (bulkBtn) {
        bulkBtn.addEventListener('click', () => {
          const text = this.container.querySelector('#staff-bulk-input').value;
          const names = text.split('\n').map(n => n.trim()).filter(n => n);
          if (names.length > 0) {
            const newStaff = names.map((name, i) => ({
              id: Date.now() + '-' + i,
              name,
              name,
              attributes: { role: 'main', group: '一斑' }
            }));
            const updated = [...this.store.state.staff, ...newStaff];
            this.store.updateStaff(updated);
            this.updateUI();
          }
        });
      }

      // Individual Edits
      this.container.querySelectorAll('.staff-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const staff = [...this.store.state.staff];
          staff[idx].name = e.target.value;
          this.store.updateStaff(staff);
        });
      });

      this.container.querySelectorAll('.staff-title-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const staff = [...this.store.state.staff];
          if (!staff[idx].attributes) staff[idx].attributes = {};
          staff[idx].attributes.title = e.target.value;
          this.store.updateStaff(staff);
        });
      });
      this.container.querySelectorAll('.staff-group-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const staff = [...this.store.state.staff];
          if (!staff[idx].attributes) staff[idx].attributes = {};
          staff[idx].attributes.group = e.target.value;
          this.store.updateStaff(staff);
        });
      });

      // Delete (This needs to be attached carefully or via global delegation)
      this.container.querySelectorAll('.danger').forEach(btn => {
        btn.onclick = () => {
          if (confirm('本当に削除しますか？')) {
            const idx = parseInt(btn.dataset.idx);
            const staff = [...this.store.state.staff];
            staff.splice(idx, 1);
            this.store.updateStaff(staff);
            this.updateUI();
          }
        };
      });
    } else if (this.activeTab === 'routes') {
      const btnAddRoute = this.container.querySelector('#btn-add-route');
      if (btnAddRoute) {
        btnAddRoute.addEventListener('click', () => {
          this.store.addRoute();
          this.updateUI();
        });
      }

      this.container.querySelectorAll('.route-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const field = e.target.dataset.field;
          const val = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value;
          this.store.updateRoute(idx, field, val);
        });
      });

      this.container.querySelectorAll('.route-multiple-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          this.store.updateRoute(idx, 'isMultiple', e.target.checked);
          this.updateUI(); // re-render
        });
      });
    } else if (this.activeTab === 'symbols') {
      this.container.querySelectorAll('.symbol-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const field = e.target.dataset.field; // symbol or canonical
          const symbols = [...this.store.state.symbols];
          symbols[idx][field] = e.target.value;
          this.store.updateSymbols(symbols);
        });
      });
    }

    // --- Drag and Drop Logic via Sortable.js ---
    if (typeof Sortable !== 'undefined') {
        const staffTbody = this.container.querySelector('#staff-tbody');
        if (staffTbody) {
            new Sortable(staffTbody, {
                animation: 150,
                handle: '.drag-handle',
                onEnd: (evt) => {
                    const list = [...this.store.state.staff];
                    const item = list.splice(evt.oldIndex, 1)[0];
                    list.splice(evt.newIndex, 0, item);
                    this.store.updateStaff(list);
                    // Minimal UI update to avoid full re-render on drop if possible, but updateUI is safer
                    setTimeout(() => this.updateUI(), 10);
                }
            });
        }

        const routesTbody = this.container.querySelector('#routes-tbody');
        if (routesTbody) {
            new Sortable(routesTbody, {
                animation: 150,
                handle: '.route-drag-handle',
                onEnd: (evt) => {
                    const list = [...this.store.state.routes];
                    const item = list.splice(evt.oldIndex, 1)[0];
                    list.splice(evt.newIndex, 0, item);
                    this.store.updateRoutes(list);
                    setTimeout(() => this.updateUI(), 10);
                }
            });
        }
    }
  }

  moveStaff(idx, direction) {
    const staff = [...this.store.state.staff];
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < staff.length) {
      const temp = staff[newIdx];
      staff[newIdx] = staff[idx];
      staff[idx] = temp;
      this.store.updateStaff(staff);
      this.updateUI();
    }
  }

  // Modal Helpers
  openCapabilityModal(idx) {
    this.currentStaffIdx = idx;
    const staff = this.store.state.staff[idx];
    const allRoutes = this.store.state.routes;

    // Capabilities
    const allowed = new Set(staff.capabilities || []);

    // Migration logic for 3-way split
    const prevWeekend = staff.weekendCapabilities || staff.capabilities || [];
    const allowedSat = new Set(staff.satCapabilities || prevWeekend);
    const allowedSun = new Set(staff.sunCapabilities || prevWeekend);

    // New Attributes
    const staffType = staff.attributes?.type || 'regular';
    const prefOff = new Set(staff.preferredOffDays || []);

    // New: Leave Settings
    const paidLeave = staff.attributes?.paidLeaveRemaining ?? 0;
    const plannedLeave = staff.attributes?.plannedLeaveRemaining ?? 0;

    const modal = this.container.querySelector('#cap-modal');
    const list = this.container.querySelector('#cap-modal-list');
    const title = this.container.querySelector('#cap-modal-title');

    title.innerText = `Settings for ${staff.name}`;

    // Reset list style for free-form content
    list.style.display = 'block';

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // その曜日に配置される担務(required[reqKey] > 0)だけを表示する。
    const renderColumn = (label, set, suffix, reqKey) => {
        const routesForDay = allRoutes.filter(r => (r.required?.[reqKey] || 0) > 0);
        return `
        <div style="border:1px solid #444; padding:0.5rem; border-radius:4px; flex:1; min-width:0;">
            <h4 style="margin-bottom:0.5rem; border-bottom:1px solid #555; font-size: 0.9em;">${label} <span style="color:#888; font-weight:normal;">(${routesForDay.length})</span></h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap:4px 8px; max-height:52vh; overflow-y:auto;">
                ${routesForDay.length ? routesForDay.map(r => `
                    <label style="display:flex; align-items:center; gap: 4px; font-size:0.82em; white-space:nowrap;">
                        <input type="checkbox" class="cap-cb-${suffix}" value="${r.id}" ${set.has(r.id) ? 'checked' : ''}>
                        ${r.id}
                    </label>
                `).join('') : '<span style="color:#777; font-size:0.8em;">配置なし</span>'}
            </div>
        </div>
        `;
    };

    list.innerHTML = `
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #555;">
            <div style="margin-bottom: 1rem; display:flex; gap: 1rem; align-items: center;">
                <div>
                    <label>Staff Type:</label>
                    <select id="staff-type-select" style="margin-left:5px; padding:2px;">
                        <option value="regular" ${staffType === 'regular' ? 'selected' : ''}>Regular (Full Time)</option>
                        <option value="helper" ${staffType === 'helper' ? 'selected' : ''}>Helper (Part Time)</option>
                    </select>
                </div>
                <div style="flex: 1; display:flex; gap: 1rem;">
                    <div>
                        <label>年休残 (Paid Leave):</label>
                        <input type="number" id="input-paid-leave" value="${paidLeave}" style="width: 50px;" min="0">
                    </div>
                    <div>
                        <label>計年残 (Planned Leave):</label>
                        <input type="number" id="input-planned-leave" value="${plannedLeave}" style="width: 50px;" min="0">
                    </div>
                </div>
            </div>
            
            <div style="border:1px solid #444; padding:0.5rem; border-radius:4px; margin-bottom: 1rem;">
                <h4 style="margin-bottom:0.5rem; border-bottom:1px solid #555; font-size: 0.9em;">Preferred Days Off (Priority Rest):</h4>
                <div style="display:flex; gap:10px;">
                    ${days.map((d, i) => `
                        <label><input type="checkbox" class="off-day-cb" value="${i}" ${prefOff.has(i) ? 'checked' : ''}> ${d}</label>
                    `).join('')}
                </div>
            </div>
        </div>

        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${renderColumn('平日 (Weekday)', allowed, 'weekday', 'weekday')}
            ${renderColumn('土曜 (Saturday)', allowedSat, 'sat', 'sat')}
            ${renderColumn('日祝 (Sun/Hol)', allowedSun, 'sun', 'sun')}
        </div>
    `;

    modal.classList.remove('hidden');

    // Save Listener
    const saveBtn = this.container.querySelector('#cap-modal-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', () => {
      const offDayCB = list.querySelectorAll('.off-day-cb:checked');

      // その曜日に表示中(=配置あり)の担務だけを保存対象にし、
      // 非表示(配置なし)の担務の既存設定は保持する（非破壊）。
      const mergeCaps = (displaySet, suffix, reqKey) => {
        const shown = new Set(allRoutes.filter(r => (r.required?.[reqKey] || 0) > 0).map(r => r.id));
        const checked = new Set(Array.from(list.querySelectorAll(`.cap-cb-${suffix}:checked`)).map(cb => cb.value));
        const result = new Set();
        displaySet.forEach(id => { if (!shown.has(id)) result.add(id); }); // 非表示分は保持
        checked.forEach(id => result.add(id)); // 表示中でチェックされた分
        return Array.from(result);
      };

      const newCapabilities = mergeCaps(allowed, 'weekday', 'weekday');
      const newSatCapabilities = mergeCaps(allowedSat, 'sat', 'sat');
      const newSunCapabilities = mergeCaps(allowedSun, 'sun', 'sun');
      const newPreferredOffDays = Array.from(offDayCB).map(cb => parseInt(cb.value));
      const newType = list.querySelector('#staff-type-select').value;
      const newPaidLeave = parseInt(list.querySelector('#input-paid-leave').value) || 0;
      const newPlannedLeave = parseInt(list.querySelector('#input-planned-leave').value) || 0;

      const newStaff = [...this.store.state.staff];
      const target = newStaff[this.currentStaffIdx];

      target.capabilities = newCapabilities;
      target.satCapabilities = newSatCapabilities;
      target.sunCapabilities = newSunCapabilities;
      target.preferredOffDays = newPreferredOffDays;
      if (!target.attributes) target.attributes = {};
      target.attributes.type = newType;
      target.attributes.paidLeaveRemaining = newPaidLeave;
      target.attributes.plannedLeaveRemaining = newPlannedLeave;

      this.store.updateStaff(newStaff);

      modal.classList.add('hidden');
      this.updateUI(); // Refresh table text
    });

    // Close Listener
    const closeBtn = this.container.querySelector('#cap-modal-close');
    closeBtn.onclick = () => modal.classList.add('hidden');
  }

  // --- New Modal for Route-to-Staff Assignment ---
  openRouteStaffModal(idx) {
    const route = this.store.state.routes[idx];
    const staffList = this.store.state.staff;

    const modal = this.container.querySelector('#route-staff-modal');
    const list = this.container.querySelector('#route-staff-modal-list');
    const title = this.container.querySelector('#route-staff-modal-title');

    title.innerText = `担当社員設定: ${route.name}`;
    // リストエリアだけをスクロールさせ、タイトル/保存ボタンは固定する。
    list.style.cssText = 'flex:1 1 auto; min-height:0; overflow-y:auto; margin:0.5rem 0; border:1px solid #444; border-radius:4px;';

    // 配置する曜日(route.required)。チェックされていない曜日は社員カードからも非表示にする。
    const reqField = { wd: 'weekday', sat: 'sat', sun: 'sun' };
    const dayConfig = {
        wd: (route.required?.weekday || 0) > 0,
        sat: (route.required?.sat || 0) > 0,
        sun: (route.required?.sun || 0) > 0,
    };

    list.innerHTML = `
        <div style="position:sticky; top:0; z-index:10; background:#252525; padding:8px 10px; border-bottom:1px solid #444; display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
            <span style="font-size:0.85em; color:#bbb;">配置する曜日:</span>
            <label style="font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="checkbox" id="route-day-wd" ${dayConfig.wd ? 'checked' : ''}> 平日</label>
            <label style="font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="checkbox" id="route-day-sat" ${dayConfig.sat ? 'checked' : ''}> 土曜</label>
            <label style="font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="checkbox" id="route-day-sun" ${dayConfig.sun ? 'checked' : ''}> 日祝</label>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:8px; padding:10px;">
            ${staffList.map(s => {
                const wdCaps = s.capabilities || [];
                const satCaps = s.satCapabilities || wdCaps;
                const sunCaps = s.sunCapabilities || wdCaps;

                const checked = { wd: wdCaps.includes(route.id) ? 'checked' : '', sat: satCaps.includes(route.id) ? 'checked' : '', sun: sunCaps.includes(route.id) ? 'checked' : '' };
                const cell = (type, label) => `<label class="day-col-${type}" style="font-size:0.68em; color:#bbb; flex-direction:column; align-items:center; gap:2px; cursor:pointer; display:${dayConfig[type] ? 'flex' : 'none'};">${label}<input type="checkbox" class="route-staff-${type}" data-sid="${s.id}" ${checked[type]}></label>`;

                return `
                <div style="border:1px solid #3a3a3a; border-radius:6px; padding:6px 8px; background:#2a2a2a;">
                    <div style="font-size:0.85em; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.name}">${s.name}</div>
                    <div style="display:flex; justify-content:space-around; gap:4px; min-height:30px;">
                        ${cell('wd', '平')}
                        ${cell('sat', '土')}
                        ${cell('sun', '日')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;

    modal.classList.remove('hidden');
    list.scrollTop = 0; // 開く/移動のたびに先頭から表示

    // 配置する曜日トグル：その曜日の社員列を表示/非表示する（保存はapplyEditsで、Cancelで破棄）。
    const setDayVisible = (type, visible) => {
        list.querySelectorAll('.day-col-' + type).forEach(el => { el.style.display = visible ? 'flex' : 'none'; });
    };
    ['wd', 'sat', 'sun'].forEach(type => {
        const cb = this.container.querySelector('#route-day-' + type);
        if (cb) cb.onchange = (e) => { dayConfig[type] = e.target.checked; setDayVisible(type, e.target.checked); };
    });

    // 現在の編集を保存（保存ボタン・前後ナビ共通）：配置する曜日 + 社員capabilities。
    const applyEdits = () => {
        // 1) 配置する曜日(required)を保存。既存値(2人以上など)は保持。
        ['wd', 'sat', 'sun'].forEach(type => {
            const cur = route.required?.[reqField[type]] || 0;
            const val = dayConfig[type] ? (cur > 0 ? cur : 1) : 0;
            this.store.updateRoute(idx, 'required.' + reqField[type], val);
        });

        // 2) 社員capabilitiesを保存。非表示(=配置しない)曜日はスキップして既存データを保持する。
        const newStaffList = JSON.parse(JSON.stringify(this.store.state.staff)); // deep copy
        newStaffList.forEach(s => {
            if (!s.capabilities) s.capabilities = [];
            if (!s.satCapabilities) s.satCapabilities = [...s.capabilities];
            if (!s.sunCapabilities) s.sunCapabilities = [...s.capabilities];

            const apply = (type, capKey) => {
                if (!dayConfig[type]) return; // 非表示の曜日は変更しない
                const cb = list.querySelector(`.route-staff-${type}[data-sid="${s.id}"]`);
                if (!cb) return;
                if (cb.checked && !s[capKey].includes(route.id)) s[capKey].push(route.id);
                if (!cb.checked) s[capKey] = s[capKey].filter(c => c !== route.id);
            };
            apply('wd', 'capabilities');
            apply('sat', 'satCapabilities');
            apply('sun', 'sunCapabilities');
        });

        this.store.updateStaff(newStaffList);
    };

    // Save（保存して閉じる）。.onclick で都度上書きするため再オープンでも多重登録しない。
    const saveBtn = this.container.querySelector('#route-staff-modal-save');
    saveBtn.onclick = () => {
        applyEdits();
        modal.classList.add('hidden');
        this.updateUI();
    };

    // 前/次の担務へ：現在の編集を保存してから隣の担務を開く（ワンクリックで連続編集）。
    // 端では反対側へループする。
    const totalRoutes = this.store.state.routes.length;
    const prevBtn = this.container.querySelector('#route-staff-prev');
    const nextBtn = this.container.querySelector('#route-staff-next');
    prevBtn.onclick = () => { applyEdits(); this.openRouteStaffModal((idx - 1 + totalRoutes) % totalRoutes); };
    nextBtn.onclick = () => { applyEdits(); this.openRouteStaffModal((idx + 1) % totalRoutes); };

    // Close
    const closeBtn = this.container.querySelector('#route-staff-modal-close');
    closeBtn.onclick = () => modal.classList.add('hidden');
  }
}

