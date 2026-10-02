import { BlockList, isIPv4 } from 'node:net';

// 밖에서 닿을 수 없어야 하는 주소. 목적지가 여기를 가리키면 보내지 않는다.
// 고객이 적은 주소로 요청을 보내고 응답 본문을 기록에 남기므로, 막지 않으면 내부망의 응답이 그대로 읽힌다
const blocked = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8], // "이 네트워크". 0.0.0.0은 자기 자신으로 붙는다
	['10.0.0.0', 8], // 사설망
	['100.64.0.0', 10], // 통신사 공유 주소
	['127.0.0.0', 8], // 자기 자신
	['169.254.0.0', 16], // 링크 로컬. 클라우드 메타데이터(169.254.169.254)가 여기 있다
	['172.16.0.0', 12], // 사설망
	['192.0.0.0', 24], // 프로토콜 할당
	['192.168.0.0', 16], // 사설망
	['198.18.0.0', 15], // 벤치마크용
	['224.0.0.0', 4], // 멀티캐스트
	['240.0.0.0', 4], // 예약, 브로드캐스트
] as const) {
	blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
	['::', 128], // 지정 안 됨
	['::1', 128], // 자기 자신
	['fc00::', 7], // 사설망
	['fe80::', 10], // 링크 로컬
	['ff00::', 8], // 멀티캐스트
] as const) {
	blocked.addSubnet(network, prefix, 'ipv6');
}

// IPv4를 IPv6로 감싼 표기(::ffff:10.0.0.1)는 BlockList가 IPv4 규칙으로 본다
export function isPrivateAddress(ip: string): boolean {
	return blocked.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
}
