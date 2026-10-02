import type { AttemptTrigger } from '@prisma/client';

// 큐에 넣는 항목. trigger를 주지 않으면 워커가 정한다(첫 시도면 initial, 아니면 automatic)
export type QueuedDelivery = { delivery_id: bigint; trigger?: AttemptTrigger };

// 큐에서 읽은 항목. times_delivered는 이 항목이 워커에게 건네진 횟수다(처음 읽으면 1)
export type ReceivedDelivery = QueuedDelivery & { message_id: string; times_delivered: number };

// 전달할 일을 담는 큐. 인그레스·재시도 API가 넣고 워커가 읽는다.
// 바로 보낼 것은 Stream에, 나중에 보낼 것(재시도)은 시각순 대기열에 둔다
export interface DeliveryQueue {
	enqueue(items: QueuedDelivery[]): Promise<void>;
	// at 시각에 다시 보내도록 예약한다
	schedule(deliveryId: bigint, at: Date): Promise<void>;
	// 시각이 된 예약을 꺼낸다. 꺼낸 것은 예약에서 빠진다
	takeDue(now: Date, limit: number): Promise<bigint[]>;

	// 아래는 워커가 쓴다
	// 컨슈머 그룹이 없으면 만든다
	ensureGroup(): Promise<void>;
	// 새 항목을 읽는다. 없으면 blockMs까지 기다렸다 빈 배열을 준다
	read(consumer: string, count: number, blockMs: number): Promise<ReceivedDelivery[]>;
	// 읽어 간 워커가 minIdleMs 넘게 끝내지 못한 항목을 넘겨받는다(워커가 죽었거나 처리 중 오류)
	reclaim(consumer: string, minIdleMs: number, count: number): Promise<ReceivedDelivery[]>;
	// 처리가 끝난 항목을 큐에서 지운다
	ack(messageIds: string[]): Promise<void>;
}

export const DELIVERY_QUEUE = Symbol('DeliveryQueue');
