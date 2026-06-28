// パーソナルコンテキスト（あなたの相棒メモ）
// あなたのことを気の向くままに貯めていき、いざという時にどのAIにも丸ごと
// 引き継げるようにするためのビュー。
//  - プロフィール: 型番・サイズ・好みなど「あなたの仕様」をカテゴリ付きで蓄積
//  - ログ: その日に考えたこと・買ったもの・フィードバックなどを日付ごとに記録
//  - 引き継ぎ/バックアップ: 全部を1枚の「私について(AI向け)」テキストにして
//    コピー/保存。他チャットの相談文の取り込みやJSONバックアップにも対応。
// データは Store(localStorage) に保存する。

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function stamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export class JournalView {
    constructor() {
        this.store = window.app.store;
        this.activeTab = 'profile'; // profile | log | handoff
        this.search = '';
        this.editingId = null;        // 編集中ログID
        this.editingFactId = null;    // 編集中プロフィールID
    }

    render() {
        const div = document.createElement('div');
        div.className = 'container';
        this.container = div;
        this.updateUI();
        return div;
    }

    updateUI() {
        const tab = (id, label) =>
            `<button class="${this.activeTab === id ? '' : 'outline'}" data-tab="${id}">${label}</button>`;

        this.container.innerHTML = `
      <div class="header flex justify-between items-center" style="margin-bottom: 1.25rem;">
        <button class="outline" id="btn-back">← Back</button>
        <h2 style="margin:0;">🧠 あなたの相棒メモ</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="tabs flex gap-2" style="border-bottom: 1px solid var(--border-color); margin-bottom: 1rem; flex-wrap:wrap;">
        ${tab('profile', '🪪 プロフィール')}
        ${tab('log', '📝 日々の記録')}
        ${tab('handoff', '🔄 引き継ぎ・バックアップ')}
      </div>

      <div id="tab-content"></div>
    `;

        this.container.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.getAttribute('data-tab');
                this.editingId = null;
                this.editingFactId = null;
                this.search = '';
                this.updateUI();
            });
        });

        this.container.querySelector('#btn-back').addEventListener('click', () => { window.location.hash = 'home'; });

        const content = this.container.querySelector('#tab-content');
        if (this.activeTab === 'profile') this.renderProfileTab(content);
        else if (this.activeTab === 'log') this.renderLogTab(content);
        else this.renderHandoffTab(content);
    }

    // ============================ プロフィール ============================
    renderProfileTab(root) {
        const cats = this.store.getProfileCategories();
        const all = this.store.getProfile();
        const editing = this.editingFactId ? all.find(f => f.id === this.editingFactId) : null;

        const q = this.search.trim().toLowerCase();
        let facts = [...all];
        if (q) facts = facts.filter(f => `${f.category} ${f.content}`.toLowerCase().includes(q));

        // カテゴリ順でグルーピング
        const order = cats;
        const byCat = new Map();
        facts.forEach(f => {
            const c = f.category || 'その他';
            if (!byCat.has(c)) byCat.set(c, []);
            byCat.get(c).push(f);
        });
        const sortedCats = [...byCat.keys()].sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
        });

        root.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">${editing ? '✏️ 仕様を編集' : '➕ あなたの仕様を追加'}</h3>
        <p style="font-size:0.8rem;opacity:0.7;margin-top:0;">型番・サイズ・好み・買ったもの＆感想など、思いついた事実を一行ずつ。</p>
        <div class="flex flex-col gap-2">
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <label class="flex flex-col gap-2" style="flex:0 0 auto;">
              <span style="font-size:0.8rem;opacity:0.8;">カテゴリ</span>
              <input list="cat-list" id="p-category" placeholder="持ち物・型番 など" value="${escapeHtml(editing ? editing.category : '')}">
              <datalist id="cat-list">${cats.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
            </label>
            <label class="flex flex-col gap-2" style="flex:1 1 260px;">
              <span style="font-size:0.8rem;opacity:0.8;">内容</span>
              <textarea id="p-content" rows="2" placeholder="例: 洗濯機は Panasonic NA-FA80H9（2023年購入）／靴下は25-27cm" style="resize:vertical;width:100%;">${escapeHtml(editing ? editing.content : '')}</textarea>
            </label>
          </div>
          <div class="flex gap-2">
            <button class="primary" id="p-save">${editing ? '更新する' : '追加する'}</button>
            ${editing ? '<button class="outline" id="p-cancel">キャンセル</button>' : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex justify-between items-center gap-2" style="flex-wrap:wrap;margin-bottom:0.75rem;">
          <input type="text" id="p-search" placeholder="🔍 仕様を検索…" value="${escapeHtml(this.search)}" style="flex:1 1 200px;">
          <span style="font-size:0.8rem;opacity:0.7;">全 ${all.length} 件${this.search ? ` 中 ${facts.length} 件` : ''}</span>
        </div>
        ${facts.length ? sortedCats.map(c => `
          <div style="margin-bottom:1rem;">
            <div style="font-weight:600;border-bottom:1px solid var(--border-color);padding-bottom:0.25rem;margin-bottom:0.5rem;">${escapeHtml(c)}</div>
            <div class="flex flex-col gap-2">
              ${byCat.get(c).map(f => `
                <div class="flex justify-between items-center gap-2" style="background:var(--input-bg);border-radius:6px;padding:0.5rem 0.75rem;">
                  <div style="white-space:pre-wrap;word-break:break-word;flex:1;">${escapeHtml(f.content)}</div>
                  <div class="flex gap-2">
                    <button class="outline small" data-edit-fact="${escapeHtml(f.id)}">編集</button>
                    <button class="danger small" data-del-fact="${escapeHtml(f.id)}">削除</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>`).join('')
            : `<p style="opacity:0.6;text-align:center;padding:1.5rem;">${all.length ? '一致する仕様がありません。' : 'まだ登録がありません。あなたの「仕様」を気軽に足していきましょう。'}</p>`}
      </div>
    `;

        const $ = sel => root.querySelector(sel);
        $('#p-save').addEventListener('click', () => {
            const category = $('#p-category').value;
            const contentVal = $('#p-content').value;
            if (!contentVal.trim()) { alert('内容を入力してください。'); return; }
            if (this.editingFactId) {
                this.store.updateProfileFact(this.editingFactId, { category, content: contentVal });
                this.editingFactId = null;
            } else {
                this.store.addProfileFact({ category, content: contentVal });
            }
            this.updateUI();
        });
        const pc = $('#p-cancel');
        if (pc) pc.addEventListener('click', () => { this.editingFactId = null; this.updateUI(); });

        $('#p-search').addEventListener('input', (ev) => { this.search = ev.target.value; this.renderProfileTab(root); });

        root.querySelectorAll('[data-edit-fact]').forEach(btn => btn.addEventListener('click', () => {
            this.editingFactId = btn.getAttribute('data-edit-fact');
            this.updateUI();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }));
        root.querySelectorAll('[data-del-fact]').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-del-fact');
            if (confirm('この項目を削除しますか？')) {
                this.store.deleteProfileFact(id);
                if (this.editingFactId === id) this.editingFactId = null;
                this.updateUI();
            }
        }));
    }

    // ============================ 日々の記録 ============================
    getFilteredEntries() {
        const q = this.search.trim().toLowerCase();
        let entries = [...this.store.getJournal()];
        if (q) entries = entries.filter(e =>
            [e.title, e.body, (e.tags || []).join(' ')].join(' ').toLowerCase().includes(q));
        entries.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        return entries;
    }

    renderLogTab(root) {
        const all = this.store.getJournal();
        const entries = this.getFilteredEntries();
        const editing = this.editingId ? all.find(e => e.id === this.editingId) : null;

        root.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">${editing ? '✏️ 記録を編集' : '📝 今日の記録'}</h3>
        <p style="font-size:0.8rem;opacity:0.7;margin-top:0;">考えたこと・買ったもの・感想など、気の向くままに。</p>
        <div class="flex flex-col gap-2">
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <label class="flex flex-col gap-2" style="flex:0 0 auto;">
              <span style="font-size:0.8rem;opacity:0.8;">日付</span>
              <input type="date" id="j-date" value="${escapeHtml(editing ? editing.date : today())}">
            </label>
            <label class="flex flex-col gap-2" style="flex:1 1 200px;">
              <span style="font-size:0.8rem;opacity:0.8;">タイトル（任意）</span>
              <input type="text" id="j-title" placeholder="例: 洗濯槽クリーナーを買った" value="${escapeHtml(editing ? editing.title : '')}">
            </label>
          </div>
          <label class="flex flex-col gap-2">
            <span style="font-size:0.8rem;opacity:0.8;">内容</span>
            <textarea id="j-body" rows="6" placeholder="相談したこと、買ったもの、使ってみた感想などを自由に。" style="resize:vertical;width:100%;">${escapeHtml(editing ? editing.body : '')}</textarea>
          </label>
          <label class="flex flex-col gap-2">
            <span style="font-size:0.8rem;opacity:0.8;">タグ（任意・カンマ区切り）</span>
            <input type="text" id="j-tags" placeholder="例: 買い物, 家電, 感想" value="${escapeHtml(editing ? (editing.tags || []).join(', ') : '')}">
          </label>
          <div class="flex gap-2">
            <button class="primary" id="btn-save">${editing ? '更新する' : '記録する'}</button>
            ${editing ? '<button class="outline" id="btn-cancel-edit">キャンセル</button>' : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex justify-between items-center gap-2" style="flex-wrap:wrap;margin-bottom:0.75rem;">
          <input type="text" id="j-search" placeholder="🔍 キーワードで検索…" value="${escapeHtml(this.search)}" style="flex:1 1 200px;">
          <span style="font-size:0.8rem;opacity:0.7;">全 ${all.length} 件${this.search ? ` 中 ${entries.length} 件` : ''}</span>
        </div>
        <div id="j-list" class="flex flex-col gap-2">
          ${entries.length ? entries.map(e => this.renderEntry(e)).join('')
            : `<p style="opacity:0.6;text-align:center;padding:1.5rem;">${all.length ? '一致する記録がありません。' : 'まだ記録がありません。'}</p>`}
        </div>
      </div>
    `;

        const $ = sel => root.querySelector(sel);
        $('#btn-save').addEventListener('click', () => this.handleSaveLog(root));
        const cancelBtn = $('#btn-cancel-edit');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { this.editingId = null; this.updateUI(); });
        $('#j-search').addEventListener('input', (ev) => { this.search = ev.target.value; this.renderLogTab(root); });
        this.bindEntryButtons(root);
    }

    renderEntry(e) {
        const tags = (e.tags || []).map(t => `<span style="background:var(--hover-bg);border-radius:4px;padding:1px 6px;font-size:0.75rem;">#${escapeHtml(t)}</span>`).join(' ');
        return `
      <div class="card" style="margin-bottom:0;background:var(--input-bg);">
        <div class="flex justify-between items-center gap-2" style="flex-wrap:wrap;">
          <div><strong>${escapeHtml(e.date)}</strong>${e.title ? ` ・ ${escapeHtml(e.title)}` : ''}</div>
          <div class="flex gap-2">
            <button class="outline small" data-edit="${escapeHtml(e.id)}">編集</button>
            <button class="danger small" data-delete="${escapeHtml(e.id)}">削除</button>
          </div>
        </div>
        ${e.body ? `<div style="margin-top:0.5rem;white-space:pre-wrap;word-break:break-word;">${escapeHtml(e.body)}</div>` : ''}
        ${tags ? `<div class="flex gap-2" style="margin-top:0.5rem;flex-wrap:wrap;">${tags}</div>` : ''}
      </div>`;
    }

    bindEntryButtons(root) {
        root.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
            this.editingId = btn.getAttribute('data-edit');
            this.updateUI();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }));
        root.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-delete');
            if (confirm('この記録を削除しますか？この操作は元に戻せません。')) {
                this.store.deleteJournalEntry(id);
                if (this.editingId === id) this.editingId = null;
                this.updateUI();
            }
        }));
    }

    handleSaveLog(root) {
        const $ = sel => root.querySelector(sel);
        const date = $('#j-date').value || today();
        const title = $('#j-title').value;
        const body = $('#j-body').value;
        const tags = $('#j-tags').value;
        if (!body.trim() && !title.trim()) { alert('タイトルか内容のいずれかを入力してください。'); return; }
        if (this.editingId) {
            this.store.updateJournalEntry(this.editingId, { date, title, body, tags });
            this.editingId = null;
        } else {
            this.store.addJournalEntry({ date, title, body, tags });
        }
        this.updateUI();
    }

    // ============================ 引き継ぎ・バックアップ ============================
    renderHandoffTab(root) {
        const md = this.store.buildContextMarkdown();
        const pCount = this.store.getProfile().length;
        const jCount = this.store.getJournal().length;

        root.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">🔄 他のAIに引き継ぐ</h3>
        <p style="font-size:0.85rem;opacity:0.8;margin-top:0;">
          下の「私について」テキストを丸ごとコピーして、ChatGPT / Gemini / 他のClaude など、
          どのAIの最初のメッセージにでも貼り付ければ、あなたの仕様を引き継いだ状態で会話を始められます。
          （プロフィール ${pCount} 件 ／ 記録 ${jCount} 件）
        </p>
        <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:0.75rem;">
          <button class="primary" id="btn-copy-md">📋 コピー</button>
          <button class="outline" id="btn-save-md">⬇ テキスト(.md)で保存</button>
        </div>
        <textarea id="ctx-preview" rows="14" readonly style="width:100%;resize:vertical;font-family:monospace;font-size:0.8rem;">${escapeHtml(md)}</textarea>
      </div>

      <div class="card">
        <h3 style="margin-bottom:0.5rem;">💾 バックアップ / 復元（JSON）</h3>
        <p style="font-size:0.85rem;opacity:0.8;margin-top:0;">
          別の端末・ブラウザに移すときは、JSONで書き出して読み込んでください。プロフィールと記録の両方が対象です。
        </p>
        <div class="flex gap-2" style="flex-wrap:wrap;">
          <button class="outline" id="btn-export-json">⬇ 全データをJSONで書き出し</button>
          <button class="outline" id="btn-import-json">⬆ JSONを読み込み</button>
          <input type="file" id="import-file" accept="application/json,.json" class="hidden">
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:0.5rem;">📥 他チャットの相談を取り込む</h3>
        <p style="font-size:0.85rem;opacity:0.8;margin-top:0;">
          他のAIとのやり取りや覚えておきたい相談を、ここに貼り付けて「記録に追加」すると、日々の記録として保存されます。
        </p>
        <textarea id="paste-box" rows="6" placeholder="ここに会話や相談内容を貼り付け…" style="width:100%;resize:vertical;"></textarea>
        <div class="flex gap-2" style="margin-top:0.5rem;flex-wrap:wrap;">
          <input type="text" id="paste-title" placeholder="タイトル（任意・例: ChatGPTでの相談）" style="flex:1 1 200px;">
          <button class="primary" id="btn-add-paste">記録に追加</button>
        </div>
      </div>
    `;

        const $ = sel => root.querySelector(sel);

        $('#btn-copy-md').addEventListener('click', async () => {
            const text = this.store.buildContextMarkdown();
            try {
                await navigator.clipboard.writeText(text);
                this.flash($('#btn-copy-md'), '✅ コピーしました');
            } catch (e) {
                // クリップボードAPIが使えない場合は手動コピーへ誘導
                const ta = $('#ctx-preview');
                ta.removeAttribute('readonly');
                ta.focus();
                ta.select();
                const ok = document.execCommand && document.execCommand('copy');
                ta.setAttribute('readonly', 'true');
                this.flash($('#btn-copy-md'), ok ? '✅ コピーしました' : '⚠ 手動でコピーしてください');
            }
        });

        $('#btn-save-md').addEventListener('click', () => {
            this.download(`私について-${stamp()}.md`, this.store.buildContextMarkdown(), 'text/markdown');
        });

        $('#btn-export-json').addEventListener('click', () => {
            this.download(`personal-context-${stamp()}.json`, JSON.stringify(this.store.exportAll(), null, 2), 'application/json');
        });
        $('#btn-import-json').addEventListener('click', () => $('#import-file').click());
        $('#import-file').addEventListener('change', (ev) => this.handleImportJson(ev));

        $('#btn-add-paste').addEventListener('click', () => {
            const body = $('#paste-box').value;
            const title = $('#paste-title').value;
            if (!body.trim()) { alert('取り込む内容を貼り付けてください。'); return; }
            this.store.addJournalEntry({ title: title || '取り込んだ相談', body, tags: '取り込み' });
            $('#paste-box').value = '';
            $('#paste-title').value = '';
            this.flash($('#btn-add-paste'), '✅ 追加しました');
        });
    }

    handleImportJson(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const replace = confirm(
                    'インポート方法を選択してください。\n\n' +
                    '［OK］ 既存データを置き換える\n' +
                    '［キャンセル］ 既存に追加（マージ）する'
                );
                // 旧形式(ジャーナル単体)にも対応
                let count;
                if (Array.isArray(parsed) || parsed.entries) {
                    count = this.store.importJournal(Array.isArray(parsed) ? parsed : parsed.entries, replace ? 'replace' : 'merge');
                } else {
                    count = this.store.importAll(parsed, replace ? 'replace' : 'merge');
                }
                this.updateUI();
                alert(`${count} 件を読み込みました。`);
            } catch (err) {
                alert('読み込みに失敗しました: ' + err.message);
            } finally {
                ev.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    // ============================ 共通ヘルパー ============================
    flash(btn, msg) {
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = msg;
        btn.disabled = true;
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
    }

    download(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
