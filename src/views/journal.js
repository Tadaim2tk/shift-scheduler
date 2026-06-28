// 相談ジャーナル (Consultation Journal)
// あなたとAIの相談内容を日付ごとに記録し続けるためのビュー。
// データは Store(localStorage) に保存し、JSON / テキストでのエクスポート・インポートに対応する。

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

export class JournalView {
    constructor() {
        this.store = window.app.store;
        this.search = '';
        this.editingId = null; // 編集中エントリのID（nullなら新規）
    }

    render() {
        const div = document.createElement('div');
        div.className = 'container';
        this.container = div;
        this.updateUI();
        return div;
    }

    // --- データ取得 ---
    getFilteredEntries() {
        const q = this.search.trim().toLowerCase();
        let entries = [...this.store.getJournal()];
        if (q) {
            entries = entries.filter(e => {
                const hay = [e.title, e.body, (e.tags || []).join(' ')].join(' ').toLowerCase();
                return hay.includes(q);
            });
        }
        // 日付の新しい順。同日は作成時刻の新しい順。
        entries.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        return entries;
    }

    updateUI() {
        const all = this.store.getJournal();
        const entries = this.getFilteredEntries();
        const editing = this.editingId ? all.find(e => e.id === this.editingId) : null;

        this.container.innerHTML = `
      <div class="header flex justify-between items-center" style="margin-bottom: 1.5rem;">
        <button class="outline" id="btn-back">← Back</button>
        <h2 style="margin:0;">💬 相談ジャーナル</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="card">
        <h3 style="margin-bottom: 0.75rem;">${editing ? '✏️ 記録を編集' : '📝 新しい相談を記録'}</h3>
        <div class="flex flex-col gap-2">
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <label class="flex flex-col gap-2" style="flex:0 0 auto;">
              <span style="font-size:0.8rem;opacity:0.8;">日付</span>
              <input type="date" id="j-date" value="${escapeHtml(editing ? editing.date : today())}">
            </label>
            <label class="flex flex-col gap-2" style="flex:1 1 200px;">
              <span style="font-size:0.8rem;opacity:0.8;">タイトル（任意）</span>
              <input type="text" id="j-title" placeholder="例: 今後のキャリアについて" value="${escapeHtml(editing ? editing.title : '')}">
            </label>
          </div>
          <label class="flex flex-col gap-2">
            <span style="font-size:0.8rem;opacity:0.8;">相談内容 / やり取り</span>
            <textarea id="j-body" rows="6" placeholder="相談したこと、AIからの返答、気づいたことなどを自由に記録してください。" style="resize:vertical;width:100%;">${escapeHtml(editing ? editing.body : '')}</textarea>
          </label>
          <label class="flex flex-col gap-2">
            <span style="font-size:0.8rem;opacity:0.8;">タグ（任意・カンマ区切り）</span>
            <input type="text" id="j-tags" placeholder="例: 仕事, 健康, アイデア" value="${escapeHtml(editing ? (editing.tags || []).join(', ') : '')}">
          </label>
          <div class="flex gap-2" style="margin-top:0.5rem;">
            <button class="primary" id="btn-save">${editing ? '更新する' : '記録する'}</button>
            ${editing ? '<button class="outline" id="btn-cancel-edit">キャンセル</button>' : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex justify-between items-center gap-2" style="flex-wrap:wrap;margin-bottom:0.75rem;">
          <input type="text" id="j-search" placeholder="🔍 キーワードで検索…" value="${escapeHtml(this.search)}" style="flex:1 1 200px;">
          <div class="flex gap-2" style="flex-wrap:wrap;">
            <button class="outline small" id="btn-export-json">⬇ JSON出力</button>
            <button class="outline small" id="btn-export-text">⬇ テキスト出力</button>
            <button class="outline small" id="btn-import">⬆ インポート</button>
            <input type="file" id="j-import-file" accept="application/json,.json" class="hidden">
          </div>
        </div>
        <div style="font-size:0.8rem;opacity:0.7;margin-bottom:0.75rem;">
          全 ${all.length} 件${this.search ? ` 中 ${entries.length} 件を表示` : ''}
        </div>
        <div id="j-list" class="flex flex-col gap-2">
          ${entries.length ? entries.map(e => this.renderEntry(e)).join('') : `<p style="opacity:0.6;text-align:center;padding:1.5rem;">${all.length ? '一致する記録がありません。' : 'まだ記録がありません。最初の相談を記録してみましょう。'}</p>`}
        </div>
      </div>
    `;

        this.bindEvents();
    }

    renderEntry(e) {
        const tags = (e.tags || []).map(t => `<span style="background:var(--hover-bg);border-radius:4px;padding:1px 6px;font-size:0.75rem;">#${escapeHtml(t)}</span>`).join(' ');
        const updated = e.updatedAt && e.updatedAt !== e.createdAt
            ? ` ・ 編集 ${escapeHtml(e.updatedAt.slice(0, 16).replace('T', ' '))}`
            : '';
        return `
      <div class="card" style="margin-bottom:0;background:var(--input-bg);">
        <div class="flex justify-between items-center gap-2" style="flex-wrap:wrap;">
          <div>
            <strong>${escapeHtml(e.date)}</strong>
            ${e.title ? ` ・ ${escapeHtml(e.title)}` : ''}
          </div>
          <div class="flex gap-2">
            <button class="outline small" data-edit="${escapeHtml(e.id)}">編集</button>
            <button class="danger small" data-delete="${escapeHtml(e.id)}">削除</button>
          </div>
        </div>
        ${e.body ? `<div style="margin-top:0.5rem;white-space:pre-wrap;word-break:break-word;">${escapeHtml(e.body)}</div>` : ''}
        ${tags ? `<div class="flex gap-2" style="margin-top:0.5rem;flex-wrap:wrap;">${tags}</div>` : ''}
        <div style="margin-top:0.5rem;font-size:0.72rem;opacity:0.5;">記録 ${escapeHtml((e.createdAt || '').slice(0, 16).replace('T', ' '))}${updated}</div>
      </div>
    `;
    }

    bindEvents() {
        const $ = sel => this.container.querySelector(sel);

        $('#btn-back').addEventListener('click', () => { window.location.hash = 'home'; });

        $('#btn-save').addEventListener('click', () => this.handleSave());
        const cancelBtn = $('#btn-cancel-edit');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { this.editingId = null; this.updateUI(); });

        const searchInput = $('#j-search');
        searchInput.addEventListener('input', (ev) => {
            this.search = ev.target.value;
            // 入力中はリストだけ更新し、フォーカスを保つ
            this.refreshList();
        });

        $('#btn-export-json').addEventListener('click', () => this.exportJson());
        $('#btn-export-text').addEventListener('click', () => this.exportText());
        $('#btn-import').addEventListener('click', () => $('#j-import-file').click());
        $('#j-import-file').addEventListener('change', (ev) => this.handleImport(ev));

        this.container.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editingId = btn.getAttribute('data-edit');
                this.updateUI();
                const ta = this.container.querySelector('#j-body');
                if (ta) ta.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
        this.container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-delete');
                if (confirm('この記録を削除しますか？この操作は元に戻せません。')) {
                    this.store.deleteJournalEntry(id);
                    if (this.editingId === id) this.editingId = null;
                    this.updateUI();
                }
            });
        });
    }

    // 検索のたびに全描画するとフォーカスが外れるため、リスト部分のみ差し替える
    refreshList() {
        const all = this.store.getJournal();
        const entries = this.getFilteredEntries();
        const list = this.container.querySelector('#j-list');
        if (list) {
            list.innerHTML = entries.length
                ? entries.map(e => this.renderEntry(e)).join('')
                : `<p style="opacity:0.6;text-align:center;padding:1.5rem;">${all.length ? '一致する記録がありません。' : 'まだ記録がありません。'}</p>`;
        }
        const counter = this.container.querySelector('#j-list')?.previousElementSibling;
        if (counter) {
            counter.textContent = `全 ${all.length} 件${this.search ? ` 中 ${entries.length} 件を表示` : ''}`;
        }
        // リスト内ボタンの再バインド
        this.container.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editingId = btn.getAttribute('data-edit');
                this.updateUI();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
        this.container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-delete');
                if (confirm('この記録を削除しますか？この操作は元に戻せません。')) {
                    this.store.deleteJournalEntry(id);
                    this.updateUI();
                }
            });
        });
    }

    handleSave() {
        const $ = sel => this.container.querySelector(sel);
        const date = $('#j-date').value || today();
        const title = $('#j-title').value;
        const body = $('#j-body').value;
        const tags = $('#j-tags').value;

        if (!body.trim() && !title.trim()) {
            alert('タイトルか相談内容のいずれかを入力してください。');
            return;
        }

        if (this.editingId) {
            this.store.updateJournalEntry(this.editingId, { date, title, body, tags });
            this.editingId = null;
        } else {
            this.store.addJournalEntry({ date, title, body, tags });
        }
        this.updateUI();
    }

    // --- エクスポート / インポート ---
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

    stamp() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }

    exportJson() {
        const data = this.store.getJournal();
        if (!data.length) { alert('出力する記録がありません。'); return; }
        const payload = { type: 'shift-scheduler-journal', version: 1, exportedAt: new Date().toISOString(), entries: data };
        this.download(`journal-${this.stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    }

    exportText() {
        const data = this.getFilteredEntries();
        if (!data.length) { alert('出力する記録がありません。'); return; }
        const text = data.map(e => {
            const head = `# ${e.date}${e.title ? ' ' + e.title : ''}`;
            const tags = (e.tags || []).length ? `\nタグ: ${e.tags.join(', ')}` : '';
            return `${head}${tags}\n\n${e.body || ''}`;
        }).join('\n\n----------------------------------------\n\n');
        this.download(`journal-${this.stamp()}.txt`, text, 'text/plain');
    }

    handleImport(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const entries = Array.isArray(parsed) ? parsed : parsed.entries;
                if (!Array.isArray(entries)) throw new Error('entries 配列が見つかりません。');
                const replace = confirm(
                    'インポート方法を選択してください。\n\n' +
                    '［OK］ 既存の記録を置き換える\n' +
                    '［キャンセル］ 既存に追加（マージ）する'
                );
                const count = this.store.importJournal(entries, replace ? 'replace' : 'merge');
                this.updateUI();
                alert(`${count} 件の記録をインポートしました。`);
            } catch (err) {
                alert('インポートに失敗しました: ' + err.message);
            } finally {
                ev.target.value = '';
            }
        };
        reader.readAsText(file);
    }
}
