import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

function flatten(errors: ValidationError[], parent = ''): { field: string; message: string }[] {
	return errors.flatMap((error) => {
		const field = parent ? `${parent}.${error.property}` : error.property;
		const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
		return [...own, ...flatten(error.children ?? [], field)];
	});
}

export function toValidationException(errors: ValidationError[]): BadRequestException {
	return new BadRequestException({ code: 'validation_failed', message: '요청이 올바르지 않습니다.', details: flatten(errors) });
}

export function createValidationPipe(): ValidationPipe {
	return new ValidationPipe({
		whitelist: true,
		transform: true,
		forbidNonWhitelisted: true,
		exceptionFactory: toValidationException,
	});
}
