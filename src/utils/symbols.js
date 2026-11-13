// 手動で置いた特殊状態セル(希/欠/スラッシュ)の判定を1か所にまとめる。
// 半角 '/' と全角 '／' はデータ上どちらも現れうるため、必ず両方を同じものとして扱う。
// (片方しか見ない判定が各所にあり、ブロックセルがソルバーに固定として渡らない不具合があった)

// ブロックセル(スラッシュ)。全角・半角の両方を受ける。
export function isBlockedSlash(sym) {
    return sym === '／' || sym === '/';
}

// 希望休(希)・欠員(欠)・ブロック(／ と /)など、自動生成が動かしてはいけない記号か。
export function isManualImmutableSymbol(sym) {
    return sym === '希' || sym === '欠' || isBlockedSlash(sym);
}
