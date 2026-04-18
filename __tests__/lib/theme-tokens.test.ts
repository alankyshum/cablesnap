import { Colors, lightColors, darkColors } from '../../theme/colors';

describe('Theme color tokens', () => {
  it('exports light and dark color sets', () => {
    expect(Colors.light).toBeDefined();
    expect(Colors.dark).toBeDefined();
  });

  it('has banner background tokens in both themes', () => {
    expect(lightColors.warningBanner).toBeDefined();
    expect(lightColors.errorBanner).toBeDefined();
    expect(darkColors.warningBanner).toBeDefined();
    expect(darkColors.errorBanner).toBeDefined();
  });

  it('has shadow and onToast tokens in both themes', () => {
    expect(lightColors.shadow).toBe('#000000');
    expect(darkColors.shadow).toBe('#000000');
    expect(lightColors.onToast).toBe('#FFFFFF');
    expect(darkColors.onToast).toBe('#FFFFFF');
  });

  it('has distinct banner colors for light and dark modes', () => {
    expect(lightColors.warningBanner).not.toBe(darkColors.warningBanner);
    expect(lightColors.errorBanner).not.toBe(darkColors.errorBanner);
  });
});
