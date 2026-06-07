import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export class Exporter {
    constructor() {
    }

    async exportToPDF(elementId, fileName = 'schedule.pdf') {
        const originalElement = document.getElementById(elementId);
        if (!originalElement) {
            console.error('Element not found:', elementId);
            return;
        }

        try {
            // 1. Create a "Print Container" to render the full table off-screen
            const printContainer = document.createElement('div');
            printContainer.style.position = 'absolute';
            printContainer.style.top = '-9999px';
            printContainer.style.left = '0';
            printContainer.style.width = 'auto'; // allow expansion
            printContainer.style.height = 'auto';
            printContainer.style.overflow = 'visible';
            printContainer.style.backgroundColor = '#ffffff';
            printContainer.style.padding = '0px';
            document.body.appendChild(printContainer);

            // 2. Clone the table part (assuming elementId is the card/wrapper)
            // We want the table itself to be fully visible.
            // If elementId is the wrapper, deep clone it.
            const clone = originalElement.cloneNode(true);

            // 3. Reset Styles on Clone to force full expansion
            clone.style.width = 'auto';
            clone.style.height = 'auto';
            clone.style.maxHeight = 'none';
            clone.style.overflow = 'visible';
            clone.style.position = 'static';

            // Remove sticky headers in clone to prevent artifacts? 
            // html2canvas handles sticky better if position is static or if we capture full.
            // Let's try to reset sticky cols if they cause issues, but first just expansion.
            const stickies = clone.querySelectorAll('.sticky-col');
            stickies.forEach(el => {
                el.style.position = 'static';
            });

            // 4. Inject Title into the clone (HTML Rendering fixes Mojibake)
            const titleDiv = document.createElement('h2');
            titleDiv.innerText = '担当指定表';
            titleDiv.style.textAlign = 'center';
            titleDiv.style.marginBottom = '10px';
            titleDiv.style.fontFamily = 'serif';
            printContainer.appendChild(titleDiv);
            printContainer.appendChild(clone);

            // Wait for DOM
            await new Promise(r => setTimeout(r, 100));

            // 5. Capture with html2canvas
            const canvas = await html2canvas(printContainer, {
                scale: 2, // High res
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // 6. Cleanup
            document.body.removeChild(printContainer);

            // 7. Generate PDF
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const margin = 0;
            const availableWidth = pdfWidth - (margin * 2);
            const availableHeight = pdfHeight - (margin * 2);

            // Fit to page
            const ratio = Math.min(availableWidth / imgProps.width, availableHeight / imgProps.height);
            const w = imgProps.width * ratio;
            const h = imgProps.height * ratio;
            const x = (pdfWidth - w) / 2;
            const y = (pdfHeight - h) / 2;

            pdf.addImage(imgData, 'PNG', x, y, w, h);
            pdf.save(fileName);

        } catch (e) {
            console.error('PDF Export Failed:', e);
            alert('PDF Export Failed: ' + e.message);
        }
    }
}
