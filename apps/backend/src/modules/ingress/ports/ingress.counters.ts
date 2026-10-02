// 인그레스 경로에서 세는 것. DB 집계를 넣지 않으려고 Valkey에 둔다
export interface IngressCounters {
	// 조직의 그 달(yyyymm) 사용량을 1 올리고 올린 뒤의 값을 준다
	incrementUsage(organizationId: number, period: string): Promise<number>;
	// 이 소스의 거부 기록을 하나 더 남겨도 되는가. 분당 상한 안이면 true
	allowRejectionRecord(sourceId: number, now: Date): Promise<boolean>;
}

export const INGRESS_COUNTERS = Symbol('IngressCounters');
