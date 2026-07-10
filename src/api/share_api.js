// 共有 API クライアント。
// 本番 (Vercel) ではフロントと同一オリジンの /api/share を叩く。
// ローカル開発時のみ VITE_SHARE_API_BASE でモック等に向け先を変えられる。
const API_BASE = import.meta.env.VITE_SHARE_API_BASE || '';

export class ShareAPI {

    static normalizeCode(raw) {
        return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // 表示用: ABCD-EFGH のようにハイフンで区切る。
    static formatCode(code) {
        return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    }

    static buildShareUrl(code) {
        return `${location.origin}${location.pathname}#share/${code}`;
    }

    static async request(path, options = {}) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30000);
        let response;
        try {
            response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
        } catch (e) {
            const aborted = e && e.name === 'AbortError';
            throw new Error(aborted
                ? '通信がタイムアウトしました。電波状況を確認して、もう一度お試しください。'
                : '通信に失敗しました。電波状況を確認して、もう一度お試しください。');
        } finally {
            window.clearTimeout(timeout);
        }

        let data = null;
        try { data = await response.json(); } catch { /* JSON 以外の応答 */ }
        if (!response.ok) {
            throw new Error((data && data.message) || 'サーバーでエラーが発生しました。時間をおいてお試しください。');
        }
        return data;
    }

    // state 全体 + 表示期間を共有し、共有コードを返す。
    static async create(state, view) {
        const data = await ShareAPI.request('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, view })
        });
        if (!data || !data.code) throw new Error('共有コードの発行に失敗しました。');
        return data.code;
    }

    // 共有コードから envelope ({v, createdAt, view, state}) を取得する。
    static async fetchShare(code) {
        const normalized = ShareAPI.normalizeCode(code);
        const data = await ShareAPI.request(`/api/share?code=${encodeURIComponent(normalized)}`, { method: 'GET' });
        if (!data || !data.state) throw new Error('共有データの形式が正しくありません。');
        return data;
    }
}
