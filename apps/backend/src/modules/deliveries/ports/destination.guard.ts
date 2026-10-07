// 서킷을 본 결과. half_open이면 probe가 true인 워커 하나만 보낸다. open이면 remaining_ms 뒤에 다시 본다
export type CircuitCheck = { state: 'closed' } | { state: 'half_open'; probe: boolean } | { state: 'open'; remaining_ms: number };

// 목적지 보호. 동시 전달 수 제한(세마포어)과 서킷 브레이커. 워커 여러 대가 같은 값을 봐야 해서 Valkey에 둔다
export interface DestinationGuard {
	// 동시 전달 자리를 잡는다. 자리가 없으면 null. 잡은 자리는 holdMs 뒤 저절로 풀려, 워커가 보내다 죽어도 자리가 새지 않는다
	acquire(destinationId: number, limit: number, holdMs: number): Promise<string | null>;
	release(destinationId: number, token: string): Promise<void>;
	circuit(destinationId: number): Promise<CircuitCheck>;
	// 보낸 결과를 서킷에 반영한다. 성공은 연속 실패를 지우고, 실패는 하나 더해 임계값이면 연다
	recordSuccess(destinationId: number): Promise<void>;
	recordFailure(destinationId: number): Promise<void>;
}

export const DESTINATION_GUARD = Symbol('DestinationGuard');
