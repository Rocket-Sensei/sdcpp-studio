# React Hotkeys Library Research

## Overview

This document compares modern alternatives to `react-hotkeys` (greena13/react-hotkeys) for implementing keyboard shortcuts in a React + Vite application.

## Requirements

- Modern, actively maintained library (2024+)
- Compatible with React 18+
- Support for global and scoped hotkeys
- Support for key combinations (Ctrl+Enter, Cmd+Enter, etc.)
- Modal/overlay capability for showing hotkey help
- Good documentation and TypeScript support

## Comparison Table

| Library | NPM Package | Latest Version | Last Updated | Bundle Size | GitHub Stars | TypeScript | Key Features |
|---------|-------------|----------------|--------------|-------------|--------------|-------------|--------------|
| **react-hotkeys-hook** | `react-hotkeys-hook` | 5.2.3 | Jan 14, 2026 | ~2.2 kB min | 3.4k | Yes | Hook-based, scopes, focus trap, key recording, sequences |
| **react-hotkeys** (original) | `react-hotkeys` | 2.0.0 | ~2017 | ~13 kB | 2.2k | Yes | Component-based, focus areas, legacy API |
| **react-hot-keys** | `react-hot-keys` | 2.7.3 | Dec 2023 | Unknown | 433 | Yes | Component-based, simple API |
| **react-keybinds** | `react-keybinds` | 1.0.8 | Jun 2023 | Unknown | 16 | Yes | Provider pattern, platform-specific keys |
| **react-keyboard-shortcuts** | `react-keyboard-shortcuts` | 1.4.1 | ~2020 | Unknown | 25 | No | Priority-based, HOC pattern |
| **kbar** | `kbar` | 0.1.0-beta.48 | Jul 2025 | ~35 kB | 5.2k | Yes | Command palette, animated, extensible |
| **react-cmdk** | `react-cmdk` | ~0.1.0 | Active | Unknown | 1.2k | Yes | Command palette, accessible, Tailwind |
| **@react-hook/hotkey** | `@react-hook/hotkey` | Latest | Active | Unknown | Unknown | Yes | Lightweight, single hook |

---

## Detailed Analysis

### 1. react-hotkeys-hook (Recommended)

**GitHub**: https://github.com/JohannesKlauss/react-hotkeys-hook
**Docs**: https://react-hotkeys-hook.vercel.app/
**NPM**: 1.6M+ weekly downloads

**Key Features:**
- Modern hook-based API (`useHotkeys`)
- Zero dependencies
- Scopes for grouping hotkeys
- Focus trap for component-scoped shortcuts
- Sequential hotkeys support (vim-style)
- Key recording for custom shortcuts
- `isHotkeyPressed()` utility
- Full TypeScript support
- Built-in form tag filtering (prevents triggering in inputs)

**Pros:**
- Most actively maintained (81 releases)
- Excellent documentation with live examples
- Hook-based, fits modern React patterns
- Small bundle size (~2.2 kB)
- Very popular (40k+ dependents)
- Scopes prevent hotkey conflicts
- Description option for building help modals

**Cons:**
- Requires wrapping app in `HotkeysProvider` for scopes
- No built-in help modal component (but descriptions make it easy)

**Bundle Size:**
- Minified: ~7.5 kB
- Gzipped: ~2.2 kB

---

### 2. kbar (Command Palette)

**GitHub**: https://github.com/timc1/kbar
**Docs**: https://kbar.vercel.app/
**NPM**: 176k+ weekly downloads

**Key Features:**
- Full command palette UI (Cmd+K style)
- Built-in animations
- Keyboard navigation
- Nested actions
- Screen reader support
- Virtualized list for performance
- History management (undo/redo)

**Pros:**
- Complete command palette solution
- Beautiful out-of-the-box
- Highly extensible
- Used by major apps (Omnivore, NextUI, etc.)

**Cons:**
- Larger bundle size (~35 kB)
- Focused on command palette, not general hotkeys
- More complex setup for simple hotkey needs

**Best For:** Applications needing a full command palette interface

---

### 3. react-cmdk

**GitHub**: https://github.com/albingroen/react-cmdk
**Docs**: https://react-cmdk.com/
**NPM**: Active

**Key Features:**
- Command palette components
- Accessible (ARIA compliant)
- Dark & light mode
- Tailwind CSS integration
- Icon support via Heroicons

**Pros:**
- Accessible by default
- Flexible component composition
- Good documentation

**Cons:**
- Smaller community than kbar
- Focus on command palette, not general hotkeys

---

### 4. react-hotkeys (Original - Deprecated)

**GitHub**: https://github.com/greena13/react-hotkeys
**Status**: **Unmaintained**

**Note:** This package is explicitly looking for new maintainers and has been unmaintained for 6+ months. Not recommended for new projects.

---

### 5. react-hot-keys (jaywcjlove)

**GitHub**: https://github.com/jaywcjlove/react-hotkeys
**NPM**: `react-hot-keys`
**Version**: 2.7.3 (Dec 2023)

**Key Features:**
- Component-based (`<Hotkeys>`)
- Uses forked hotkeys.js
- onKeyUp/onKeyDown handlers
- Filter support for form elements

**Pros:**
- Simple API
- TypeScript support

**Cons:**
- Component-based (not hook-based)
- Last update Dec 2023
- Smaller community
- No scopes support

---

### 6. react-keybinds

**GitHub**: https://github.com/lifespikes/react-keybinds
**NPM**: `react-keybinds`
**Version**: 1.0.8 (Jun 2023)

**Key Features:**
- Provider pattern (`KeyBindProvider`)
- Platform-specific key bindings
- Register shortcuts dynamically
- List registered shortcuts utility

**Pros:**
- Platform-aware (Mac/Windows key differences)
- Can list all registered shortcuts

**Cons:**
- Last update Jun 2023
- Small community (16 stars)
- No longer actively maintained

---

### 7. react-keyboard-shortcuts

**GitHub**: https://github.com/CurtisHumphrey/react-keyboard-shortcuts
**NPM**: `react-keyboard-shortcuts`

**Key Features:**
- Priority-based event handling
- HOC pattern
- Uses Mousetrap for key parsing
- Works globally regardless of focus

**Pros:**
- Priority system for conflicting hotkeys
- Global hotkeys work outside focus tree

**Cons:**
- No TypeScript support
- HOC pattern (outdated)
- Not actively maintained
- Small community

---

### 8. @react-hook/hotkey

**NPM**: `@react-hook/hotkey`

**Key Features:**
- Single hook approach
- Interop between event.key and event.which
- Good TypeScript support

**Pros:**
- Part of react-hook suite (well-maintained)
- Minimal API

**Cons:**
- Less feature-rich than react-hotkeys-hook
- Smaller community

---

## Recommendation

### For sd.cpp Studio: **react-hotkeys-hook**

**Reasoning:**

1. **Modern & Actively Maintained**: Latest release was 18 days ago (Jan 2026), with 81 total releases and 40k+ dependents

2. **Perfect Feature Match**:
   - Hook-based API matches our React 18 + Vite stack
   - Scopes allow organizing hotkeys by feature area (generate, gallery, models)
   - Focus trap works well for form inputs (prompt bar)
   - Description option enables building a help modal

3. **Small Bundle Size**: Only ~2.2 kB gzipped, won't impact app performance

4. **TypeScript Support**: Built with TypeScript, excellent type definitions

5. **Proven in Production**: Used by thousands of projects, mature and stable

6. **Easy Integration**: Can add incrementally, no major refactor required

### Alternative (If Command Palette Needed): **kbar**

If the project needs a full command palette (Cmd+K style navigation), consider using kbar alongside react-hotkeys-hook:
- Use `react-hotkeys-hook` for application hotkeys (Ctrl+Enter to generate, etc.)
- Use `kbar` for the command palette UI

---

## Implementation Notes

### Installing react-hotkeys-hook

```bash
npm install react-hotkeys-hook
```

### Basic Usage Example

```tsx
import { useHotkeys } from 'react-hotkeys-hook';

function GenerateButton() {
  useHotkeys('ctrl+enter, cmd+enter', () => {
    generateImage();
  });

  return <button>Generate</button>;
}
```

### Scoped Usage

```tsx
import { HotkeysProvider, useHotkeys } from 'react-hotkeys-hook';

// Wrap your app
function App() {
  return (
    <HotkeysProvider initiallyActiveScopes={['generate']}>
      <GeneratePanel />
      <GalleryPanel />
    </HotkeysProvider>
  );
}

// In a component
function GeneratePanel() {
  useHotkeys('ctrl+enter', () => generate(), {
    scopes: ['generate']
  });
}
```

### Help Modal Support

```tsx
function HotkeysHelp() {
  const { hotkeys } = useHotkeysContext();

  return (
    <Dialog>
      <h2>Keyboard Shortcuts</h2>
      {hotkeys.map(hk => (
        <div key={hk.keys}>
          <kbd>{hk.keys}</kbd>
          <span>{hk.description}</span>
        </div>
      ))}
    </Dialog>
  );
}
```

---

## Sources

- [react-hotkeys-hook GitHub](https://github.com/JohannesKlauss/react-hotkeys-hook)
- [react-hotkeys-hook Documentation](https://react-hotkeys-hook.vercel.app/)
- [kbar GitHub](https://github.com/timc1/kbar)
- [react-cmdk GitHub](https://github.com/albingroen/react-cmdk)
- [NPM Trends Comparison](https://npmtrends.com/react-hotkeys-vs-react-hotkeys-hook-vs-use-hotkeys)
- [Reddit: Hotkey Libraries Discussion](https://www.reddit.com/r/reactjs/comments/nytlo0/hotkey_libraries_whats_your_solution/)
