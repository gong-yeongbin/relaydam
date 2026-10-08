import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { theme } from './theme';

const container = document.getElementById('root');
if (!container) throw new Error('#root 엘리먼트를 찾지 못했다');

createRoot(container).render(
	<StrictMode>
		<ConfigProvider locale={koKR} theme={theme}>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</ConfigProvider>
	</StrictMode>
);
