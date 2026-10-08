// jsdom에는 matchMedia가 없다. antd의 Grid(Row·Col)가 화면 폭을 읽을 때 쓴다
window.matchMedia ??= (query: string) =>
	({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	}) as MediaQueryList;
