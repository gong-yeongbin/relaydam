import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { IsZod } from '@/common/http/zod';
import { type DestinationHeaders, headersSchema } from '../domain/headers';

export class CreateDestinationDto {
	@ApiProperty({ description: '목적지 이름', maxLength: 100, example: '주문 서버' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	// 사설 IP 차단(SSRF)은 실제로 요청을 보내는 8. delivery에서 다룬다
	@ApiProperty({ description: '웹훅을 전달할 http(s) 주소', maxLength: 2048, example: 'https://api.example.com/webhooks' })
	@IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
	@MaxLength(2048)
	url: string;

	@ApiPropertyOptional({
		description:
			'전달할 때 덧붙일 헤더(이름 → 값, 20개까지). 암호화해 저장한다. 응답에서는 authorization·key·secret·token 등이 들어간 이름의 값을 가린다. ' +
			'수정에서는 통째로 바뀌고 null·빈 객체면 지운다',
		type: Object,
		nullable: true,
		example: { Authorization: 'Bearer my-server-token' },
	})
	@IsOptional()
	@IsZod(headersSchema)
	headers?: DestinationHeaders | null;

	@ApiPropertyOptional({ description: '전달 타임아웃(ms)', default: 5000, minimum: 1000, maximum: 30000 })
	@IsOptional()
	@IsInt()
	@Min(1000)
	@Max(30000)
	timeout_ms?: number;

	@ApiPropertyOptional({ description: '최대 시도 횟수. 넘으면 dead', default: 10, minimum: 1, maximum: 20 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	max_attempts?: number;

	@ApiPropertyOptional({ description: '이 목적지로 동시에 보내는 요청 수', default: 10, minimum: 1, maximum: 100 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	concurrency?: number;
}

export class UpdateDestinationDto extends PartialType(CreateDestinationDto) {}
