import { Generator } from './src/utils/generator.js';
import { Store } from './src/store/store.js';

// Mock dependencies
const mockStore = new Store();
mockStore.state = {
    staff: [
        { id: '1', name: 'Test Staff', capabilities: ['1区'] }
    ],
    routes: [
        { id: '1区', name: 'Route1', required: 1 }
    ],
    symbols: [
        { symbol: '〇', type: 'WORK' },
        { symbol: '週休', type: 'OFF' },
        { symbol: '1区', type: 'WORK' }
    ],
    schedule: {},
    settings: {
        consecutiveLimit: 5
    }
};

const generator = new Generator(mockStore);

// Test Case 1: 5 Consecutive Days -> 6th Day Check
console.log('--- Test Case 1: Consecutive Work ---');
const staffId = '1';
const ym = '2026-01';

// Manually set 1st-5th as WORK
if (!mockStore.state.schedule[ym]) mockStore.state.schedule[ym] = {};
if (!mockStore.state.schedule[ym][staffId]) mockStore.state.schedule[ym][staffId] = {};

[1, 2, 3, 4, 5].forEach(d => {
    const dayStr = String(d).padStart(2, '0');
    mockStore.state.schedule[ym][staffId][dayStr] = { symbol: '1区', type: 'WORK' };
});

// Mock helpers
const getCell = (sid, d) => {
    const dayStr = String(d).padStart(2, '0');
    return mockStore.state.schedule[ym][sid][dayStr];
};
const getConsecutiveWork = (sid, currentDay) => {
    let count = 0;
    for (let d = currentDay - 1; d >= 1; d--) {
        const cell = getCell(sid, d);
        // Copy logic from generator.js
        if (cell && cell.type !== 'OFF' && cell.symbol !== '希' && cell.symbol !== '欠') {
            count++;
        } else {
            break;
        }
    }
    return count;
};

// Check Day 6
const day6 = 6;
const count = getConsecutiveWork(staffId, day6);
console.log(`Consecutive Limit: ${mockStore.state.settings.consecutiveLimit}`);
console.log(`Days 1-5 Work. Day 6 Consecutive Count (Expected 5): ${count}`);

const isValid = generator.isValidAssignment(
    mockStore.state.staff[0],
    day6,
    '1区',
    getCell,
    getConsecutiveWork,
    5, // limit
    false, // sat
    false  // sun
);
console.log(`isValidAssignment for Day 6 (Expected false): ${isValid}`);

// Test Case 2: 4 Consecutive Days -> 5th Day Check
console.log('\n--- Test Case 2: 4 Days Work ---');
// Clear Day 1
mockStore.state.schedule[ym][staffId]['01'] = { symbol: '週休', type: 'OFF' };
// Now 2,3,4,5 are Work (4 days)
// Check Day 6
const count2 = getConsecutiveWork(staffId, day6);
console.log(`Days 2-5 Work. Day 6 Consecutive Count (Expected 4): ${count2}`);
const isValid2 = generator.isValidAssignment(
    mockStore.state.staff[0],
    day6,
    '1区',
    getCell,
    getConsecutiveWork,
    5,
    false,
    false
);
console.log(`isValidAssignment for Day 6 (Expected true): ${isValid2}`);
