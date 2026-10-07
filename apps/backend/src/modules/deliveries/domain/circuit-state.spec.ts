import { CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_OPEN_MS, circuitState, openAfterFailure } from './circuit-state';

describe('서킷 상태 머신', () => {
	it('연속 실패가 5회 미만이면 closed다', () => {
		expect(circuitState({ failures: 0, open_remaining_ms: 0 })).toBe('closed');
		expect(circuitState({ failures: 4, open_remaining_ms: 0 })).toBe('closed');
	});

	it('5회째 실패에 60초 열린다. 그 전에는 열지 않는다', () => {
		expect(openAfterFailure(4)).toBe(0);
		expect(openAfterFailure(CIRCUIT_FAILURE_THRESHOLD)).toBe(CIRCUIT_OPEN_MS);
	});

	it('열린 시간이 남아 있으면 open이다', () => {
		expect(circuitState({ failures: 5, open_remaining_ms: 30_000 })).toBe('open');
		expect(circuitState({ failures: 5, open_remaining_ms: 1 })).toBe('open');
	});

	it('열린 시간이 끝났는데 연속 실패가 그대로면 half_open이다(프로브 1건)', () => {
		expect(circuitState({ failures: 5, open_remaining_ms: 0 })).toBe('half_open');
		expect(circuitState({ failures: 7, open_remaining_ms: 0 })).toBe('half_open');
	});

	it('프로브가 실패하면 다시 60초 연다', () => {
		expect(openAfterFailure(6)).toBe(CIRCUIT_OPEN_MS);
	});

	it('성공해서 연속 실패가 0이 되면 closed다', () => {
		expect(circuitState({ failures: 0, open_remaining_ms: 0 })).toBe('closed');
	});
});
