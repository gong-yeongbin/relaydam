import { createHash } from 'node:crypto';
import { headerValue, type RequestHeaders } from './signature';

// event.idempotency_key는 VarChar(255)다. 접두사를 붙일 자리를 뺀 길이
const MAX_ID_LENGTH = 252;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

// 같은 웹훅인지 가려내는 값. 업체가 준 이벤트 ID 헤더가 있으면 그것, 없으면 본문 해시다.
// 헤더는 넣지 않는다(재전송하면 헤더가 달라진다). 두 방식의 값이 겹치지 않게 접두사를 붙인다
export function idempotencyKey(eventIdHeader: string | undefined, headers: RequestHeaders, body: Buffer): string {
	const id = eventIdHeader === undefined ? undefined : headerValue(headers, eventIdHeader);
	if (id === undefined) return `sha256:${sha256(body)}`;
	return id.length <= MAX_ID_LENGTH ? `id:${id}` : `id-sha256:${sha256(id)}`;
}
