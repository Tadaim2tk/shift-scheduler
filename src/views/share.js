import { ShareAPI } from '../api/share_api.js';
import { Utils } from '../utils/utils.js';

// #share/<code> で開く受け取り画面。
// リンクを開いた人が「取り込む」を押すだけで、送信者と同じ表が見られる状態にする。
export class ShareView {
    constructor(rawCode) {
        this.code = ShareAPI.normalizeCode(rawCode);
        this.store = window.app.store;
        this.envelope = null;
    }

    render() {
        const div = document.createElement('div');
        div.className = 'container';
        div.innerHTML = `
      <div class="card" style="max-width: 480px; margin: 3rem auto; text-align: center; padding: 2rem;">
        <h2 style="margin-top:0;">📥 共有されたシフト表</h2>
        <div id="share-status">読み込んでいます…</div>
        <div id="share-summary" class="hidden" style="text-align:left; background:rgba(255,255,255,0.05); border-radius:6px; padding:12px 16px; margin:1rem 0;"></div>
        <div id="share-actions" class="hidden" style="display:flex; flex-direction:column; gap:10px; max-width:300px; margin:1.5rem auto 0;">
          <button id="btn-share-import" class="primary">この端末に取り込む</button>
          <button id="btn-share-cancel" class="outline">キャンセル (ホームへ)</button>
        </div>
        <div id="share-error-actions" class="hidden" style="margin-top:1.5rem;">
          <button id="btn-share-home" class="outline">ホームへ戻る</button>
        </div>
      </div>
    `;
        return div;
    }

    onMount() {
        const status = document.getElementById('share-status');
        document.getElementById('btn-share-cancel').addEventListener('click', () => { window.location.hash = 'home'; });
        document.getElementById('btn-share-home').addEventListener('click', () => { window.location.hash = 'home'; });
        document.getElementById('btn-share-import').addEventListener('click', () => this.importShare());

        if (this.code.length !== 8) {
            this.showError('共有コードの形式が正しくありません。リンクをもう一度確認してください。');
            return;
        }

        ShareAPI.fetchShare(this.code)
            .then(envelope => {
                this.envelope = envelope;
                status.textContent = 'シフト表が届いています。内容を確認して取り込んでください。';
                this.renderSummary(envelope);
                document.getElementById('share-summary').classList.remove('hidden');
                document.getElementById('share-actions').classList.remove('hidden');
            })
            .catch(e => this.showError(e.message));
    }

    showError(message) {
        const status = document.getElementById('share-status');
        status.textContent = message;
        status.style.color = '#fbb';
        document.getElementById('share-error-actions').classList.remove('hidden');
    }

    renderSummary(envelope) {
        const summary = document.getElementById('share-summary');
        const lines = [];

        if (envelope.createdAt) {
            const d = new Date(envelope.createdAt);
            if (!isNaN(d)) {
                lines.push(`<div>共有日時: ${d.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>`);
            }
        }

        const staff = envelope.state.staff || [];
        lines.push(`<div>社員: ${staff.length}名</div>`);

        // 中身のある月だけを新しい順に表示する。(YM 形式以外のキーは表示しない)
        const schedule = envelope.state.schedule || {};
        const months = Object.keys(schedule)
            .filter(ym => /^\d{4}-\d{2}$/.test(ym))
            .filter(ym => Object.values(schedule[ym] || {}).some(days => Object.keys(days || {}).length > 0))
            .sort()
            .reverse()
            .slice(0, 6)
            .map(ym => {
                const [y, m] = ym.split('-');
                return `${y}年${parseInt(m, 10)}月`;
            });
        lines.push(`<div>シフトが入っている月: ${months.length > 0 ? months.join('、') : '(なし)'}</div>`);

        summary.innerHTML = lines.join('');
    }

    // 画面描画が innerHTML ベースのため、HTML タグを含む共有データは取り込まない。
    // (正規のシフトデータに < > が含まれることはない)
    containsHtml(value) {
        if (typeof value === 'string') return value.includes('<') || value.includes('>');
        if (Array.isArray(value)) return value.some(v => this.containsHtml(v));
        if (value && typeof value === 'object') {
            return Object.entries(value).some(([k, v]) => this.containsHtml(k) || this.containsHtml(v));
        }
        return false;
    }

    importShare() {
        if (!this.envelope) return;
        if (this.containsHtml(this.envelope.state)) {
            alert('この共有データには使用できない文字が含まれているため、取り込めません。');
            return;
        }
        const ok = confirm(
            '取り込むと、この端末に保存されている現在のシフトデータは共有された内容に置き換わります。\n' +
            '(直前のデータは自動でバックアップされます)\n\nよろしいですか？'
        );
        if (!ok) return;

        try {
            this.store.replaceState(this.envelope.state);
            // 送信者と同じ期間が最初から表示されるようにする。
            const view = this.envelope.view;
            if (view && /^\d{4}-\d{2}-\d{2}$/.test(view.startDate || '')) {
                Utils.saveCurrentStartDate(view.startDate);
            }
            if (view && Number.isInteger(view.periodDays) && view.periodDays >= 1 && view.periodDays <= Utils.MAX_PERIOD_DAYS) {
                Utils.saveCurrentPeriodDays(view.periodDays);
            }
        } catch (e) {
            alert('取り込みに失敗しました: ' + e.message);
            return;
        }

        alert('取り込みました。シフト表を表示します。');
        window.location.hash = 'editor';
    }
}
