export class HomeView {
    render() {
        const div = document.createElement('div');
        div.className = 'container';
        div.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h1>勤務指定表ツール</h1>
        <p>勤務表の写真から自動作成、または手動で作成できます。</p>
        
        <div class="flex flex-col gap-4" style="max-width: 300px; margin: 2rem auto;">
          <button id="btn-import">📸 写真から作成</button>
          <button id="btn-manual" class="secondary">📝 手動で新規作成</button>
          <button id="btn-settings" class="outline">⚙️ 設定 (社員・記号)</button>
          <button id="btn-journal" class="outline">🧠 あなたの相棒メモ</button>
        </div>
      </div>
    `;

        div.querySelector('#btn-import').addEventListener('click', () => window.location.hash = 'import');
        div.querySelector('#btn-manual').addEventListener('click', () => window.location.hash = 'editor');
        div.querySelector('#btn-settings').addEventListener('click', () => window.location.hash = 'settings');
        div.querySelector('#btn-journal').addEventListener('click', () => window.location.hash = 'journal');

        return div;
    }
}
