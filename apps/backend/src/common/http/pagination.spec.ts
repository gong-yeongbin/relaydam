import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListQueryDto, toPage } from './pagination';

const parse = (query: object) => {
	const dto = plainToInstance(ListQueryDto, query);
	return { dto, errors: validateSync(dto).map((e) => e.property) };
};

describe('ListQueryDto', () => {
	it('limit 기본 50, cursor 없음', () => {
		expect(parse({})).toEqual({ dto: expect.objectContaining({ limit: 50 }) as ListQueryDto, errors: [] });
		expect(parse({}).dto.cursor).toBeUndefined();
	});

	it('쿼리 문자열을 숫자로 바꾼다', () => {
		expect(parse({ cursor: '10', limit: '2' }).dto).toMatchObject({ cursor: 10, limit: 2 });
	});

	it('limit은 1~200, cursor는 양의 정수', () => {
		expect(parse({ limit: '0' }).errors).toEqual(['limit']);
		expect(parse({ limit: '201' }).errors).toEqual(['limit']);
		expect(parse({ cursor: 'abc' }).errors).toEqual(['cursor']);
		expect(parse({ cursor: '0' }).errors).toEqual(['cursor']);
	});
});

describe('toPage', () => {
	const rows = [{ id: 5 }, { id: 4 }, { id: 3 }];

	it('limit + 1개를 받았으면 limit개만 내고 마지막 id를 커서로 준다', () => {
		expect(toPage(rows, 2)).toEqual({ data: [{ id: 5 }, { id: 4 }], next_cursor: '4' });
	});

	it('limit개 이하면 다음 페이지가 없다', () => {
		expect(toPage(rows, 3)).toEqual({ data: rows, next_cursor: null });
		expect(toPage([], 3)).toEqual({ data: [], next_cursor: null });
	});
});
