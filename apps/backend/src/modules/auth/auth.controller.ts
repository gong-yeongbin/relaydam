import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/auth/decorators';
import { AuthService } from './auth.service';
import { AccessTokenDto, GoogleLoginDto } from './dto/google-login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Public()
	@Post('google')
	@HttpCode(200)
	@ApiOperation({ summary: '구글 ID 토큰으로 로그인한다. 첫 로그인이면 개인 조직을 만든다' })
	@ApiResponse({ status: 200, type: AccessTokenDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 401, description: 'unauthenticated — 토큰이 유효하지 않거나 이메일이 검증되지 않음' })
	google(@Body() body: GoogleLoginDto): Promise<AccessTokenDto> {
		return this.auth.loginWithGoogle(body.id_token);
	}
}
