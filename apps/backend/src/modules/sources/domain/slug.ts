import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const SLUG_LENGTH = 20;

// 인그레스 URL(`/in/:slug`)의 마지막 조각. 서명 없는 소스에서는 URL이 유일한 보호막이라 추측할 수 없어야 한다.
// 36^20(약 103비트)이라 충돌·추측 모두 무시한다. 근거는 context-notes.md "source·destination·connection 모델"
export function newSlug(): string {
	return Array.from({ length: SLUG_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}
