import React from 'react'
import { render, act, fireEvent, waitFor } from '@testing-library/react-native'
import { ToastProvider, useToast, ToastVariant } from '../../components/ui/bna-toast'
import { Text, TouchableOpacity } from 'react-native'

// Helper component that exposes toast controls for testing
function ToastTrigger({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  duration,
}: {
  variant?: ToastVariant
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  duration?: number
}) {
  const toast = useToast()
  return (
    <>
      <TouchableOpacity
        testID="show-toast"
        onPress={() => {
          if (variant && variant !== 'default') {
            toast[variant](title ?? 'Test', description ? { description, duration } : undefined)
          } else {
            toast.toast({
              title: title ?? 'Test',
              description,
              duration,
              action: actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined,
            })
          }
        }}
      />
      <TouchableOpacity testID="dismiss-all" onPress={() => toast.dismissAll()} />
    </>
  )
}

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('ToastProvider + useToast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders children without toasts initially', () => {
    const { getByText } = renderWithToast(<Text>Hello</Text>)
    expect(getByText('Hello')).toBeTruthy()
  })

  it('shows a toast with title when toast() is called', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger title="Profile saved" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Profile saved')).toBeTruthy()
  })

  it('shows a toast with title and description', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger title="Error" description="Something went wrong" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Error')).toBeTruthy()
    expect(getByText('Something went wrong')).toBeTruthy()
  })

  it('shows success variant toast', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger variant="success" title="Saved!" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Saved!')).toBeTruthy()
  })

  it('shows error variant toast', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger variant="error" title="Failed" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Failed')).toBeTruthy()
  })

  it('shows warning variant toast', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger variant="warning" title="Caution" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Caution')).toBeTruthy()
  })

  it('shows info variant toast', () => {
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger variant="info" title="FYI" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('FYI')).toBeTruthy()
  })

  it('auto-dismisses toast after duration', async () => {
    const { getByTestId, getByText, queryByText } = renderWithToast(
      <ToastTrigger title="Bye soon" duration={2000} />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Bye soon')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(2100)
    })

    await waitFor(() => {
      expect(queryByText('Bye soon')).toBeNull()
    })
  })

  it('dismissAll removes all toasts', () => {
    const { getByTestId, getByText, queryByText } = renderWithToast(
      <ToastTrigger title="Toast 1" />
    )

    fireEvent.press(getByTestId('show-toast'))
    expect(getByText('Toast 1')).toBeTruthy()

    fireEvent.press(getByTestId('dismiss-all'))
    expect(queryByText('Toast 1')).toBeNull()
  })

  it('limits toasts to maxToasts', () => {
    function MultiTrigger() {
      const toast = useToast()
      return (
        <TouchableOpacity
          testID="add-many"
          onPress={() => {
            toast.toast({ title: 'Toast A', duration: 0 })
            toast.toast({ title: 'Toast B', duration: 0 })
            toast.toast({ title: 'Toast C', duration: 0 })
            toast.toast({ title: 'Toast D', duration: 0 })
          }}
        />
      )
    }

    const { getByTestId, queryByText } = render(
      <ToastProvider maxToasts={3}>
        <MultiTrigger />
      </ToastProvider>
    )

    fireEvent.press(getByTestId('add-many'))

    // maxToasts=3, so oldest (Toast A) should be dropped
    expect(queryByText('Toast D')).toBeTruthy()
    expect(queryByText('Toast C')).toBeTruthy()
    expect(queryByText('Toast B')).toBeTruthy()
    expect(queryByText('Toast A')).toBeNull()
  })

  it('renders action button when action is provided', () => {
    const onAction = jest.fn()
    const { getByTestId, getByText } = renderWithToast(
      <ToastTrigger title="Undo?" actionLabel="Undo" onAction={onAction} />
    )
    fireEvent.press(getByTestId('show-toast'))
    const undoButton = getByText('Undo')
    expect(undoButton).toBeTruthy()
    fireEvent.press(undoButton)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('exposes the toast action CTA as an accessible link (BLD-513)', () => {
    const onAction = jest.fn()
    const { getByTestId } = renderWithToast(
      <ToastTrigger title="Config error" actionLabel="Get help" onAction={onAction} />
    )
    fireEvent.press(getByTestId('show-toast'))
    const cta = getByTestId('toast-action')
    expect(cta.props.accessibilityRole).toBe('link')
    expect(cta.props.accessibilityLabel).toBe('Get help')
  })

  it('does not render an action CTA when no action is provided (no regression)', () => {
    const { getByTestId, queryByTestId } = renderWithToast(
      <ToastTrigger title="Plain toast" />
    )
    fireEvent.press(getByTestId('show-toast'))
    expect(queryByTestId('toast-action')).toBeNull()
  })

  it('success() accepts string description shorthand', () => {
    function ShorthandTrigger() {
      const toast = useToast()
      return (
        <TouchableOpacity
          testID="shorthand"
          onPress={() => toast.success('Done', 'All good')}
        />
      )
    }

    const { getByTestId, getByText } = renderWithToast(<ShorthandTrigger />)
    fireEvent.press(getByTestId('shorthand'))
    expect(getByText('Done')).toBeTruthy()
    expect(getByText('All good')).toBeTruthy()
  })
})

describe('useToast outside provider', () => {
  it('throws when used outside ToastProvider', () => {
    function BadComponent() {
      useToast()
      return null
    }

    // Suppress console.error for expected throw
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within a ToastProvider'
    )
    spy.mockRestore()
  })
})
