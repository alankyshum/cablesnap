import fs from 'fs';
import path from 'path';

// Regression test for BLD-507: toast-item must use theme tokens, not hardcoded
// hex color literals. Catches drift back to raw #RRGGBB values.
describe('toast-item theme-token contract', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../components/ui/toast-item.tsx'),
    'utf8',
  );

  it('does not contain raw hex color literals', () => {
    // Match any #RGB or #RRGGBB or #RRGGBBAA string literal (quoted).
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it('sources variant colors from Colors.dark.* tokens', () => {
    expect(source).toMatch(/success:\s*Colors\.dark\.green/);
    expect(source).toMatch(/error:\s*Colors\.dark\.red/);
    expect(source).toMatch(/warning:\s*Colors\.dark\.orange/);
    expect(source).toMatch(/info:\s*Colors\.dark\.blue/);
    expect(source).toMatch(/MUTED\s*=\s*Colors\.dark\.textMuted/);
  });
});
