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
          
          <div style="margin-bottom: 1rem;">
            <label style="font-weight:bold;">Gemini API Key: </label>
            <input type="password" id="sys-api-key" value="${this.store.state.settings.apiKey || ''}" style="width: 300px;" placeholder="Paste Gemini API Key here...">
            <button id="btn-save-key" class="primary small" style="margin-left: 10px;">Save Key</button>
          </div>

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

    // API Key Save
    const keyInput = this.container.querySelector('#sys-api-key');
    this.container.querySelector('#btn-save-key').onclick = (e) => {
      this.store.updateSettings({ apiKey: keyInput.value });
      const btn = e.target;
      const originalText = btn.innerText;
      btn.innerText = 'Saved!';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
      }, 1500);
    };

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
            <h3>Staff List (${staff.length})</h3>
            <button id="btn-add-staff" class="secondary">+ Add</button>
          </div>
          <textarea id="staff-bulk-input" class="w-100" rows="5" placeholder="Paste names here (one per line) to bulk add..."></textarea>
          <button id="btn-bulk-add" style="margin-top: 5px;">Bulk Add Names</button>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 2px solid #ddd;">
                <th>Name</th>
                <th>Title (役職)</th>
                <th>Group (斑)</th>
                <th>Allowed Routes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
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
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px;">
                    <input type="text" value="${s.name}" data-idx="${idx}" class="staff-name-input" style="width: 100%;">
                  </td>
                  <td>
                    <select data-idx="${idx}" class="staff-title-input">
                      ${renderOptions()}
                    </select>
                  </td>
                  <td>
                    <select data-idx="${idx}" class="staff-group-input">
                       <option value="">(None)</option>
                       ${this.store.getGroups().map(g => `<option value="${g}" ${s.attributes?.group === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <button class="small outline" onclick="window.app.settings.openCapabilityModal(${idx})">
                        ${s.capabilities && s.capabilities.length > 0 ? s.capabilities.length + ' routes' : 'Set Routes'}
                    </button>
                  </td>
                  <td>
                    <button class="danger small" data-idx="${idx}" onclick="window.app.settings.deleteStaff(${idx})">🗑️</button>
                    ${idx > 0 ? `<button class="small outline" onclick="window.app.settings.moveStaff(${idx}, -1)">↑</button>` : ''}
                    ${idx < staff.length - 1 ? `<button class="small outline" onclick="window.app.settings.moveStaff(${idx}, 1)">↓</button>` : ''}
                  </td>
                </tr>
              `;
      }).join('')}
            </tbody>
          </table>
          
          <!-- Modal for Capabilities -->
          <div id="cap-modal" class="modal hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;">
            <div class="card" style="min-width:300px; max-height: 80vh; overflow-y: auto;">
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
                        <th>ID (Key)</th>
                        <th>Display Name</th>
                        <th>Required Default</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${routes.map((r, idx) => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px;">
                                <input class="route-input" data-field="id" data-idx="${idx}" value="${r.id}" style="width:100%;">
                            </td>
                            <td>
                                <input class="route-input" data-field="name" data-idx="${idx}" value="${r.name}" style="width:100%;">
                            </td>
                            <td>
                                <input class="route-input" data-field="required" data-idx="${idx}" type="number" value="${r.required}" style="width:60px;">
                            </td>
                            <td>
                                <button class="danger small" onclick="window.app.store.deleteRoute(${idx}); window.app.settings.updateUI();">🗑️</button>
                                ${idx > 0 ? `<button class="small outline" onclick="window.app.store.moveRoute(${idx}, -1); window.app.settings.updateUI();">↑</button>` : ''}
                                ${idx < routes.length - 1 ? `<button class="small outline" onclick="window.app.store.moveRoute(${idx}, 1); window.app.settings.updateUI();">↓</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
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
          const idx = parseInt(btn.dataset.idx);
          const staff = [...this.store.state.staff];
          staff.splice(idx, 1);
          this.store.updateStaff(staff);
          this.updateUI();
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
          this.store.updateRoute(idx, field, e.target.value);
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

    const renderColumn = (label, set, suffix) => `
        <div style="border:1px solid #444; padding:0.5rem; border-radius:4px; flex:1;">
            <h4 style="margin-bottom:0.5rem; border-bottom:1px solid #555; font-size: 0.9em;">${label}</h4>
            <div style="display:flex; flex-direction:column; gap:4px; max-height:300px; overflow-y:auto;">
                ${allRoutes.map(r => `
                    <label style="display:flex; align-items:center; gap: 5px; font-size:0.85em;">
                        <input type="checkbox" class="cap-cb-${suffix}" value="${r.id}" ${set.has(r.id) ? 'checked' : ''}>
                        ${r.id}
                    </label>
                `).join('')}
            </div>
        </div>
    `;

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

        <div style="display:flex; gap:0.5rem; min-width: 500px;">
            ${renderColumn('平日 (Weekday)', allowed, 'weekday')}
            ${renderColumn('土曜 (Saturday)', allowedSat, 'sat')}
            ${renderColumn('日祝 (Sun/Hol)', allowedSun, 'sun')}
        </div>
    `;

    modal.classList.remove('hidden');

    // Save Listener
    const saveBtn = this.container.querySelector('#cap-modal-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', () => {
      const weekdayCB = list.querySelectorAll('.cap-cb-weekday:checked');
      const satCB = list.querySelectorAll('.cap-cb-sat:checked');
      const sunCB = list.querySelectorAll('.cap-cb-sun:checked');
      const offDayCB = list.querySelectorAll('.off-day-cb:checked');

      const newCapabilities = Array.from(weekdayCB).map(cb => cb.value);
      const newSatCapabilities = Array.from(satCB).map(cb => cb.value);
      const newSunCapabilities = Array.from(sunCB).map(cb => cb.value);
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
}

