import ErrorBoundary from 'components/ErrorBoundary'
import LoadingOrError from 'components/LoadingOrError'
import { TooltipProvider } from 'components/ui/tooltip'
import { useMediaQuery } from 'hooks'

import type { ReactElement } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import {
	createBrowserRouter,
	createRoutesFromElements,
	Navigate,
	Route,
	RouterProvider
} from 'react-router-dom'

// const Index = lazy(async () => import('pages/Index'))
const AI = lazy(async () => import('pages/AI'))
const Builder = lazy(async () => import('pages/AI/Builder'))

const router = createBrowserRouter(
	createRoutesFromElements(
		<>
			<Route path='/' element={<Navigate replace to='/ai' />} />
			<Route path='/ai' element={<AI />}>
				<Route path=':id' element={<Builder />} />
			</Route>
			<Route path='/ai/shared/:id' element={<Builder shared />} />
		</>
	)
)

export default function App(): ReactElement {
	const darkMode = useMediaQuery('(prefers-color-scheme: dark)')

	useEffect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark')
		}
	}, [darkMode])

	return (
		<Suspense fallback={<LoadingOrError />}>
			<ErrorBoundary renderError={error => <LoadingOrError error={error} />}>
				<TooltipProvider>
					<RouterProvider router={router} />
				</TooltipProvider>
			</ErrorBoundary>
		</Suspense>
	)
}
