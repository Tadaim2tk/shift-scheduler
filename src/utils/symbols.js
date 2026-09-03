// 記号分類の唯一の出所(SSoT)の第一歩。
// 現状 '週休'/'非番' などの型判定は store.state.symbols のテーブルが正典だが、
// 「手動で置いた不可侵セル(希/欠/スラッシュ)」の判定だけは各所にベタ書きされ、
// しかも半角 '/' と全角 '／' の食い違いで実バグ(連勤カウント混入・上書き素通り)が出ていた。
// ここに集約して両表記を必ず同一視する。Phase②で制約全体をこの層に寄せる。

// 手動で置いた特殊状態セル。自動生成・ソルバーが上書き/改変してはいけない。
// データ上 '／'(全角) と '/'(半角) のどちらも現れうるため、両方を等価に扱う。
export const MANUAL_IMMUTABLE_SYMBOLS = ['希', '欠', '／', '/'];

// ブロックセル(スラッシュ)。全角・半角の両方を受ける。
export function isBlockedSlash(sym) {
    return sym === '／' || sym === '/';
}

// 希望休(希)・欠員(欠)・ブロック(／ // )など、手動確定で動かしてはいけない記号か。
export function isManualImmutableSymbol(sym) {
    return sym === '希' || sym === '欠' || isBlockedSlash(sym);
}
