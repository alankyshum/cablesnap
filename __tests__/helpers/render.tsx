import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { light } from '../../constants/theme'

export function renderScreen(ui: React.ReactElement) {
  return render(<PaperProvider theme={light}>{ui}</PaperProvider>)
}
