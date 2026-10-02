import { createHash } from 'node:crypto';
import { idempotencyKey } from './idempotency';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

describe('idempotencyKey', () => {
	const body = Buffer.from('{"order":1}');

	it('이벤트 ID 헤더가 있으면 그 값을 쓴다', () => {
		expect(idempotencyKey('x-github-delivery', { 'x-github-delivery': '72d3162e-cc78-11e3-81ab-4c9367dc0958' }, body)).toBe('id:72d3162e-cc78-11e3-81ab-4c9367dc0958');
	});

	it('헤더를 지정하지 않았거나 요청에 그 헤더가 없으면 본문 해시를 쓴다', () => {
		const expected = `sha256:${sha256(body)}`;
		expect(idempotencyKey(undefined, { 'x-github-delivery': 'ignored' }, body)).toBe(expected);
		expect(idempotencyKey('x-github-delivery', {}, body)).toBe(expected);
		expect(idempotencyKey('x-github-delivery', { 'x-github-delivery': '' }, body)).toBe(expected);
	});

	it('본문이 같으면 헤더가 달라도 같은 키, 본문이 다르면 다른 키', () => {
		expect(idempotencyKey(undefined, { 'x-attempt': '1' }, body)).toBe(idempotencyKey(undefined, { 'x-attempt': '2' }, body));
		expect(idempotencyKey(undefined, {}, body)).not.toBe(idempotencyKey(undefined, {}, Buffer.from('{"order":2}')));
	});

	it('헤더 값과 본문 해시는 접두사가 달라 겹치지 않는다', () => {
		const hash = sha256(body);
		expect(idempotencyKey('x-id', { 'x-id': `sha256:${hash}` }, body)).not.toBe(idempotencyKey(undefined, {}, body));
	});

	it('ID가 컬럼 길이를 넘으면 해시로 줄인다. 넘지 않는 가장 긴 값은 그대로 쓴다', () => {
		const longest = 'a'.repeat(252);
		const tooLong = 'a'.repeat(253);
		expect(idempotencyKey('x-id', { 'x-id': longest }, body)).toBe(`id:${longest}`);
		expect(idempotencyKey('x-id', { 'x-id': tooLong }, body)).toBe(`id-sha256:${sha256(tooLong)}`);
		expect(idempotencyKey('x-id', { 'x-id': longest }, body).length).toBeLessThanOrEqual(255);
	});
});
