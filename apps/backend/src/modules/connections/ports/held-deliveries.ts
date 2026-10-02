// 일시 정지로 보류해 둔(held) 전달. 연결을 다시 열 때 이어서 보낸다
export interface HeldDeliveries {
	// 그 연결의 보류된 전달을 pending으로 돌리고 큐에 넣는다. 푼 수를 준다
	release(connectionId: number): Promise<number>;
}

export const HELD_DELIVERIES = Symbol('HeldDeliveries');
