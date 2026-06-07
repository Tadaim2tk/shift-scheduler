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
            printContainer.style.width = 'max-content'; // force expansion
            printContainer.style.height = 'max-content';
            printContainer.style.overflow = 'visible';
            printContainer.style.backgroundColor = '#ffffff';
            printContainer.style.padding = '0px';
            document.body.appendChild(printContainer);

            // 2. Clone the table part (assuming elementId is the card/wrapper)
            // We want the table itself to be fully visible.
            // If elementId is the wrapper, deep clone it.
            const clone = originalElement.cloneNode(true);

            // 3. Reset Styles on Clone to force full expansion
            clone.style.width = 'max-content';
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
            
            // Auto-detect orientation based on aspect ratio
            const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
            
            // Set PDF format to match exactly the canvas pixel size to eliminate all margins
            const pdf = new jsPDF({
                orientation: orientation,
                unit: 'px',
                format: [canvas.width, canvas.height]
            });

            // Draw image filling the entire PDF page
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(fileName);

        } catch (e) {
            console.error('PDF Export Failed:', e);
            alert('PDF Export Failed: ' + e.message);
        }
    }
}
