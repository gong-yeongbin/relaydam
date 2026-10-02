import { Global, Module } from '@nestjs/common';
import { ValkeyService } from './valkey.service';

// 여러 모듈의 adapters가 주입받으므로 전역으로 둔다.
@Global()
@Module({
	providers: [ValkeyService],
	exports: [ValkeyService],
})
export class ValkeyModule {}
