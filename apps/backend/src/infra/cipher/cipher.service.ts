import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const IV_BYTES = 12;
const TAG_BYTES = 16;

// AES-256-GCM. 서명 시크릿·목적지 헤더·빌링키가 같이 쓴다. 저장 형식은 base64(iv 12B + tag 16B + 암호문).
// 키 버전 접두사는 두지 않는다. 키를 회전하게 되면 그때 넣는다.
@Injectable()
export class CipherService {
	private readonly key: Buffer;

	constructor(config: ConfigService) {
		this.key = Buffer.from(config.getOrThrow<string>('ENCRYPTION_KEY'), 'base64');
		// 키가 틀리면 첫 저장이 아니라 기동 단계에서 실패하게 한다
		if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY는 base64로 인코딩한 32바이트여야 합니다.');
	}

	encrypt(plain: string): string {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
		const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
		return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
	}

	// 키가 다르거나 값이 변조됐으면 던진다
	decrypt(encoded: string): string {
		const raw = Buffer.from(encoded, 'base64');
		const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
		decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
		return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
	}
}
