import { createHash } from 'node:crypto';
import { idempotencyKey } from './idempotency';
import type { RequestHeaders } from './signature';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

describe('idempotencyKey', () => {
	const body = Buffer.from('{"order":1}');
	const request = (overrides: { method?: string; path?: string; query?: string; headers?: RequestHeaders; body?: Buffer } = {}) => ({
		method: 'POST',
		path: '',
		query: '',
		headers: {},
		body,
		...overrides,
	});

	it('이벤트 ID 헤더가 있으면 그 값을 쓴다', () => {
		expect(idempotencyKey('x-github-delivery', request({ headers: { 'x-github-delivery': '72d3162e-cc78-11e3-81ab-4c9367dc0958' } }))).toBe(
			'id:72d3162e-cc78-11e3-81ab-4c9367dc0958',
		);
	});

	it('헤더를 지정하지 않았거나 요청에 그 헤더가 없으면 요청 방식·경로·쿼리·본문의 해시를 쓴다', () => {
		const expected = `sha256:${sha256(Buffer.concat([Buffer.from('POST ?\n'), body]))}`;
		expect(idempotencyKey(undefined, request({ headers: { 'x-github-delivery': 'ignored' } }))).toBe(expected);
		expect(idempotencyKey('x-github-delivery', request())).toBe(expected);
		expect(idempotencyKey('x-github-delivery', request({ headers: { 'x-github-delivery': '' } }))).toBe(expected);
	});

	it('본문이 같으면 헤더가 달라도 같은 키, 본문이 다르면 다른 키', () => {
		expect(idempotencyKey(undefined, request({ headers: { 'x-attempt': '1' } }))).toBe(idempotencyKey(undefined, request({ headers: { 'x-attempt': '2' } })));
		expect(idempotencyKey(undefined, request())).not.toBe(idempotencyKey(undefined, request({ body: Buffer.from('{"order":2}') })));
	});

	it('본문이 같아도 요청 방식·경로·쿼리가 다르면 다른 웹훅이다', () => {
		const base = idempotencyKey(undefined, request());
		expect(idempotencyKey(undefined, request({ method: 'PUT' }))).not.toBe(base);
		expect(idempotencyKey(undefined, request({ path: '/orders' }))).not.toBe(base);
		expect(idempotencyKey(undefined, request({ query: 'v=2' }))).not.toBe(base);
		// 경로와 쿼리의 경계가 섞이지 않는다
		expect(idempotencyKey(undefined, request({ path: '/a', query: 'b' }))).not.toBe(idempotencyKey(undefined, request({ path: '/a?b' })));
	});

	it('이벤트 ID가 있으면 경로가 달라도 같은 웹훅이다', () => {
		const headers = { 'x-id': 'evt_1' };
		expect(idempotencyKey('x-id', request({ headers, path: '/a' }))).toBe(idempotencyKey('x-id', request({ headers, path: '/b' })));
	});

	it('헤더 값과 해시는 접두사가 달라 겹치지 않는다', () => {
		const hashed = idempotencyKey(undefined, request());
		expect(idempotencyKey('x-id', request({ headers: { 'x-id': hashed } }))).not.toBe(hashed);
	});

	it('ID가 컬럼 길이를 넘으면 해시로 줄인다. 넘지 않는 가장 긴 값은 그대로 쓴다', () => {
		const longest = 'a'.repeat(252);
		const tooLong = 'a'.repeat(253);
		expect(idempotencyKey('x-id', request({ headers: { 'x-id': longest } }))).toBe(`id:${longest}`);
		expect(idempotencyKey('x-id', request({ headers: { 'x-id': tooLong } }))).toBe(`id-sha256:${sha256(tooLong)}`);
		expect(idempotencyKey('x-id', request({ headers: { 'x-id': longest } })).length).toBeLessThanOrEqual(255);
	});
});
