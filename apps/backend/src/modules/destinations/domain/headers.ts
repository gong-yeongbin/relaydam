import { z } from 'zod';

const MAX_HEADERS = 20;

// destination으로 전달할 때 덧붙이는 헤더. 값에 고객 서버의 인증 토큰이 들어가므로 통째로 암호화해 저장한다.
// 값에 줄바꿈을 받으면 전달 요청에 헤더를 끼워 넣을 수 있어서 막는다
export const headersSchema = z
	.record(
		z
			.string()
			.max(100)
			.regex(/^[A-Za-z0-9-]+$/, '헤더 이름은 영문·숫자·하이픈만 쓸 수 있습니다.'),
		z
			.string()
			.max(4096)
			.regex(/^[^\r\n]*$/, '헤더 값에 줄바꿈을 넣을 수 없습니다.'),
	)
	.refine((headers) => Object.keys(headers).length <= MAX_HEADERS, `헤더는 ${MAX_HEADERS}개까지 넣을 수 있습니다.`);

export type DestinationHeaders = z.infer<typeof headersSchema>;

const SENSITIVE = /authorization|cookie|key|secret|token|password/i;

// `Bearer xxx`처럼 방식이 앞에 붙으면 방식은 남긴다
function mask(value: string): string {
	const space = value.indexOf(' ');
	return space > 0 ? `${value.slice(0, space)} ****` : '****';
}

// 응답용. 비밀로 보이는 이름의 값을 가린다. 목적지로 보낼 때는 원문을 쓴다
export function maskHeaders(headers: DestinationHeaders): DestinationHeaders {
	return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, SENSITIVE.test(name) ? mask(value) : value]));
}
