import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from 'App'
import 'lib/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const MAX_RETRIES = 1
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Number.POSITIVE_INFINITY,
			retry: MAX_RETRIES
		}
	}
})

const container = document.querySelector('#root')
if (container) {
	const root = createRoot(container)
	root.render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</StrictMode>
	)
}
