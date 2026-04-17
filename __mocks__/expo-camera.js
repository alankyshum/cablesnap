// Mock for expo-camera — avoids loading native camera module in Jest
const React = require('react');

const CameraView = React.forwardRef((props, ref) => {
  return React.createElement('View', {
    ...props,
    ref,
    testID: props.testID || 'camera-view',
  }, props.children);
});
CameraView.displayName = 'CameraView';

const useCameraPermissions = () => {
  const [permission, setPermission] = React.useState({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
    expires: 'never',
  });

  const requestPermission = async () => {
    const granted = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
    setPermission(granted);
    return granted;
  };

  return [permission, requestPermission];
};

module.exports = {
  CameraView,
  useCameraPermissions,
  CameraType: { back: 'back', front: 'front' },
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
};
