const React = require('react');

const BottomSheet = React.forwardRef(({ children, ...props }, ref) => {
  React.useImperativeHandle(ref, () => ({
    snapToIndex: jest.fn(),
    snapToPosition: jest.fn(),
    expand: jest.fn(),
    collapse: jest.fn(),
    close: jest.fn(),
    forceClose: jest.fn(),
  }));
  return React.createElement('View', { testID: 'bottom-sheet', ...props }, children);
});

BottomSheet.displayName = 'BottomSheet';

const BottomSheetModal = React.forwardRef(({ children, ...props }, ref) => {
  React.useImperativeHandle(ref, () => ({
    present: jest.fn(),
    dismiss: jest.fn(),
    snapToIndex: jest.fn(),
    snapToPosition: jest.fn(),
    expand: jest.fn(),
    collapse: jest.fn(),
    close: jest.fn(),
    forceClose: jest.fn(),
  }));
  return React.createElement('View', { testID: 'bottom-sheet-modal', ...props }, children);
});

BottomSheetModal.displayName = 'BottomSheetModal';

const BottomSheetModalProvider = ({ children }) =>
  React.createElement(React.Fragment, null, children);

const BottomSheetFlatList = React.forwardRef((props, ref) =>
  React.createElement('FlatList', { ...props, ref })
);

const BottomSheetScrollView = React.forwardRef((props, ref) =>
  React.createElement('ScrollView', { ...props, ref })
);

const BottomSheetBackdrop = (props) =>
  React.createElement('View', { testID: 'bottom-sheet-backdrop', ...props });

module.exports = {
  __esModule: true,
  default: BottomSheet,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetFlatList,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetView: ({ children, ...props }) => React.createElement('View', props, children),
  BottomSheetTextInput: React.forwardRef((props, ref) =>
    React.createElement('TextInput', { ...props, ref })
  ),
  useBottomSheet: () => ({ close: jest.fn(), snapToIndex: jest.fn() }),
  useBottomSheetModal: () => ({ dismiss: jest.fn() }),
};
