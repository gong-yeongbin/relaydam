import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntInterceptor } from './http/bigint.interceptor';
import { HttpExceptionFilter } from './http/http-exception.filter';
import { createValidationPipe } from './http/validation';

// 인그레스 경로. 이 아래로 온 요청은 본문을 파싱하지 않고 받은 바이트 그대로 넘긴다
export const INGRESS_PREFIX = '/in/';

const RAW = 'application/octet-stream';

// 인그레스 핸들러가 받는 요청. body는 Buffer이고(본문이 없으면 빈 Buffer), 원래 Content-Type은 따로 들고 있는다
export type IngressRequest = { headers: Record<string, string | string[] | undefined>; body: Buffer; originalContentType?: string };

// 웹훅 본문은 JSON이 아닐 수도, 깨진 JSON일 수도 있고, 목적지가 서명을 확인하려면 한 바이트도 달라지면 안 된다.
// Fastify의 파서는 Content-Type으로 고르고 라우트별로 바꿀 수 없어서, 인그레스 요청은 파서를 고르기 전에
// Content-Type을 raw로 바꿔 Buffer 파서를 타게 한다. 본문 상한은 Fastify 기본(1MiB)이 메모리를 지킨다.
function useRawIngressBody(app: NestFastifyApplication): void {
	const fastify = app.getHttpAdapter().getInstance();
	fastify.addContentTypeParser(RAW, { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
	fastify.decorateRequest('originalContentType');
	fastify.addHook('onRequest', (request, _reply, done) => {
		if (request.url.startsWith(INGRESS_PREFIX)) {
			(request as IngressRequest).originalContentType = request.headers['content-type'];
			request.headers['content-type'] = RAW;
		}
		done();
	});
}

// main.ts와 e2e가 같은 전역 설정으로 뜨도록 한곳에 둔다. 가드는 AuthModule이 APP_GUARD로 등록한다.
export function configureApp(app: NestFastifyApplication): void {
	app.useGlobalPipes(createValidationPipe());
	app.useGlobalFilters(new HttpExceptionFilter());
	app.useGlobalInterceptors(new BigIntInterceptor());
	useRawIngressBody(app);

	const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('relaydam').addBearerAuth().addSecurityRequirements('bearer').build());
	SwaggerModule.setup('docs', app, document);
}
