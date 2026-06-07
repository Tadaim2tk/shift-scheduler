
import Tesseract from 'tesseract.js';
import path from 'path';

const imagePath = '/Users/maruyamayuuki/.gemini/antigravity/brain/9dbc6810-4758-45a2-801d-8518da9e22be/uploaded_image_1769079076736.jpg';

console.log(`Processing ${imagePath}...`);

Tesseract.recognize(
    imagePath,
    'jpn', // Japanese
    { logger: m => console.log(m) }
).then(({ data: { text } }) => {
    console.log('--- OCR RESULT ---');
    console.log(text);
    console.log('--- END RESULT ---');
}).catch(err => {
    console.error('OCR Error:', err);
});
