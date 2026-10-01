import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { registerDecorator, type ValidationArguments } from 'class-validator';
import type { ZodType } from 'zod';

// JSON 컬럼용 DTO 필드. class-validator로 중첩 검증하지 않고 zod 스키마 하나로 검사한다.
// 통과하면 스키마가 낸 값(기본값·정규화 적용)으로 바꾼다. null·undefined는 건드리지 않으므로 @IsOptional과 같이 쓴다.
export function IsZod(schema: ZodType): PropertyDecorator {
	return applyDecorators(
		Transform(({ value }: { value: unknown }) => {
			if (value === null || value === undefined) return value;
			const parsed = schema.safeParse(value);
			return parsed.success ? parsed.data : value;
		}),
		(target: object, propertyName: string | symbol) =>
			registerDecorator({
				name: 'isZod',
				target: target.constructor,
				propertyName: String(propertyName),
				validator: {
					validate: (value: unknown) => schema.safeParse(value).success,
					defaultMessage: ({ value }: ValidationArguments) => {
						const parsed = schema.safeParse(value);
						if (parsed.success) return '';
						return parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message].filter(Boolean).join(': ')).join('; ');
					},
				},
			}),
	);
}
