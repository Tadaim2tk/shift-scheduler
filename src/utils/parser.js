export class ScheduleParser {
    constructor(staffList, symbolList) {
        this.staffList = staffList;
        this.symbolList = symbolList;
    }

    parse(text) {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const result = {
            dates: [],
            rows: [] // { staffName: string, staffId: string, symbols: string[] }
        };

        // 1. Detect Header (Dates)
        // simplistic: first row with many numbers?
        // For now, default to 1-31 if not found, or let user set it.

        // 2. Process Lines
        lines.forEach(line => {
            // Remove whitespace to make "cleaning" easier, or keep spaces?
            // Tesseract preserves spaces somewhat.
            // Strategy: Split by space, filter empty.
            const tokens = line.split(/\s+/).filter(t => t);

            if (tokens.length < 5) return; // Skip too short lines

            // Heuristic: Does the first token match a staff name?
            const potentialName = tokens[0];
            let matchedStaff = this.findBestStaffMatch(potentialName);

            if (matchedStaff) {
                // Extract symbols
                // Symbols are typically the rest of the tokens
                const symbols = tokens.slice(1);
                result.rows.push({
                    staffName: matchedStaff.name,
                    staffId: matchedStaff.id,
                    rawLine: line,
                    symbols: symbols
                });
            } else {
                // Maybe the name is in the second token? (e.g. "Line 1: Name ...")
                // Or maybe just treat as unknown row
                // result.rows.push({ staffName: '???', symbols: tokens });
            }
        });

        return result;
    }

    findBestStaffMatch(text) {
        // Levenshtein or simple inclusion check
        // Since names are short (2-4 chars), exact substring match might be best
        // "虎谷" match "虎谷 秀一"
        if (!text) return null;

        // Clean text (remove spaces, garbage)
        const clean = text.replace(/[.,\-_|\[\]]/g, '');

        return this.staffList.find(s => {
            const sName = s.name.replace(/\s+/g, '');
            return sName.includes(clean) || clean.includes(sName) || this.levenshtein(clean, sName) <= 1;
        });
    }

    levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }
}
