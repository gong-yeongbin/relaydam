import { Inject, Injectable, type OnModuleDestroy, Optional } from '@nestjs/common';
import type { AttemptTrigger } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import type { DeliveryQueue, QueuedDelivery, ReceivedDelivery } from '../ports/delivery.queue';

// 바로 보낼 전달. 컨슈머 그룹으로 읽는다. 항목은 delivery_id와 (있으면) trigger다
export const DELIVERY_STREAM = 'delivery';
export const DELIVERY_GROUP = 'delivery-workers';
// 나중에 보낼 전달(재시도). 점수가 보낼 시각(ms), 멤버가 delivery id인 정렬 집합이다
export const DELIVERY_SCHEDULED = 'delivery:scheduled';

// 키 이름. 테스트가 서로 섞이지 않게 다른 이름을 줄 수 있다. 운영에서는 기본값을 쓴다
export type DeliveryQueueKeys = { stream: string; group: string; scheduled: string };
export const DELIVERY_QUEUE_KEYS = Symbol('DeliveryQueueKeys');
const DEFAULT_KEYS: DeliveryQueueKeys = { stream: DELIVERY_STREAM, group: DELIVERY_GROUP, scheduled: DELIVERY_SCHEDULED };

type StreamEntry = [id: string, fields: string[]];

function toReceived([message_id, fields]: StreamEntry, timesDelivered: number): ReceivedDelivery {
	const values = new Map<string, string>();
	for (let i = 0; i < fields.length; i += 2) values.set(fields[i] ?? '', fields[i + 1] ?? '');
	const trigger = values.get('trigger');
	return { message_id, delivery_id: BigInt(values.get('delivery_id') ?? '0'), trigger: trigger as AttemptTrigger | undefined, times_delivered: timesDelivered };
}

@Injectable()
export class ValkeyDeliveryQueue implements DeliveryQueue, OnModuleDestroy {
	// XREADGROUP BLOCK은 기다리는 동안 연결을 붙잡는다. 다른 명령이 막히지 않게 읽기 전용 연결을 따로 둔다
	private reader: Redis | undefined;

	private readonly keys: DeliveryQueueKeys;

	constructor(
		private readonly valkey: ValkeyService,
		@Optional() @Inject(DELIVERY_QUEUE_KEYS) keys?: DeliveryQueueKeys,
	) {
		this.keys = keys ?? DEFAULT_KEYS;
	}

	async onModuleDestroy(): Promise<void> {
		// 기다리는 중일 수 있어 quit이 아니라 바로 끊는다
		this.reader?.disconnect();
		await Promise.resolve();
	}

	async enqueue(items: QueuedDelivery[]): Promise<void> {
		const pipeline = this.valkey.pipeline();
		for (const { delivery_id, trigger } of items) {
			pipeline.xadd(this.keys.stream, '*', 'delivery_id', delivery_id.toString(), ...(trigger ? ['trigger', trigger] : []));
		}
		await pipeline.exec();
	}

	async schedule(deliveryId: bigint, at: Date): Promise<void> {
		await this.valkey.zadd(this.keys.scheduled, at.getTime(), deliveryId.toString());
	}

	async unschedule(deliveryIds: bigint[]): Promise<void> {
		if (deliveryIds.length === 0) return;
		await this.valkey.zrem(this.keys.scheduled, ...deliveryIds.map(String));
	}

	async takeDue(now: Date, limit: number): Promise<bigint[]> {
		const due = await this.valkey.zrangebyscore(this.keys.scheduled, 0, now.getTime(), 'LIMIT', 0, limit);
		const taken: bigint[] = [];
		for (const member of due) {
			// 스케줄러가 여러 개 떠 있어도 지우는 데 성공한 쪽만 가져간다
			if ((await this.valkey.zrem(this.keys.scheduled, member)) === 1) taken.push(BigInt(member));
		}
		return taken;
	}

	async ensureGroup(): Promise<void> {
		try {
			await this.valkey.xgroup('CREATE', this.keys.stream, this.keys.group, '0', 'MKSTREAM');
		} catch (error) {
			// 이미 있으면 그대로 쓴다
			if (!(error instanceof Error && error.message.includes('BUSYGROUP'))) throw error;
		}
	}

	async read(consumer: string, count: number, blockMs: number): Promise<ReceivedDelivery[]> {
		this.reader ??= this.valkey.duplicate();
		const result = (await this.reader.xreadgroup('GROUP', this.keys.group, consumer, 'COUNT', count, 'BLOCK', blockMs, 'STREAMS', this.keys.stream, '>')) as [string, StreamEntry[]][] | null;
		return (result?.[0]?.[1] ?? []).map((entry) => toReceived(entry, 1));
	}

	async reclaim(consumer: string, minIdleMs: number, count: number): Promise<ReceivedDelivery[]> {
		// [id, 읽어 간 컨슈머, 흐른 시간(ms), 건네진 횟수]
		const pending = (await this.valkey.xpending(this.keys.stream, this.keys.group, 'IDLE', minIdleMs, '-', '+', count)) as [string, string, number, number][];
		if (pending.length === 0) return [];
		const delivered = new Map(pending.map(([id, , , times]) => [id, times]));
		const claimed = (await this.valkey.xclaim(this.keys.stream, this.keys.group, consumer, minIdleMs, ...delivered.keys())) as StreamEntry[];
		// XCLAIM이 건네진 횟수를 1 올린다
		return claimed.map((entry) => toReceived(entry, (delivered.get(entry[0]) ?? 0) + 1));
	}

	async ack(messageIds: string[]): Promise<void> {
		if (messageIds.length === 0) return;
		// 끝난 항목은 Stream에서도 지워 길이가 늘지 않게 한다
		await this.valkey.multi().xack(this.keys.stream, this.keys.group, ...messageIds).xdel(this.keys.stream, ...messageIds).exec();
	}
}
