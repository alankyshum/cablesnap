import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { light } from '../../constants/theme'

export function renderScreen(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={light}>{ui}</PaperProvider>
    </QueryClientProvider>
  )
}
