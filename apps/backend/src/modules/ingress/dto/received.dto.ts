import { ApiProperty } from '@nestjs/swagger';

export class ReceivedDto {
	@ApiProperty({ type: String, description: '저장된 이벤트 id. 같은 웹훅이 다시 오면 처음 저장된 이벤트의 id다', example: '1024' })
	id: bigint;
}
