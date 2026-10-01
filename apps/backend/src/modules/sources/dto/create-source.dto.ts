import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsZod } from '@/common/http/zod';
import { type SignatureConfig, signatureConfigSchema } from '../domain/signature-config';

export class CreateSourceDto {
	@ApiProperty({ description: '소스 이름', maxLength: 100, example: '토스 지급대행' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	@ApiPropertyOptional({
		description: '업체가 발급한 웹훅 서명 키. signature_config와 함께 보낸다. 암호화해 저장하고 다시 조회할 수 없다. 수정에서 null이면 지운다',
		type: String,
		nullable: true,
		maxLength: 500,
		example: 'whsec_abc123',
	})
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(500)
	signing_secret?: string | null;

	@ApiPropertyOptional({
		description:
			'HMAC-SHA256 서명 검증 설정. header(필수), encoding(hex|base64, 기본 hex), prefix, signed_payload(기본 {body}. {header:이름}도 쓸 수 있다), ' +
			'timestamp_header, tolerance_sec(기본 300), event_id_header. signing_secret과 함께 보낸다. 둘 다 없으면 검증 없이 받는다. 수정에서 null이면 지운다',
		type: Object,
		nullable: true,
		example: { header: 'x-hub-signature-256', prefix: 'sha256=', event_id_header: 'x-github-delivery' },
	})
	@IsOptional()
	@IsZod(signatureConfigSchema)
	signature_config?: SignatureConfig | null;
}

export class UpdateSourceDto extends PartialType(CreateSourceDto) {}
