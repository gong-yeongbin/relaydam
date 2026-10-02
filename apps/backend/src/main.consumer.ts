import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConsumerModule } from './consumer.module';

async function bootstrap() {
	// HTTP 서버를 띄우지 않는다. bufferLogs로 부팅 로그를 잡아뒀다가 Pino가 준비된 뒤 한꺼번에 내보낸다.
	const app = await NestFactory.createApplicationContext(ConsumerModule, { bufferLogs: true });
	app.useLogger(app.get(Logger));

	// SIGTERM에서 읽기를 멈추고 처리 중인 전달이 끝난 뒤 종료하도록 한다(DeliveryRunner.onModuleDestroy).
	app.enableShutdownHooks();
}
void bootstrap();
