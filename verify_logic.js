
// Mock Dependencies
const mockStore = {
    state: {
        schedule: {},
        symbols: [
            { symbol: 'WORK', type: 'WORK' },
            { symbol: 'OFF', type: 'OFF' }
        ],
        routes: []
    }
};

const constraints = {
    isOff: (sym) => sym === 'OFF' || sym === '週休',
    isWork: (sym) => sym !== 'OFF' && sym !== '週休'
};

const getPrevMonth = (ym) => {
    // Basic mock
    return '2025-12';
};

const isWorkCell = (cell) => {
    if (!cell) return false;
    if (constraints.isOff(cell.symbol)) return false;
    return true;
};

// Bi-directional Check
const getConsecutiveStreak = (staffId, day, yearMonth, schedule) => {
    // Mock getCell
    const getCell = (sid, d) => {
        const dStr = String(d).padStart(2, '0');
        return schedule[sid] ? schedule[sid][dStr] : null;
    };

    let streak = 1; // The current day being placed

    // 1. Look Backward
    for (let d = day - 1; d >= 1; d--) {
        const cell = getCell(staffId, d);
        if (isWorkCell(cell)) streak++;
        else break;
    }

    // Prev Month Mock
    if (day - streak === 0) {
        // If we reached day 1, check prev month
        if (mockStore.state.schedule['2025-12'] && mockStore.state.schedule['2025-12'][staffId]) {
            // Mocking prev month has 31 days
            for (let pd = 31; pd >= 1; pd--) {
                const dStr = String(pd).padStart(2, '0');
                const cell = mockStore.state.schedule['2025-12'][staffId][dStr];
                if (isWorkCell(cell)) streak++;
                else break;
            }
        }
    }

    // 2. Look Forward (assuming daysInMonth=31)
    for (let d = day + 1; d <= 31; d++) {
        const cell = getCell(staffId, d);
        if (isWorkCell(cell)) streak++;
        else break;
    }

    return streak;
};

// === TESTS ===
const run = () => {
    console.log("Running Global CSP Logic Verification...");
    const staffId = '1';
    const ym = '2026-01';

    // Test 1: Insert middle (Gap Fill)
    // [Work] [Work] [Target] [Work] [Work]
    // Streak should be 5.
    const s1 = {
        '1': {
            '01': { symbol: 'WORK' },
            '02': { symbol: 'WORK' },
            // 03 is Target
            '04': { symbol: 'WORK' },
            '05': { symbol: 'WORK' }
        }
    };
    const c1 = getConsecutiveStreak(staffId, 3, ym, s1);
    console.log(`Test 1 (Middle Insert): Expected 5, Got ${c1}`);
    if (c1 !== 5) throw new Error("Test 1 Failed");

    // Test 2: Insert Start (Boundary)
    // Prev Month 2 days work. Current Day 1 Target. Day 2 Work.
    // Total = 2 (prev) + 1 (curr) + 1 (next) = 4.
    mockStore.state.schedule['2025-12'] = {
        '1': {
            '30': { symbol: 'WORK' },
            '31': { symbol: 'WORK' }
        }
    };
    const s2 = {
        '1': {
            '02': { symbol: 'WORK' }
        }
    };
    const c2 = getConsecutiveStreak(staffId, 1, ym, s2);
    console.log(`Test 2 (Boundary): Expected 4, Got ${c2}`);
    if (c2 !== 4) throw new Error("Test 2 Failed");

    // Test 3: Isolated placement
    // No work around. Streak 1.
    const s3 = { '1': {} };
    const c3 = getConsecutiveStreak(staffId, 10, ym, s3);
    console.log(`Test 3 (Isolated): Expected 1, Got ${c3}`);
    if (c3 !== 1) throw new Error("Test 3 Failed");

    console.log("ALL TESTS PASSED.");
};

run();
