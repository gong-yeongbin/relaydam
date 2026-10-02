export type DestinationRequest = {
	method: string;
	url: string;
	headers: Record<string, string | string[]>;
	body: Buffer;
	timeout_ms: number;
};

// 응답을 받았으면(상태 코드가 무엇이든) status_code가 있고, 연결 실패·타임아웃·차단이면 error가 있다
export type DestinationResponse =
	| { status_code: number; response_body: string; retry_after: string | undefined; duration_ms: number }
	| { error: string; duration_ms: number };

// 내부망·자기 자신을 가리켜 보내지 않았을 때의 error 값
export const BLOCKED_ADDRESS = 'blocked_address';
export const TIMEOUT = 'timeout';

// 고객 서버로 요청 한 번을 보낸다. 리다이렉트는 따라가지 않는다. 던지지 않고 결과로 돌려준다
export interface DestinationClient {
	send(request: DestinationRequest): Promise<DestinationResponse>;
}

export const DESTINATION_CLIENT = Symbol('DestinationClient');
