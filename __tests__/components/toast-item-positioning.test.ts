// BLD-569 regression-lock: toast is bottom-anchored and safe-area aware.
// Prevents drift back to hardcoded `top = (ios ? 59 : 20)` that hid the toast
// under display cutouts on modern Android (Z Fold 6, Pixel foldables, etc.).
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../components/ui/toast-item.tsx'),
  'utf8',
);
const providerSource = fs.readFileSync(
  path.resolve(__dirname, '../../components/ui/bna-toast.tsx'),
  'utf8',
);

describe('toast positioning contract (BLD-569)', () => {
  it('does NOT use Platform.OS branch for toast offset', () => {
    expect(source).not.toMatch(/Platform\.OS\s*===\s*['"]ios['"]\s*\?\s*\d+\s*:\s*\d+/);
  });

  it('does NOT hardcode numeric top = 20 or top = 59', () => {
    expect(source).not.toMatch(/\btop\s*=\s*\(\s*Platform/);
  });

  it('uses safe-area insets for offset', () => {
    expect(source).toMatch(/useSafeAreaInsets/);
    expect(source).toMatch(/insets\.bottom/);
  });

  it('anchors container to bottom, not top', () => {
    // containerStyle in provider sits at bottom edge
    expect(providerSource).toMatch(/bottom:\s*0/);
    expect(providerSource).not.toMatch(/containerStyle[^}]*top:\s*0/);
  });

  it('applies a max-width cap for legibility', () => {
    expect(source).toMatch(/maxWidth/);
  });
});
