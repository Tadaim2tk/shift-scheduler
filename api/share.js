import crypto from 'node:crypto';
import { put, list } from '@vercel/blob';

// 紛らわしい文字 (I/L/O/0/1) を除いたコード用文字セット。
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
// 数年分のスケジュールを含む全量 state でも十分収まる上限。
const MAX_PAYLOAD_BYTES = 3_000_000;

// 共有専用ストア (shift-scheduler-shares) はプレフィックス SHARE_BLOB で接続している。
// 標準名 BLOB_READ_WRITE_TOKEN の接続に切り替えた場合もそのまま動くよう両対応。
function blobToken() {
    return process.env.SHARE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
}

function generateCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    return code;
}

function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sendJson(res, status, obj) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(obj);
}

function applyCors(res) {
    // データはコードを知る人しか取得できないため、開発時の利便を優先して全許可。
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
    applyCors(res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (!blobToken()) {
        sendJson(res, 503, {
            error: 'storage_not_configured',
            message: '共有ストレージが未設定です。管理者が Vercel で Blob ストアを作成すると使えるようになります。'
        });
        return;
    }

    try {
        if (req.method === 'POST') {
            await handleCreate(req, res);
        } else if (req.method === 'GET') {
            await handleFetch(req, res);
        } else {
            sendJson(res, 405, { error: 'method_not_allowed', message: '許可されていないメソッドです。' });
        }
    } catch (e) {
        console.error('share api error:', e);
        sendJson(res, 500, { error: 'internal', message: 'サーバー内部でエラーが発生しました。時間をおいてお試しください。' });
    }
}

async function handleCreate(req, res) {
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = null; }
    }
    const state = body && body.state;
    if (!state || typeof state !== 'object' || !Array.isArray(state.staff) || typeof state.schedule !== 'object') {
        sendJson(res, 400, { error: 'invalid_payload', message: '共有データの形式が正しくありません。' });
        return;
    }

    const view = body.view && typeof body.view === 'object'
        ? {
            startDate: /^\d{4}-\d{2}-\d{2}$/.test(body.view.startDate || '') ? body.view.startDate : undefined,
            periodDays: Number.isInteger(body.view.periodDays) ? body.view.periodDays : undefined
        }
        : undefined;

    const envelope = {
        v: 1,
        createdAt: new Date().toISOString(),
        view,
        state
    };
    const json = JSON.stringify(envelope);
    if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
        sendJson(res, 413, { error: 'too_large', message: '共有データが大きすぎます。' });
        return;
    }

    // コード衝突時 (allowOverwrite: false が例外を投げる) は新しいコードでやり直す。
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
            await put(`shares/${code}.json`, json, {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: false,
                contentType: 'application/json',
                token: blobToken()
            });
            sendJson(res, 200, { code });
            return;
        } catch (e) {
            lastError = e;
            const msg = String(e && e.message || '');
            if (!/exist|conflict/i.test(msg)) throw e;
        }
    }
    throw lastError;
}

async function handleFetch(req, res) {
    const code = normalizeCode(req.query && req.query.code);
    if (code.length !== CODE_LENGTH) {
        sendJson(res, 400, { error: 'invalid_code', message: '共有コードの形式が正しくありません。' });
        return;
    }

    const pathname = `shares/${code}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1, token: blobToken() });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) {
        sendJson(res, 404, { error: 'not_found', message: '共有が見つかりません。コードが正しいか確認してください。' });
        return;
    }

    const upstream = await fetch(blob.url);
    if (!upstream.ok) {
        sendJson(res, 500, { error: 'storage_read_failed', message: '共有データの読み込みに失敗しました。' });
        return;
    }
    const envelope = await upstream.json();
    sendJson(res, 200, envelope);
}
