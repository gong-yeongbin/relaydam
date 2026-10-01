import { plainToInstance } from 'class-transformer';
import { IsOptional, validate } from 'class-validator';
import { z } from 'zod';
import { IsZod } from './zod';

class Dto {
	@IsOptional()
	@IsZod(z.strictObject({ name: z.string().toLowerCase(), size: z.number().int().default(1) }))
	config?: unknown;
}

const check = async (plain: object) => {
	const dto = plainToInstance(Dto, plain);
	return { dto, errors: await validate(dto) };
};

describe('IsZod', () => {
	it('통과하면 스키마가 낸 값(기본값·정규화)으로 바꾼다', async () => {
		const { dto, errors } = await check({ config: { name: 'ABC' } });
		expect(errors).toEqual([]);
		expect(dto.config).toEqual({ name: 'abc', size: 1 });
	});

	it('틀리면 값을 그대로 두고 경로가 붙은 메시지로 실패한다', async () => {
		const { dto, errors } = await check({ config: { name: 1, extra: true } });
		expect(dto.config).toEqual({ name: 1, extra: true });
		expect(errors).toHaveLength(1);
		expect(errors[0]!.constraints?.isZod).toMatch(/name: /);
	});

	it('null·undefined는 건드리지 않는다 (@IsOptional이 건너뛴다)', async () => {
		expect((await check({ config: null })).errors).toEqual([]);
		expect((await check({})).errors).toEqual([]);
	});
});
