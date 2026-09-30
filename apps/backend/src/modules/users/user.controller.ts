import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles } from '@/common/auth/decorators';
import { MeDto } from './dto/get-me.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('users')
export class UserController {
	constructor(private readonly users: UserService) {}

	@Roles()
	@Get('me')
	@ApiOperation({ summary: '로그인한 내 정보를 조회한다' })
	@ApiResponse({ status: 200, type: MeDto })
	@ApiResponse({ status: 401, description: 'unauthenticated — 토큰이 없거나 만료됨' })
	@ApiResponse({ status: 404, description: 'user_not_found' })
	me(@Actor() actor: Actor): Promise<MeDto> {
		return this.users.getMe(actor.user_id);
	}
}
