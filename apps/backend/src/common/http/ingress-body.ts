import type { NestFastifyApplication } from '@nestjs/platform-fastify';

// 인그레스 경로. 이 아래로 온 요청은 본문을 파싱하지 않고 받은 바이트 그대로 넘긴다
export const INGRESS_PREFIX = '/in/';

// 받는 본문의 최대 크기. Hookdeck과 같은 10MiB다. 근거와 부담은 context-notes.md "수신 정책과 삭제 정책"
export const INGRESS_BODY_LIMIT = 10 * 1024 * 1024;

const RAW = 'application/octet-stream';

type Headers = Record<string, string | string[] | undefined>;

// 인그레스 핸들러가 받는 요청. 아래 훅이 헤더를 바꿔 두므로 핸들러는 readIngressRequest로 읽는다
export type IngressRequest = { method: string; url: string; ip?: string; headers: Headers; body?: Buffer; originalContentType?: string; declaredSize?: number };

export type IngressInput = {
	method: string;
	// `/in/:slug` 뒤에 붙은 경로. 없으면 빈 문자열
	path: string;
	// `?`를 뺀 쿼리 문자열. 없으면 빈 문자열
	query: string;
	source_ip: string | null;
	headers: Headers;
	body: Buffer;
	size: number;
};

// 웹훅 본문은 JSON이 아닐 수도, 깨진 JSON일 수도 있고, 목적지가 서명을 확인하려면 한 바이트도 달라지면 안 된다.
// Fastify의 파서는 Content-Type으로 고르고 라우트별로 바꿀 수 없어서, 인그레스 요청은 파서를 고르기 전에
// Content-Type을 raw로 바꿔 Buffer 파서를 타게 한다.
//
// 상한을 넘는 본문은 읽지 않는다. Content-Length가 상한보다 크면 Content-Type을 지우고 길이를 0으로 바꿔
// Fastify가 본문 없이 핸들러를 부르게 한다. 핸들러는 선언된 크기로 413을 답하고 거부 기록을 남긴다.
// 읽지 않은 바이트는 응답이 끝나면 Node가 버린다. Content-Length 없이(chunked) 상한을 넘기면 파서의
// bodyLimit이 끊고, 이때는 핸들러에 닿지 않아 거부 기록이 없다.
export function useRawIngressBody(app: NestFastifyApplication): void {
	const fastify = app.getHttpAdapter().getInstance();
	fastify.addContentTypeParser(RAW, { parseAs: 'buffer', bodyLimit: INGRESS_BODY_LIMIT }, (_request, body, done) => done(null, body));
	fastify.decorateRequest('originalContentType');
	fastify.decorateRequest('declaredSize');
	fastify.addHook('onRequest', (request, _reply, done) => {
		if (request.url.startsWith(INGRESS_PREFIX)) {
			const ingress = request as IngressRequest;
			const declared = Number(request.headers['content-length']);
			ingress.originalContentType = request.headers['content-type'];
			if (declared > INGRESS_BODY_LIMIT) {
				ingress.declaredSize = declared;
				delete request.headers['content-type'];
				request.headers['content-length'] = '0';
			} else {
				request.headers['content-type'] = RAW;
			}
		}
		done();
	});
}

// 훅이 바꿔 둔 헤더를 원래 값으로 되돌리고, 전달할 때 그대로 쓸 요청 방식·경로·쿼리를 꺼낸다.
// size는 상한을 넘어 읽지 않은 본문이면 선언된 크기다
export function readIngressRequest(request: IngressRequest): IngressInput {
	const body = request.body ?? Buffer.alloc(0);
	const size = request.declaredSize ?? body.length;
	const headers = { ...request.headers, 'content-type': request.originalContentType };
	const mark = request.url.indexOf('?');
	const pathname = mark < 0 ? request.url : request.url.slice(0, mark);
	return {
		method: request.method,
		// `/in/<slug>` 다음부터가 넘길 경로다
		path: pathname.replace(/^\/in\/[^/]*/, ''),
		query: mark < 0 ? '' : request.url.slice(mark + 1),
		source_ip: request.ip ?? null,
		headers: request.declaredSize === undefined ? headers : { ...headers, 'content-length': String(size) },
		body,
		size,
	};
}
