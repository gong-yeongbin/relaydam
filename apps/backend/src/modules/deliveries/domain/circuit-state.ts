// 서킷 브레이커. 목적지가 연속으로 이만큼 실패하면 60초 동안 보내지 않는다(plan.md 핵심 설계 결정 5)
export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_OPEN_MS = 60_000;

// closed: 보낸다. open: 열린 시간이 끝날 때까지 보내지 않는다. half_open: 1건만 보내 봐서 성공하면 닫고 실패하면 다시 연다
export type CircuitState = 'closed' | 'open' | 'half_open';

// 상태는 저장하지 않고 두 값에서 읽어 낸다. failures는 연속 실패 수, open_remaining_ms는 열려 있는 남은 시간(0이면 열려 있지 않음)
export function circuitState(snapshot: { failures: number; open_remaining_ms: number }): CircuitState {
	if (snapshot.open_remaining_ms > 0) return 'open';
	return snapshot.failures >= CIRCUIT_FAILURE_THRESHOLD ? 'half_open' : 'closed';
}

// 실패한 뒤 연속 실패 수가 failures가 됐을 때 몇 ms 열어 둘지. 0이면 열지 않는다.
// half_open 프로브가 실패하면 failures가 임계값을 넘어 있으므로 다시 연다
export function openAfterFailure(failures: number): number {
	return failures >= CIRCUIT_FAILURE_THRESHOLD ? CIRCUIT_OPEN_MS : 0;
}
