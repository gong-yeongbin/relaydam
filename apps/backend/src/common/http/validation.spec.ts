import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { createValidationPipe, toValidationException } from './validation';

function error(property: string, constraints?: Record<string, string>, children: ValidationError[] = []): ValidationError {
	return Object.assign(new ValidationError(), { property, constraints, children });
}

describe('toValidationException', () => {
	it('중첩 필드를 점 경로로 펼쳐 details에 담는다', () => {
		const exception = toValidationException([
			error('id_token', { isString: 'id_token must be a string' }),
			error('headers', undefined, [error('name', { isNotEmpty: 'name should not be empty' })]),
		]);

		expect(exception.getStatus()).toBe(400);
		expect(exception.getResponse()).toEqual({
			code: 'validation_failed',
			message: '요청이 올바르지 않습니다.',
			details: [
				{ field: 'id_token', message: 'id_token must be a string' },
				{ field: 'headers.name', message: 'name should not be empty' },
			],
		});
	});
});

describe('createValidationPipe', () => {
	it('ValidationPipe를 만든다', () => {
		expect(createValidationPipe()).toBeInstanceOf(ValidationPipe);
	});
});
