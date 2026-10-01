import { Global, Module } from '@nestjs/common';
import { CipherService } from './cipher.service';

// 여러 모듈의 adapters가 주입받으므로 전역으로 둔다.
@Global()
@Module({
	providers: [CipherService],
	exports: [CipherService],
})
export class CipherModule {}
