import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Valkey 클라이언트. ioredis를 그대로 쓴다(근거는 context-notes.md "Redis가 아니라 Valkey").
// 사용량 카운터, 거부 기록 상한, 전달 큐(Stream)가 이 연결을 쓴다.
@Injectable()
export class ValkeyService extends Redis implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ValkeyService.name);

	constructor(config: ConfigService) {
		// 생성할 때는 접속하지 않는다. 접속은 onModuleInit에서 한다.
		super(config.getOrThrow<string>('REDIS_URL'), { lazyConnect: true });
		// 리스너가 없으면 ioredis가 연결 오류를 console.error로 찍는다. 끊기면 ioredis가 알아서 다시 붙는다.
		this.on('error', (error: Error) => this.logger.error(`Valkey 연결 오류: ${error.message}`));
	}

	// Valkey에 닿지 못하면 첫 요청이 아니라 기동 단계에서 실패하게 한다.
	async onModuleInit(): Promise<void> {
		await this.connect();
	}

	async onModuleDestroy(): Promise<void> {
		await this.quit();
	}
}
