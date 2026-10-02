// 전달 워커(8. delivery)가 읽는 큐. 인그레스는 넣기만 한다
export interface DeliveryQueue {
	enqueue(deliveryIds: bigint[]): Promise<void>;
}

export const DELIVERY_QUEUE = Symbol('DeliveryQueue');
