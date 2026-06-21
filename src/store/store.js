export class Store {
    constructor() {
        this.state = this.getInitialState();
        this.listeners = [];
    }

    getInitialState() {
        return {
            staff: this.getInitialStaff(),
            routes: this.getInitialRoutes(),
            symbols: this.getInitialSymbols(),
            schedule: {},
            settings: {
                // 連勤上限などの制約パラメータはここを唯一の出所(single source of truth)とする。
                // constraints.js(JS検証) はこの値を参照する。
                maxConsecutiveWork: 5,   // 連続勤務の上限日数（これを超える連勤を禁止）
                weeklyShukyu: 1,         // 1週あたりの週休数
                minOffPer4Weeks: 8       // 4週あたりの最低休日数(4週8休)
            },
            daySettings: {} // { YM: { day: { extraRoutes: [] } } }
        };
    }

    getGroups() {
        return ['一斑', '二班', '内務班'];
    }

    getTitles() {
        return {
            '正社員': ['課長', '課長代理', '主任', '地域基幹', '新一般'],
            '期間雇用': ['期間雇用']
        };
    }

    getInitialStaff() {
        // 並び順・役職(title)・班(group)の初期値はユーザー指定の社員ステータス画面に合わせる。
        // 各社員のid・capabilities・特殊attributes(連勤上限/日祝不可など)は従来の既定を保持する。
        // capabilities=平日 / satCapabilities=土曜 / sunCapabilities=日祝 の担当可否。
        // スクショ(1〜13区/混早1,2/混遅1,2/混中1,2/弥彦早,遅/特早,遅/計画/夕方区分/夕差立)を反映。
        return [
            // 内務班（先頭）
            { id: '12', name: '齋藤 俊輔', attributes: { title: '課長', group: '内務班' }, capabilities: ['7区', '8区', '10区', '11区', '混早2', '混遅2', '特早', '計画'], satCapabilities: ['混早2'], sunCapabilities: [] },

            // 一斑
            { id: '1', name: '虎谷 秀一', attributes: { title: '課長代理', group: '一斑' }, capabilities: ['5区', '6区', '7区', '混早1', '混遅1', '1班予備', '2班予備', '弥彦予備'], satCapabilities: ['混遅1'], sunCapabilities: ['混遅1', '混中1'] },
            { id: '2', name: '山本 清一', attributes: { title: '主任', group: '一斑' }, capabilities: ['3区', '6区', '特早', '特遅', '弥彦予備'], satCapabilities: ['特遅'], sunCapabilities: ['特遅'] },
            { id: '3', name: '狩谷 朋紀', attributes: { title: '主任', group: '一斑' }, capabilities: ['2区', '3区', '5区', '6区', '混早1', '混遅1'], satCapabilities: ['混遅1'], sunCapabilities: ['混遅1', '混中1'] },
            { id: '4', name: '佐藤 了', attributes: { title: '主任', group: '一斑' }, capabilities: ['2区', '3区', '4区', '5区', '混早1'], satCapabilities: ['混早1'], sunCapabilities: ['混早1'] },
            { id: '32', name: '青木 豊', attributes: { title: '主任', group: '一斑' }, capabilities: ['混遅1'], satCapabilities: [], sunCapabilities: [] },
            { id: '5', name: '平出 貴一', attributes: { title: '新一般', group: '一斑' }, capabilities: ['1区', '4区', '5区', '混遅1', '特遅'], satCapabilities: ['混遅1', '特遅'], sunCapabilities: ['混遅1', '混中1', '特遅'] },
            { id: '6', name: '土田 真斗唯', attributes: { title: '新一般', group: '一斑' }, capabilities: ['1区', '4区'], satCapabilities: [], sunCapabilities: [] },
            { id: '10', name: '渋木 愛智', attributes: { title: '新一般', group: '一斑' }, capabilities: ['3区', '5区', '6区', '混遅1'], satCapabilities: ['混遅1'], sunCapabilities: ['混遅1', '混中1'] },
            { id: '7', name: '笹川 巧', attributes: { title: '期間雇用', group: '一斑' }, capabilities: ['1区', '2区', '4区', '特早', '特遅', '1班予備', '2班予備', '弥彦予備'], satCapabilities: ['特早', '特遅'], sunCapabilities: ['特早', '特遅'] },
            { id: '8', name: '渡邉 祐司', attributes: { title: '期間雇用', group: '一斑' }, capabilities: ['1区', '2区', '4区', '混早1'], satCapabilities: ['混早1'], sunCapabilities: ['混早1'] },
            { id: '9', name: '相田 真吾', attributes: { title: '期間雇用', group: '一斑' }, capabilities: ['1区', '2区', '3区', '混早1'], satCapabilities: [], sunCapabilities: [] },
            { id: '31', name: '原 生吹', attributes: { title: '期間雇用', group: '一斑' }, capabilities: ['2区'], satCapabilities: [], sunCapabilities: [] },

            // 二班
            { id: '13', name: '佐藤 義之', attributes: { title: '課長代理', group: '二班' }, capabilities: ['7区', '12区', '13区', '混早2', '弥彦早'], satCapabilities: ['弥彦遅'], sunCapabilities: ['混遅2', '混中2', '弥彦遅'] },
            { id: '14', name: '藤田 義彦', attributes: { title: '主任', group: '二班' }, capabilities: ['11区', '12区', '13区', '弥彦早'], satCapabilities: ['弥彦早', '弥彦遅'], sunCapabilities: ['弥彦早'] },
            { id: '15', name: '吉川 賢人', attributes: { title: '地域基幹', group: '二班' }, capabilities: ['7区', '8区', '10区'], satCapabilities: [], sunCapabilities: [] },
            { id: '24', name: '永井 智之', attributes: { title: '新一般', group: '二班' }, capabilities: ['8区', '混早2'], satCapabilities: ['混早2'], sunCapabilities: [] },
            { id: '16', name: '丸山 主', attributes: { title: '新一般', group: '二班' }, capabilities: ['11区', '12区', '13区', '弥彦早', '特遅'], satCapabilities: ['弥彦早', '弥彦遅', '特遅'], sunCapabilities: ['弥彦早', '弥彦遅', '特遅'] },
            { id: '17', name: '丸山 優貴', attributes: { title: '新一般', group: '二班' }, capabilities: ['8区', '9区', '10区', '12区', '混早2'], satCapabilities: ['混早2'], sunCapabilities: ['混早2'] },
            { id: '18', name: '近藤 航哉', attributes: { title: '新一般', group: '二班' }, capabilities: ['6区', '7区', '8区', '10区', '混遅2'], satCapabilities: ['混遅2'], sunCapabilities: ['混遅2', '混中2'] },
            { id: '19', name: '丸山 和弘', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['11区', '13区'], satCapabilities: ['弥彦遅'], sunCapabilities: [] },
            { id: '20', name: '五十嵐 亨', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['9区', '12区', '13区', '弥彦早'], satCapabilities: ['弥彦早', '弥彦遅'], sunCapabilities: ['弥彦早', '弥彦遅'] },
            { id: '21', name: '前山 正順', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['9区', '10区', '混早2', '混遅2'], satCapabilities: ['混早2', '混遅2'], sunCapabilities: ['混遅2'] },
            { id: '23', name: '今津 大翔', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['7区', '8区', '混遅2'], satCapabilities: ['混遅2'], sunCapabilities: ['混遅2', '混中2'] },
            { id: '22', name: '長谷川 裕之', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['弥彦遅'], satCapabilities: [], sunCapabilities: [] },
            { id: '11', name: '森山 正悟', attributes: { title: '期間雇用', group: '二班' }, capabilities: ['9区'], satCapabilities: [], sunCapabilities: [] },

            // 内務班
            { id: '26', name: '吉原 和美', attributes: { title: '期間雇用', group: '内務班' }, capabilities: [], satCapabilities: [], sunCapabilities: [] },
            { id: '27', name: '時田 眞弓', attributes: { title: '期間雇用', group: '内務班' }, capabilities: [], satCapabilities: [], sunCapabilities: [] },
            { id: '28', name: '小川 莉奈', attributes: { title: '期間雇用', group: '内務班', maxConsecutiveWork: 6 }, preferredOffDays: [0], capabilities: ['夕方区分'], satCapabilities: ['夕方区分'], sunCapabilities: [] },
            { id: '29', name: '吉田 ひろみ', attributes: { title: '期間雇用', group: '内務班' }, capabilities: ['夕差立'], satCapabilities: [], sunCapabilities: [] },
            { id: '25', name: '橘 茂樹', attributes: { title: '課長', group: '内務班' }, capabilities: ['特早'], satCapabilities: ['特早'], sunCapabilities: ['特早'] },

            // 一斑（末尾）
            { id: '30', name: '神田 雅弥', attributes: { title: '地域基幹', group: '一斑' }, capabilities: ['5区'], satCapabilities: [], sunCapabilities: [] },
        ];
    }

    getInitialRoutes() {
        // 並び順・配置する曜日(required)の初期値はユーザー指定の画面に合わせる。
        // required の各値は「配置する曜日」のチェック状態に対応（1=配置, 0=なし）。
        const routes = [
            // 通区 1〜13区（平日のみ配置）
            { id: '1区', name: '1区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '2区', name: '2区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '3区', name: '3区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '4区', name: '4区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '5区', name: '5区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '6区', name: '6区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '7区', name: '7区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '8区', name: '8区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '9区', name: '9区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '10区', name: '10区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '11区', name: '11区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '12区', name: '12区', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '13区', name: '13区', required: { weekday: 1, sat: 0, sun: 0 } },

            // 予備（既定では配置なし）
            { id: '1班予備', name: '1班予備', required: { weekday: 0, sat: 0, sun: 0 } },
            { id: '2班予備', name: '2班予備', required: { weekday: 0, sat: 0, sun: 0 } },
            { id: '弥彦予備', name: '弥彦予備', required: { weekday: 0, sat: 0, sun: 0 } },

            // 混（早:全日 / 遅:平土 / 中:日祝のみ）
            { id: '混早1', name: '混早1', required: { weekday: 1, sat: 1, sun: 1 } },
            { id: '混早2', name: '混早2', required: { weekday: 1, sat: 1, sun: 1 } },
            { id: '混遅1', name: '混遅1', required: { weekday: 1, sat: 1, sun: 0 } },
            { id: '混遅2', name: '混遅2', required: { weekday: 1, sat: 1, sun: 0 } },
            { id: '混中1', name: '混中1', required: { weekday: 0, sat: 0, sun: 1 } },
            { id: '混中2', name: '混中2', required: { weekday: 0, sat: 0, sun: 1 } },

            // 弥彦（早遅とも全日）
            { id: '弥彦早', name: '弥彦早', required: { weekday: 1, sat: 1, sun: 1 } },
            { id: '弥彦遅', name: '弥彦遅', required: { weekday: 1, sat: 1, sun: 1 } },

            // 特・計画・夕方
            { id: '特早', name: '特早', required: { weekday: 1, sat: 1, sun: 1 } },
            { id: '特遅', name: '特遅', required: { weekday: 1, sat: 1, sun: 1 } },
            { id: '計画', name: '計画', required: { weekday: 1, sat: 0, sun: 0 } },
            { id: '夕方区分', name: '夕方区分', required: { weekday: 1, sat: 1, sun: 0 } },
            { id: '夕差立', name: '夕差立', required: { weekday: 1, sat: 0, sun: 0 } },
        ];
        return routes;
    }

    getInitialSymbols() {
        return [
            { symbol: '〇', canonical: 'Work', type: 'WORK', color: '#e0f2f1' },
            { symbol: '週休', canonical: 'OFF', type: 'OFF', color: '#ffaaaa' },
            { symbol: '非番', canonical: 'OFF', type: 'OFF', color: '#ddd' },
            { symbol: '年休', canonical: 'PAID_LEAVE', type: 'OFF', color: '#ffcccc' },
            { symbol: '出張(研修)', canonical: 'TRAINING', type: 'WORK', color: '#ccffcc' },
            { symbol: '通区', canonical: 'COMMUTE', type: 'WORK', color: '#ccddff' },
            { symbol: '／', canonical: 'BLOCKED', type: 'BLOCKED', color: '#e0e0e0' },
        ];
    }

    load() {
        const data = localStorage.getItem('shift-scheduler-data');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.state = { ...this.state, ...parsed };

                // Migration logic
                this.migrateSymbols();
                this.migrateRoutesRenames(); // New migration
                this.migrateStaffNames(); // Fix name typos
                this.ensureDefaults();
                this.save();
            } catch (e) {
                console.error('Failed to load state', e);
                alert('Store Load Error: ' + e.message);
                this.state = this.getInitialState();
            }
        } else {
            this.state = this.getInitialState();
            this.save();
        }
    }

    migrateRoutesRenames() {
        // We no longer ruthlessly overwrite 'this.state.routes' with the initial template
        // so users can save custom dynamic routes. Instead, we only populate if empty.
        if (!this.state.routes || this.state.routes.length === 0) {
            this.state.routes = this.getInitialRoutes();
        }

        // Remove 弥彦混 route and add 弥彦早/弥彦遅 if not present
        this.state.routes = this.state.routes.filter(r => r.id !== '弥彦混');
        if (!this.state.routes.find(r => r.id === '弥彦早')) {
            const yahikoIdx = this.state.routes.findIndex(r => r.id === '弥彦予備');
            const insertAt = yahikoIdx >= 0 ? yahikoIdx + 1 : this.state.routes.length;
            this.state.routes.splice(insertAt, 0, { id: '弥彦早', name: '弥彦早', required: { weekday: 1, sat: 1, sun: 1 } });
        }
        if (!this.state.routes.find(r => r.id === '弥彦遅')) {
            const yahikoHayaIdx = this.state.routes.findIndex(r => r.id === '弥彦早');
            const insertAt = yahikoHayaIdx >= 0 ? yahikoHayaIdx + 1 : this.state.routes.length;
            this.state.routes.splice(insertAt, 0, { id: '弥彦遅', name: '弥彦遅', required: { weekday: 1, sat: 1, sun: 1 } });
        }

        // Migrate 'required' to object format if it is a number
        this.state.routes.forEach(r => {
            if (typeof r.required === 'number') {
                r.required = { weekday: r.required, sat: r.required, sun: r.required };
            }
        });

        // 2. Update Staff Capabilities
        this.state.staff.forEach(s => {
            if (s.capabilities) {
                // Rename
                s.capabilities = s.capabilities.flatMap(c => {
                    if (c === '1予備') return ['1班予備'];
                    if (c === '2予備') return ['2班予備'];
                    if (c === '夕方') return ['夕方区分'];
                    if (c === '弥彦混') return ['弥彦早', '弥彦遅'];
                    return [c];
                });
                // Deduplicate
                s.capabilities = [...new Set(s.capabilities)];

                // Auto-Add Yahiko Spare if 2+ of 11/12/13
                const count111213 = (s.capabilities.includes('11区') ? 1 : 0) +
                    (s.capabilities.includes('12区') ? 1 : 0) +
                    (s.capabilities.includes('13区') ? 1 : 0);
                if (count111213 >= 2) {
                    if (!s.capabilities.includes('弥彦予備')) {
                        s.capabilities.push('弥彦予備');
                    }
                }
            }
        });

        // 3. Update Schedule Data
        Object.keys(this.state.schedule).forEach(ym => {
            const monthData = this.state.schedule[ym];
            Object.keys(monthData).forEach(staffId => {
                const staffData = monthData[staffId];
                Object.keys(staffData).forEach(day => {
                    const cell = staffData[day];
                    if (cell.symbol === '1予備') cell.symbol = '1班予備';
                    if (cell.symbol === '2予備') cell.symbol = '2班予備';
                    if (cell.symbol === '夕方') cell.symbol = '夕方区分';
                    if (cell.symbol === '弥彦混') cell.symbol = '弥彦早';
                });
            });
        });
    }

    migrateSymbols() {
        // Fix names
        const renameMap = {
            '休': '週休',
            '明': '非番',
            '研修': '出張(研修)'
        };
        this.state.symbols.forEach(s => {
            if (renameMap[s.symbol]) s.symbol = renameMap[s.symbol];
        });

        // Filter unwanted
        const allowed = new Set(['週休', '非番', '年休', '出張(研修)', '通区', '／', '希']);
        this.state.symbols = this.state.symbols.filter(s => allowed.has(s.symbol));

        // Deduplicate
        const uniqueSymbols = [];
        const seen = new Set();
        this.state.symbols.forEach(s => {
            if (!seen.has(s.symbol)) {
                seen.add(s.symbol);
                uniqueSymbols.push(s);
            }
        });
        this.state.symbols = uniqueSymbols;

        this.save();
    }

    deleteStaff(index) {
        this.state.staff.splice(index, 1);
        this.save();
    }

    migrateStaffNames() {
        // Fix known name typos
        const nameFixMap = {
            '丸山 圭': '丸山 主',
        };
        this.state.staff.forEach(s => {
            if (nameFixMap[s.name]) {
                s.name = nameFixMap[s.name];
            }
        });
    }

    // --- Dynamic Routes Management ---
    addRoute() {
        const newRoute = { id: '新規担務', name: '新規担務', required: { weekday: 1, sat: 1, sun: 1 } };
        this.state.routes.push(newRoute);
        this.save();
    }

    updateRoute(index, field, value) {
        if (field.startsWith('required.')) {
            const subField = field.split('.')[1];
            if (!this.state.routes[index].required || typeof this.state.routes[index].required === 'number') {
                 this.state.routes[index].required = { weekday: 0, sat: 0, sun: 0 };
            }
            this.state.routes[index].required[subField] = parseInt(value) || 0;
        } else {
            this.state.routes[index][field] = value;
        }
        // If they change the ID, we might need to cascade update capabilities, but
        // for now we trust they edit the name and required counts primarily.
        this.save();
    }

    deleteRoute(index) {
        const routeId = this.state.routes[index].id;
        // Remove from routes list
        this.state.routes.splice(index, 1);
        
        // Remove from all staff capabilities
        this.state.staff.forEach(s => {
            if (s.capabilities) {
                s.capabilities = s.capabilities.filter(c => c !== routeId);
            }
            if (s.satCapabilities) {
                s.satCapabilities = s.satCapabilities.filter(c => c !== routeId);
            }
            if (s.sunCapabilities) {
                s.sunCapabilities = s.sunCapabilities.filter(c => c !== routeId);
            }
        });
        this.save();
    }

    moveRoute(index, direction) {
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < this.state.routes.length) {
            const temp = this.state.routes[index];
            this.state.routes[index] = this.state.routes[newIndex];
            this.state.routes[newIndex] = temp;
            this.save();
        }
    }

    applyMiddayMixedDefaults() {
        const defaults = {
            '混中1': new Set(['1', '3', '5', '10']),      // 虎谷, 狩谷, 平出, 渋木
            '混中2': new Set(['13', '18', '23'])          // 佐藤義之, 近藤, 今津
        };
        const routeIds = Object.keys(defaults);

        this.state.staff.forEach(s => {
            s.capabilities = (s.capabilities || []).filter(c => !routeIds.includes(c));
            s.satCapabilities = (s.satCapabilities || []).filter(c => !routeIds.includes(c));
            s.sunCapabilities = (s.sunCapabilities || []).filter(c => !routeIds.includes(c));

            routeIds.forEach(routeId => {
                if (defaults[routeId].has(String(s.id))) {
                    s.sunCapabilities.push(routeId);
                }
            });
            s.sunCapabilities = [...new Set(s.sunCapabilities)];
        });
    }

    ensureDefaults() {
        // Re-inject defaults if missing
        const defaults = [
            { symbol: '週休', canonical: 'OFF', type: 'OFF', color: '#ffaaaa' },
            { symbol: '非番', canonical: 'OFF', type: 'OFF', color: '#ddd' },
            { symbol: '年休', canonical: 'PAID_LEAVE', type: 'OFF', color: '#ffcccc' },
            { symbol: '出張(研修)', canonical: 'TRAINING', type: 'WORK', color: '#ccffcc' },
            { symbol: '通区', canonical: 'COMMUTE', type: 'WORK', color: '#ccddff' },
            { symbol: '／', canonical: 'BLOCKED', type: 'BLOCKED', color: '#e0e0e0' },
        ];
        defaults.forEach(d => {
            if (!this.state.symbols.find(s => s.symbol === d.symbol)) {
                this.state.symbols.push(d);
            }
        });

        const defaultRoutes = this.getInitialRoutes();
        defaultRoutes.forEach(d => {
            if (!this.state.routes.find(r => r.id === d.id)) {
                this.state.routes.push(d);
            }
        });

        const staffDefaultsVersion = 'midday-mixed-2026-06-21';
        if (this.state.staffDefaultsVersion !== staffDefaultsVersion) {
            this.applyMiddayMixedDefaults();
            this.state.staffDefaultsVersion = staffDefaultsVersion;
        }
        this.save();
    }

    save() {
        localStorage.setItem('shift-scheduler-data', JSON.stringify(this.state));
        this.notify();
    }

    updateSchedule(yearMonth, schedule) {
        this.state.schedule = { ...this.state.schedule, [yearMonth]: schedule };
        this.save();
    }

    getSchedule(ym) { return this.state.schedule[ym] || {}; }

    updateStaff(list) { this.state.staff = list; this.save(); }
    updateRoutes(list) { this.state.routes = list; this.save(); }
    updateSymbols(list) { this.state.symbols = list; this.save(); }
    updateSettings(settings) { this.state.settings = { ...this.state.settings, ...settings }; this.save(); }

    // 連勤上限の解決（社員個別設定 > 全体設定）。各ロジックはこのメソッド経由で取得する。
    getMaxConsecutiveWork(staff) {
        const globalMax = this.state.settings?.maxConsecutiveWork ?? 5;
        if (staff && staff.attributes && typeof staff.attributes.maxConsecutiveWork === 'number') {
            return staff.attributes.maxConsecutiveWork;
        }
        return globalMax;
    }

    getDaySettings(ym, day) {
        if (!this.state.daySettings) return {};
        if (!this.state.daySettings[ym]) return {};
        return this.state.daySettings[ym][day] || {};
    }

    updateDaySettings(ym, day, settings) {
        if (!this.state.daySettings) this.state.daySettings = {};
        if (!this.state.daySettings[ym]) this.state.daySettings[ym] = {};
        this.state.daySettings[ym][day] = { ...this.state.daySettings[ym][day], ...settings };
        this.save();
    }

    subscribe(fn) { this.listeners.push(fn); }
    notify() { this.listeners.forEach(fn => fn(this.state)); }
}
