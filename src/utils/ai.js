
export class AIService {
    constructor(store) {
        this.store = store;
        // gemini-1.5-flash: generous free tier (15 RPM, 1M TPM)
        this.model = 'gemini-1.5-flash';
    }

    async fillGaps(yearMonth, staffList, currentSchedule, constraints) {
        let apiKey = this.store.state.settings.apiKey;
        if (apiKey) apiKey = apiKey.trim();

        if (!apiKey) {
            throw new Error('API Key is missing. Please set it in Settings.');
        }
        console.log('Using API Key:', apiKey.substring(0, 4) + '...');

        // 1. Identify only the EMPTY slots (reduces context size dramatically)
        const emptySlots = this.findEmptySlots(yearMonth, staffList, currentSchedule);
        console.log(`[AI] Found ${emptySlots.length} empty slots to fill.`);

        if (emptySlots.length === 0) return [];

        // 2. Batch into chunks of 80 slots max to avoid truncation
        const BATCH_SIZE = 80;
        const allAssignments = [];
        for (let i = 0; i < emptySlots.length; i += BATCH_SIZE) {
            const batch = emptySlots.slice(i, i + BATCH_SIZE);
            const prompt = this.createPrompt(yearMonth, staffList, currentSchedule, batch);
            try {
                const response = await this.callGemini(apiKey, prompt);
                const jsonText = this.extractAndRepairJSON(response);
                const assignments = JSON.parse(jsonText);
                allAssignments.push(...assignments);
            } catch (e) {
                console.error("AI Parse/API Error (batch " + i + "):", e);
                // Don't throw - continue with remaining batches
            }
            // Brief pause between batches to avoid rate limiting
            if (i + BATCH_SIZE < emptySlots.length) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        return allAssignments;
    }

    findEmptySlots(yearMonth, staffList, currentSchedule) {
        const [y, m] = yearMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const emptySlots = [];

        staffList.forEach(s => {
            const staffSchedule = currentSchedule[s.id] || {};
            for (let d = 1; d <= daysInMonth; d++) {
                const key = String(d).padStart(2, '0');
                if (!staffSchedule[key]) {
                    emptySlots.push({ staffId: s.id, staffName: s.name, day: d });
                }
            }
        });
        return emptySlots;
    }

    createPrompt(yearMonth, staffList, currentSchedule, emptySlots) {
        const simpleStaff = staffList.map(s => ({
            id: s.id,
            name: s.name,
            caps: (s.capabilities && s.capabilities.length > 0)
                ? s.capabilities
                : ['1区', '2区', '3区', '4区', '5区', '6区', '7区', '8区', '9区', '10区', '11区', '12区', '13区'],
        }));

        // Build a compact existing-assignment summary (avoid sending full schedule JSON)
        const assignmentSummary = {};
        staffList.forEach(s => {
            const staffSched = currentSchedule[s.id] || {};
            const assigned = Object.entries(staffSched)
                .filter(([, cell]) => cell && cell.symbol)
                .map(([day, cell]) => `${parseInt(day)}:${cell.symbol}`)
                .join(',');
            if (assigned) assignmentSummary[s.id] = assigned;
        });

        return `You are a shift scheduler. Assign routes to the listed empty slots.

Staff (id, name, caps=capabilities):
${JSON.stringify(simpleStaff)}

Existing assignments (staffId -> "day:symbol,day:symbol,..."):
${JSON.stringify(assignmentSummary)}

Empty slots to fill (staffId + day): 
${JSON.stringify(emptySlots.map(s => ({ staffId: s.staffId, day: s.day })))}

Rules:
- Only assign routes from each staff's caps list
- Max 5 consecutive work days
- Use routes: 1区,2区,3区,4区,5区,6区,7区,8区,9区,10区,11区,12区,13区,混早1,混早2,混遅1,混遅2,混中1,混中2,弥彦早,弥彦遅,特早,特遅,計画,夕方区分,夕差立,1班予備,2班予備
- Off symbols: 週休, 非番

Return ONLY a valid JSON array using this exact format (no markdown):
[{"staffId":"id","day":"dd","symbol":"symbol"}]
Fill as many of the listed empty slots as possible.`;
    }

    async callGemini(apiKey, prompt, retries = 3) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        };

        for (let attempt = 0; attempt <= retries; attempt++) {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                return data.candidates[0].content.parts[0].text;
            }

            const errText = await res.text();

            // Rate limit: wait and retry
            if (res.status === 429 && attempt < retries) {
                // Try to parse retry delay from the error message
                const retryMatch = errText.match(/retry in (\d+(?:\.\d+)?)s/i);
                const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : (attempt + 1) * 8000;
                console.warn(`[AI] Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}...`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            throw new Error(`Gemini API Error: ${res.status} ${errText}`);
        }
    }

    extractAndRepairJSON(text) {
        // Strip markdown fences
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        // Try to parse as-is first
        try {
            JSON.parse(cleaned);
            return cleaned;
        } catch (_) { }

        // Try to repair truncated JSON arrays:
        // Remove trailing partial object (after the last complete '}')
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace !== -1) {
            cleaned = cleaned.substring(0, lastBrace + 1);
            // Ensure it's closed as an array
            if (cleaned.trimStart().startsWith('[') && !cleaned.trimEnd().endsWith(']')) {
                cleaned += ']';
            }
        }

        // Final repair: wrap in array if it looks like a bare object
        if (cleaned.trimStart().startsWith('{')) {
            cleaned = '[' + cleaned + ']';
        }

        return cleaned;
    }
}
