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
                consecutiveLimit: 5,
                apiKey: '***REMOVED-GEMINI-KEY***'
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
        return [
            { id: '1', name: '虎谷 秀一', attributes: { title: '課長', group: '一斑' }, capabilities: ['1区', '2区', '3区', '混早1', '混早2', '1班予備', '2班予備', '弥彦予備'] },
            { id: '2', name: '山本 清一', attributes: { title: '主任', group: '一斑' }, capabilities: ['3K', '5K', '6K', '特早', '特遅', '混早1', '混早2', '弥彦予備'] },
            { id: '3', name: '狩谷 朋紀', attributes: { title: '新一般' }, capabilities: [] },
            { id: '4', name: '佐藤 了', attributes: { title: '新一般' }, capabilities: [] },
            { id: '5', name: '平出 貴一', attributes: { title: '新一般' }, capabilities: [] },
            { id: '6', name: '土田 真斗唯', attributes: { title: '新一般' }, capabilities: [] },
            { id: '7', name: '笹川 巧', attributes: { title: '新一般' }, capabilities: ['1班予備', '2班予備', '弥彦予備'] },
            { id: '8', name: '渡邉 祐司', attributes: { title: '新一般' }, capabilities: [] },
            { id: '9', name: '相田 真吾', attributes: { title: '新一般' }, capabilities: [] },
            { id: '10', name: '渋木 愛智', attributes: { title: '新一般' }, capabilities: [] },
            { id: '11', name: '森山 正悟', attributes: { title: '新一般' }, capabilities: [] },
            { id: '12', name: '齋藤 俊輔', attributes: { title: '新一般' }, capabilities: [] },
            { id: '13', name: '佐藤 義之', attributes: { title: '新一般' }, capabilities: [] },
            { id: '14', name: '藤田 義彦', attributes: { title: '新一般' }, capabilities: [] },
            { id: '15', name: '吉川 賢人', attributes: { title: '新一般' }, capabilities: [] },
            { id: '16', name: '丸山 圭', attributes: { title: '新一般' }, capabilities: [] },
            { id: '17', name: '丸山 優貴', attributes: { title: '新一般' }, capabilities: [] },
            { id: '18', name: '近藤 航哉', attributes: { title: '新一般' }, capabilities: [] },
            { id: '19', name: '丸山 和弘', attributes: { title: '新一般' }, capabilities: [] },
            { id: '20', name: '五十嵐 亨', attributes: { title: '新一般' }, capabilities: [] },
            { id: '21', name: '前山 正順', attributes: { title: '新一般' }, capabilities: [] },
            { id: '22', name: '長谷川 裕之', attributes: { title: '新一般' }, capabilities: [] },
            { id: '23', name: '今津 大翔', attributes: { title: '新一般' }, capabilities: [] },
            { id: '24', name: '永井 智之', attributes: { title: '新一般' }, capabilities: [] },
            { id: '25', name: '橘 茂樹', attributes: { title: '新一般' }, capabilities: [] },
            { id: '26', name: '吉原 和美', attributes: { title: '新一般' }, capabilities: [] },
            { id: '27', name: '時田 眞弓', attributes: { title: '新一般' }, capabilities: [] },
            { id: '28', name: '小川 莉奈', attributes: { title: '新一般', maxConsecutiveWork: 6, noSunday: true }, capabilities: [] },
            { id: '29', name: '吉田 ひろみ', attributes: { title: '新一般' }, capabilities: [] },
            { id: '30', name: '神田 雅弥', attributes: { title: '新一般' }, capabilities: [] },
        ];
    }

    getInitialRoutes() {
        // User requested specific order
        const routes = [
            // Block 1
            { id: '1区', name: '1区', required: 1 },
            { id: '2区', name: '2区', required: 1 },
            { id: '3区', name: '3区', required: 1 },
            { id: '4区', name: '4区', required: 1 },
            { id: '5区', name: '5区', required: 1 },
            { id: '6区', name: '6区', required: 1 },

            // Block 2 (Group 1 Extras)
            { id: '1班予備', name: '1班予備', required: 1 }, // Renamed from 1予備
            { id: '混早1', name: '混早1', required: 1 },
            { id: '混遅1', name: '混遅1', required: 1 },
            { id: '混中1', name: '混中1', required: 1 }, // New/Enabled

            // Block 3
            { id: '7区', name: '7区', required: 1 },
            { id: '8区', name: '8区', required: 1 },
            { id: '9区', name: '9区', required: 1 },
            { id: '10区', name: '10区', required: 1 },

            // Block 4 (Group 2 Extras)
            { id: '2班予備', name: '2班予備', required: 1 }, // Renamed from 2予備
            { id: '混早2', name: '混早2', required: 1 },
            { id: '混遅2', name: '混遅2', required: 1 },
            { id: '混中2', name: '混中2', required: 1 }, // New/Enabled

            // Block 5
            { id: '11区', name: '11区', required: 1 },
            { id: '12区', name: '12区', required: 1 },
            { id: '13区', name: '13区', required: 1 },
            { id: '弥彦予備', name: '弥彦予備', required: 0 }, // Moved here
            { id: '弥彦早', name: '弥彦早', required: 1 },
            { id: '弥彦遅', name: '弥彦遅', required: 1 },

            // Block 6 (Specials)
            { id: '特早', name: '特早', required: 1 },
            { id: '特遅', name: '特遅', required: 1 },
            { id: '計画', name: '計画', required: 1 },
            { id: '夕方区分', name: '夕方区分', required: 1 }, // Renamed from 夕方
            { id: '夕差立', name: '夕差立', required: 1 },
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

                // FORCE API Key to the known working one for now to debug
                this.state.settings.apiKey = '***REMOVED-GEMINI-KEY***';
                console.log('Store: Force-loaded API Key:', this.state.settings.apiKey);

                // Migration logic
                this.migrateSymbols();
                this.migrateRoutesRenames(); // New migration
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
            this.state.routes.splice(insertAt, 0, { id: '弥彦早', name: '弥彦早', required: 1 });
        }
        if (!this.state.routes.find(r => r.id === '弥彦遅')) {
            const yahikoHayaIdx = this.state.routes.findIndex(r => r.id === '弥彦早');
            const insertAt = yahikoHayaIdx >= 0 ? yahikoHayaIdx + 1 : this.state.routes.length;
            this.state.routes.splice(insertAt, 0, { id: '弥彦遅', name: '弥彦遅', required: 1 });
        }

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

    // --- Dynamic Routes Management ---
    addRoute() {
        const newRoute = { id: '新規担務', name: '新規担務', required: 1 };
        this.state.routes.push(newRoute);
        this.save();
    }

    updateRoute(index, field, value) {
        if (field === 'required') {
            value = parseInt(value) || 0;
        }
        this.state.routes[index][field] = value;
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

