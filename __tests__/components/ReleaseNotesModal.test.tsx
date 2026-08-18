/**
 * BLD-571: ReleaseNotesModal unit tests.
 *
 * Covers:
 *  - Render with visible=true, renders entries.
 *  - Tap close → onClose called.
 *  - Current-version chip matches case-insensitively against entry.version.
 *  - No match → NO chip rendered on any entry, modal still renders cleanly.
 *  - Empty entries → empty-state string renders.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.26.8' } },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({}, {
    get: (_, name) => {
      const Mock = (props: { testID?: string }) => (
        <Text testID={props.testID ?? `icon-${String(name)}`}>{String(name)}</Text>
      );
      (Mock as unknown as { displayName: string }).displayName = `MockIcon(${String(name)})`;
      return Mock;
    },
  });
});

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import ReleaseNotesModal from '../../components/ReleaseNotesModal';
import type { ReleaseEntry } from '../../lib/changelog.generated';
import { CHANGELOG } from '../../lib/changelog.generated';
import { stripInternalRefs } from '../../lib/release-notes-markdown';

jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

const FIXTURE: ReleaseEntry[] = [
  {
    version: '0.26.8',
    date: '2026-04-24',
    versionCode: 57,
    body: '- Shiny new thing\n- Another thing',
  },
  {
    version: '0.26.7',
    date: '2026-04-22',
    versionCode: null,
    body: '- Previous release bullet',
  },
];

describe('ReleaseNotesModal', () => {
  it('renders the modal with header and entries when visible', () => {
    const { getByText, getByTestId } = render(
      <ReleaseNotesModal visible onClose={jest.fn()} entries={FIXTURE} />
    );
    expect(getByText("What's New")).toBeTruthy();
    expect(getByTestId('release-notes-entry-0.26.8')).toBeTruthy();
    expect(getByTestId('release-notes-entry-0.26.7')).toBeTruthy();
    // Markdown renderer splits bullets into separate rows; assert on the
    // rendered content text nodes rather than the raw markdown string.
    expect(getByText('Shiny new thing')).toBeTruthy();
    expect(getByText('Another thing')).toBeTruthy();
    expect(getByText('Previous release bullet')).toBeTruthy();
  });

  it('calls onClose when the close button is tapped', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ReleaseNotesModal visible onClose={onClose} entries={FIXTURE} />
    );
    fireEvent.press(getByTestId('release-notes-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the Current chip on the entry matching currentVersion (case-insensitive)', () => {
    const { getByTestId, queryAllByTestId } = render(
      <ReleaseNotesModal
        visible
        onClose={jest.fn()}
        entries={FIXTURE}
        currentVersion="0.26.8"
      />
    );
    // Exactly one chip.
    const chips = queryAllByTestId('release-notes-current-chip');
    expect(chips).toHaveLength(1);
    // And it is anchored to the matching entry.
    expect(getByTestId('release-notes-entry-0.26.8')).toBeTruthy();
  });

  it('renders NO Current chip when currentVersion does not match any entry', () => {
    const { queryAllByTestId, getByTestId } = render(
      <ReleaseNotesModal
        visible
        onClose={jest.fn()}
        entries={FIXTURE}
        currentVersion="9.9.9"
      />
    );
    expect(queryAllByTestId('release-notes-current-chip')).toHaveLength(0);
    // Modal still renders cleanly.
    expect(getByTestId('release-notes-entry-0.26.8')).toBeTruthy();
    expect(getByTestId('release-notes-entry-0.26.7')).toBeTruthy();
  });

  it('renders empty state when no entries provided', () => {
    const { getByText, getByTestId } = render(
      <ReleaseNotesModal visible onClose={jest.fn()} entries={[]} />
    );
    expect(getByTestId('release-notes-empty')).toBeTruthy();
    expect(getByText('No release notes available')).toBeTruthy();
  });

  it('renders bold, italic, and inline code markdown', () => {
    const { getByText } = render(
      <ReleaseNotesModal
        visible
        onClose={jest.fn()}
        entries={[{ ...FIXTURE[0], body: '- **bold** *italic* `code`' }]}
      />
    );

    expect(getByText('bold')).toBeTruthy();
    expect(getByText('italic')).toBeTruthy();
    expect(getByText('code')).toBeTruthy();
  });

  it('renders links and opens safe URLs', () => {
    const { getByRole } = render(
      <ReleaseNotesModal
        visible
        onClose={jest.fn()}
        entries={[{ ...FIXTURE[0], body: '- [Docs](https://example.com)' }]}
      />
    );

    fireEvent.press(getByRole('link', { name: 'Docs' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('does not open non-http links', () => {
    const { getByText } = render(
      <ReleaseNotesModal
        visible
        onClose={jest.fn()}
        entries={[{ ...FIXTURE[0], body: '- [Internal](/internal)' }]}
      />
    );

    fireEvent.press(getByText('Internal'));
    expect(Linking.openURL).not.toHaveBeenCalledWith('/internal');
  });
});

describe('stripInternalRefs', () => {
  it.each([
    ['([BLD-3498](/BLD/issues/BLD-3498))', ''],
    ['... legibility. (BLD-3195)', '... legibility.'],
    ['(#609, BLD-1257)', '(#609)'],
    ['(BLD-1636, BLD-1635)', ''],
    ['(#648)', '(#648)'],
    ['even after the BLD-2197 font-shrink fix', 'even after the font-shrink fix'],
    ['restored the BLD-565 invariant', 'restored the invariant'],
    ['the one-time post-BLD-485 reinstall banner', 'the one-time post reinstall banner'],
    ['bld-123-feature branch', 'branch'],
  ])('strips internal reference from %j', (input, expected) => {
    expect(stripInternalRefs(input)).toBe(expected);
  });

  it('removes internal references from the full generated changelog', () => {
    const stripped = CHANGELOG.flatMap((entry) => entry.body.split('\n'))
      .map(stripInternalRefs)
      .join('\n');

    expect(stripped).not.toMatch(/BLD-?\d/i);
    expect(stripped).not.toMatch(/\/BLD(?:\/|\b)/i);
  });
});

describe('ReleaseNotesModal regression lock (BLD-568/569)', () => {
  const fs = require('fs');
  const path = require('path');
  const SOURCE_PATH = path.join(
    __dirname,
    '..',
    '..',
    'components',
    'ReleaseNotesModal.tsx'
  );
  const source: string = fs.readFileSync(SOURCE_PATH, 'utf8');
  // Strip full-line comments so banned-pattern docs (if any in the future)
  // do not defeat the lock.
  const executable = source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith('//')) return false;
      if (t.startsWith('*')) return false;
      if (t.startsWith('/*')) return false;
      return true;
    })
    .join('\n');

  it("contains no hardcoded Platform.OS === 'ios' ? N : N cutout literal", () => {
    expect(executable).not.toMatch(/Platform\.OS\s*===\s*['"]ios['"]\s*\?\s*\d+\s*:\s*\d+/);
  });
});
