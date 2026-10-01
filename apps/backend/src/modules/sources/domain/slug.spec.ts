import { newSlug } from './slug';

describe('newSlug', () => {
	it('소문자·숫자 20자', () => {
		expect(newSlug()).toMatch(/^[a-z0-9]{20}$/);
	});

	it('매번 다르다', () => {
		expect(new Set(Array.from({ length: 100 }, newSlug)).size).toBe(100);
	});
});
