import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPrivateAddress } from '../domain/private-address';
import { BLOCKED_ADDRESS, type DestinationClient, type DestinationRequest, type DestinationResponse, TIMEOUT } from '../ports/destination.client';

// 전달 기록에 남기는 응답 본문의 최대 길이
export const RESPONSE_BODY_LIMIT = 4096;

// 이름을 IP로 바꾼 직후, 연결하기 전에 본다. 이름이 내부망 주소로 풀리는 경우(DNS로 우회)를 여기서 막는다.
// 조회와 연결 사이에 다시 조회하지 않으므로, 검사한 IP와 실제로 붙는 IP가 같다
const guardedLookup: LookupFunction = (hostname, options, callback) => {
	dnsLookup(hostname, options, (error, address, family) => {
		const addresses = Array.isArray(address) ? address.map((entry) => entry.address) : [address];
		if (!error && addresses.some(isPrivateAddress)) {
			callback(Object.assign(new Error(`${hostname}은 내부망 주소로 풀린다`), { code: BLOCKED_ADDRESS }), address, family);
			return;
		}
		callback(error, address, family);
	});
};

// Node 내장 http/https로 보낸다. 리다이렉트를 따라가지 않고, 연결을 맺을 IP를 직접 확인할 수 있어서다
@Injectable()
export class NodeDestinationClient implements DestinationClient {
	// 개발·테스트에서 localhost 목적지를 쓰려면 켠다. 운영에서는 켜지 않는다
	private readonly allowPrivate: boolean;

	constructor(config: ConfigService) {
		this.allowPrivate = config.get<string>('ALLOW_PRIVATE_DESTINATIONS') === 'true';
	}

	send(request: DestinationRequest): Promise<DestinationResponse> {
		const startedAt = performance.now();
		const elapsed = () => Math.round(performance.now() - startedAt);

		return new Promise((resolve) => {
			let timer: NodeJS.Timeout | undefined;
			let settled = false;
			const settle = (result: DestinationResponse) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(result);
			};
			const fail = (error: Error & { code?: string }) => settle({ error: error.code ?? error.message, duration_ms: elapsed() });

			// 주소나 헤더 값이 잘못되면 Node가 요청을 만들다가 던진다. 그것도 실패한 시도로 돌려준다
			try {
				const url = new URL(request.url);
				// IP로 적힌 주소는 이름 조회를 거치지 않아 guardedLookup이 불리지 않는다. 여기서 직접 본다
				const host = url.hostname.replace(/^\[|\]$/g, '');
				if (!this.allowPrivate && isIP(host) !== 0 && isPrivateAddress(host)) {
					settle({ error: BLOCKED_ADDRESS, duration_ms: elapsed() });
					return;
				}

				const transport = url.protocol === 'https:' ? https : http;
				const outgoing = transport.request(
					url,
					{
						method: request.method,
						headers: { ...request.headers, 'content-length': request.body.length },
						lookup: this.allowPrivate ? undefined : guardedLookup,
					},
					(response) => {
						const chunks: Buffer[] = [];
						let size = 0;
						const done = () =>
							settle({
								status_code: response.statusCode ?? 0,
								response_body: Buffer.concat(chunks).toString('utf8'),
								retry_after: response.headers['retry-after'],
								duration_ms: elapsed(),
							});
						response.on('data', (chunk: Buffer) => {
							chunks.push(chunk.subarray(0, RESPONSE_BODY_LIMIT - size));
							size += chunk.length;
							// 기록할 만큼 받았으면 나머지는 읽지 않는다
							if (size >= RESPONSE_BODY_LIMIT) {
								done();
								response.destroy();
							}
						});
						response.on('end', done);
						response.on('error', fail);
					},
				);
				// 연결·전송·응답을 합친 전체 시간으로 끊는다
				timer = setTimeout(() => outgoing.destroy(Object.assign(new Error(TIMEOUT), { code: TIMEOUT })), request.timeout_ms);
				outgoing.on('error', fail);
				outgoing.end(request.body);
			} catch (error) {
				fail(error as Error);
			}
		});
	}
}
