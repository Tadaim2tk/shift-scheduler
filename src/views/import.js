import Tesseract from 'tesseract.js';

export class ImportView {
    constructor() {
        this.step = 1; // 1: Upload, 2: Crop/Rotate, 3: OCR/Verify
        this.image = null;
        this.canvas = null;
        this.ctx = null;
    }

    render() {
        this.container = document.createElement('div');
        this.container.className = 'container';
        this.updateUI();
        return this.container;
    }

    updateUI() {
        this.container.innerHTML = `
      <div class="header" style="margin-bottom: 1rem;">
        <button class="outline" onclick="window.history.back()">← Cancel</button>
        <h2>Import Schedule (Step ${this.step}/3)</h2>
      </div>
      <div class="content">
        ${this.renderStepContent()}
      </div>
    `;

        this.attachListeners();
    }

    renderStepContent() {
        if (this.step === 1) {
            return `
        <div class="card" style="text-align: center; padding: 3rem;">
          <h3>Upload Schedule Photo</h3>
          <p>Take a photo of the paper schedule and upload it here.</p>
          <input type="file" id="file-upload" accept="image/*" style="display: none;">
          <button id="btn-select-file" style="margin-top: 1rem;">Select Image</button>
        </div>
      `;
        } else if (this.step === 2) {
            return `
        <div class="card">
          <h3>Adjust Image</h3>
          <p>Rotate if needed.</p>
          <div style="margin-bottom: 1rem;">
            <button id="btn-rotate">↻ Rotate 90°</button>
            <button id="btn-process">Next: Read Text (OCR) →</button>
          </div>
          <div style="overflow: auto; max-height: 60vh; border: 1px solid #ccc;">
            <canvas id="img-canvas"></canvas>
          </div>
        </div>
      `;
        } else if (this.step === 3) {
            return `
        <div class="card">
          <h3>Processing...</h3>
          <p id="ocr-status">Initializing OCR engine...</p>
          <progress id="ocr-progress" value="0" max="100" style="width: 100%"></progress>
        </div>
      `;
        } else if (this.step === 4) {
            return `
        <div class="card">
          <h3>Verify & Edit (Step 4/4)</h3>
          <p>We found the following rows. Please correct any misrecognized names.</p>
          
          <div style="margin-bottom: 1rem;">
             <label>Start Date (approx): <input type="number" id="start-day" value="25" style="width: 50px;"> ~ End</label>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #ddd;">
                <th>Staff</th>
                <th>Detected Symbols (First 10)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${this.parsedResult.rows.map((row, idx) => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td>
                    <select class="verify-staff-select" data-idx="${idx}">
                      ${window.app.store.state.staff.map(s =>
                `<option value="${s.id}" ${s.id === row.staffId ? 'selected' : ''}>${s.name}</option>`
            ).join('')}
                      <option value="ignore">-- Ignore --</option>
                    </select>
                  </td>
                  <td style="font-family: monospace; font-size: 0.9em; color: #555;">
                    ${row.symbols.slice(0, 10).join(' ')} ...
                  </td>
                  <td>
                    <button class="small danger" onclick="this.parentElement.parentElement.remove()">x</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 2rem; text-align: right;">
             <button id="btn-finish-import">Finish & Open Editor</button>
          </div>
        </div>
      `;
        }
    }

    attachListeners() {
        if (this.step === 1) {
            const fileInput = this.container.querySelector('#file-upload');
            const selectBtn = this.container.querySelector('#btn-select-file');

            selectBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        } else if (this.step === 2) {
            this.container.querySelector('#btn-rotate').addEventListener('click', () => this.rotateImage());
            this.container.querySelector('#btn-process').addEventListener('click', () => this.startOCR());

            // Draw canvas
            requestAnimationFrame(() => this.drawImage());
        } else if (this.step === 4) {
            this.container.querySelector('#btn-finish-import').addEventListener('click', () => {
                this.finishImport();
            });
        }
    }

    finishImport() {
        const startDayInput = this.container.querySelector('#start-day');
        const startDay = parseInt(startDayInput ? startDayInput.value : 25);

        // Determine Year/Month (rough guess: next month)
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-12
        const key = `${year}-${String(month).padStart(2, '0')}`;

        const scheduleData = {}; // { staffId: { dayStr: cell } }

        // Iterate over verification rows
        const rows = this.container.querySelectorAll('tbody tr');
        rows.forEach((tr, index) => {
            const select = tr.querySelector('select');
            const staffId = select.value;
            if (staffId === 'ignore') return;

            const rawRow = this.parsedResult.rows[index];
            if (!rawRow) return;

            const staffSchedule = {};

            // Map symbols to days starting from startDay
            let currentDay = startDay;
            // E.g. 25, 26, ... end of month, 1, 2...
            // Complex date logic omitted for brevity, assuming simple linear for prototype
            // TODO: Handle month crossing properly

            rawRow.symbols.forEach((sym, i) => {
                if (i > 35) return; // Safety limit
                const dayStr = String(currentDay).padStart(2, '0'); // Just using day number for now in logic

                // Find matching symbol object
                const symbolObj = window.app.store.state.symbols.find(s => s.symbol === sym) || { symbol: sym, type: 'UNKNOWN' };

                staffSchedule[dayStr] = {
                    symbol: sym,
                    type: symbolObj.type || 'UNKNOWN',
                    locked: false
                };

                currentDay++;
                // Reset if > 31? Simply increments for now. 
                // In real app, we need Year/Month context for each cell
            });

            scheduleData[staffId] = staffSchedule;
        });

        window.app.store.updateSchedule(key, scheduleData);
        alert('Imported to ' + key);
        window.location.hash = 'editor';
    }

    handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.step = 2;
                this.updateUI();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    rotateImage() {
        if (!this.image) return;
        const canvas = document.createElement('canvas');
        canvas.width = this.image.height;
        canvas.height = this.image.width;
        const ctx = canvas.getContext('2d');

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(90 * Math.PI / 180);
        ctx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);

        const newImg = new Image();
        newImg.onload = () => {
            this.image = newImg;
            this.drawImage();
        };
        newImg.src = canvas.toDataURL();
    }

    drawImage() {
        const canvas = this.container.querySelector('#img-canvas');
        if (!canvas || !this.image) return;

        // Scale down for display if too large
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / this.image.width);

        canvas.width = this.image.width * scale;
        canvas.height = this.image.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.image, 0, 0, canvas.width, canvas.height);
    }

    async startOCR() {
        this.step = 3;
        this.updateUI();

        const statusEl = this.container.querySelector('#ocr-status');
        const progressEl = this.container.querySelector('#ocr-progress');

        try {
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        progressEl.value = m.progress * 100;
                        statusEl.textContent = `Reading text... ${Math.round(m.progress * 100)}%`;
                    } else {
                        statusEl.textContent = m.status;
                    }
                }
            });

            await worker.loadLanguage('jpn');
            await worker.initialize('jpn');

            const { data: { text } } = await worker.recognize(this.image);
            await worker.terminate();

            // Parse logic
            const { ScheduleParser } = await import('../utils/parser.js');
            const parser = new ScheduleParser(
                window.app.store.state.staff,
                window.app.store.state.symbols
            );
            this.parsedResult = parser.parse(text);

            statusEl.textContent = "Done! Reviewing...";
            setTimeout(() => {
                this.step = 4;
                this.updateUI();
            }, 1000);

        } catch (e) {
            console.error(e);
            statusEl.textContent = "Error: " + e.message;
        }
    }
}
