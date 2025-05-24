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
import { darkModeAtom } from 'state'

import { useAtomValue } from 'jotai'
import { DevTools } from 'jotai-devtools'
import 'jotai-devtools/styles.css'

// Const Index = lazy(async () => import('pages/Index'))
const AI = lazy(async () => import('pages/AI'))

const router = createBrowserRouter(
	createRoutesFromElements(
		<>
			<Route path='/' element={<Navigate replace to='/ai' />} />
			<Route path='/ai' element={<AI />}>
				<Route path=':id' element={<AI />} />
			</Route>
			<Route path='/ai/shared/:id' element={<AI isShared />} />
		</>
	)
)

export default function App(): ReactElement {
	const systemDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
	const darkMode = useAtomValue(darkModeAtom)

	useEffect(() => {
		if ((darkMode === 'system' && systemDarkMode) || darkMode === 'dark') {
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
		}
	}, [darkMode, systemDarkMode])

	return (
		<Suspense fallback={<LoadingOrError />}>
			<ErrorBoundary renderError={error => <LoadingOrError error={error} />}>
				<TooltipProvider>
					<DevTools />
					<RouterProvider router={router} />
				</TooltipProvider>
			</ErrorBoundary>
		</Suspense>
	)
}
