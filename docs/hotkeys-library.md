# react-hotkeys-hook API Reference

**Package**: `react-hotkeys-hook`
**Version**: 5.2.3
**Repository**: https://github.com/JohannesKlauss/react-hotkeys-hook
**Documentation**: https://react-hotkeys-hook.vercel.app/

---

## Table of Contents

- [Installation](#installation)
- [Core API](#core-api)
- [useHotkeys](#usehotkeys)
- [HotkeysProvider](#hotkeysprovider)
- [useHotkeysContext](#usehotkeyscontext)
- [isHotkeyPressed](#ishotkeypressed)
- [useRecordHotkeys](#userecordhotkeys)
- [Options Reference](#options-reference)
- [Migration from react-hotkeys](#migration-from-react-hotkeys)
- [TypeScript Types](#typescript-types)
- [Common Patterns](#common-patterns)

---

## Installation

```bash
npm install react-hotkeys-hook
```

```bash
yarn add react-hotkeys-hook
```

```bash
pnpm add react-hotkeys-hook
```

---

## Core API

### Exports

```typescript
import {
  // Main hook
  useHotkeys,

  // Provider for scopes
  HotkeysProvider,

  // Context hook
  useHotkeysContext,

  // Utility to check key state
  isHotkeyPressed,

  // Recording hook for custom shortcuts
  useRecordHotkeys,

  // Types
  type HotkeysEvent,
  type Options,
  type HotkeyCallback,
} from 'react-hotkeys-hook';
```

---

## useHotkeys

The primary hook for registering keyboard shortcuts.

### Signature

```typescript
useHotkeys(
  keys: string | string[],
  callback: (event: KeyboardEvent, handler: HotkeysEvent) => void,
  options?: Options,
  deps?: DependencyList
): RefObject<HTMLElement> | void
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keys` | `string` or `string[]` | Yes | - | Key combination(s) to listen for |
| `callback` | `(event, handler) => void` | Yes | - | Function called when hotkey is pressed |
| `options` | `Options` | No | `{}` | Configuration options |
| `deps` | `DependencyList` | No | `[]` | Dependency array for callback |

### Key Syntax

```typescript
// Single key
useHotkeys('escape', () => close());

// Key combinations
useHotkeys('ctrl+s', () => save());
useHotkeys('meta+s', () => save()); // Cmd on Mac, Win on Linux

// Multiple keys (comma-separated)
useHotkeys('ctrl+k, cmd+k', () => openCommandPalette());

// Sequences (vim-style)
useHotkeys('g>i>t', () => goToInbox());

// Modifier combinations
useHotkeys('ctrl+shift+k', () => openAdvancedSearch());
useHotkeys('alt+shift+t', () => toggleTheme());

// Special keys
useHotkeys('space', () => playPause());
useHotkeys('enter', () => submit());
```

### Supported Modifiers

| Modifier | Description |
|----------|-------------|
| `ctrl`, `control` | Control key |
| `meta`, `command`, `cmd` | Command key (Mac) / Windows key |
| `alt`, `option` | Alt/Option key |
| `shift` | Shift key |

### Return Value

Returns a ref when `enabled` is used (for focus trap). Returns `void` otherwise.

```typescript
// With focus trap
const ref = useHotkeys('ctrl+b', () => bold());
// Use ref on the element you want to scope to
<div ref={ref}>Press ctrl+b here</div>
```

---

## HotkeysProvider

Provider component for enabling scopes and global hotkey management.

### Signature

```typescript
<HotkeysProvider initiallyActiveScopes?: string[]>
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `initiallyActiveScopes` | `string[]` | No | `['*']` | Scopes that are active on mount |

### Usage

```tsx
import { HotkeysProvider } from 'react-hotkeys-hook';

function App() {
  return (
    <HotkeysProvider initiallyActiveScopes={['generate']}>
      <GeneratePanel />
      <GalleryPanel />
      <ModelManager />
    </HotkeysProvider>
  );
}
```

---

## useHotkeysContext

Hook to access hotkey context for managing scopes and registered hotkeys.

### Signature

```typescript
const {
  enableScope,
  disableScope,
  toggleScope,
  hotkeys,
} = useHotkeysContext();
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `enableScope` | `(scope: string) => void` | Activate a scope |
| `disableScope` | `(scope: string) => void` | Deactivate a scope |
| `toggleScope` | `(scope: string) => void` | Toggle a scope on/off |
| `hotkeys` | `Hotkey[]` | Array of registered hotkeys with metadata |

### Hotkey Interface

```typescript
interface Hotkey {
  keys: string | string[];
  callback: (event: KeyboardEvent, handler: HotkeysEvent) => void;
  description: string | undefined;
  scopes: string[] | undefined;
  options: Options;
}
```

### Usage

```tsx
import { useHotkeysContext } from 'react-hotkeys-hook';

function ScopeToggle() {
  const { toggleScope, hotkeys } = useHotkeysContext();

  return (
    <div>
      <button onClick={() => toggleScope('generate')}>
        Toggle Generate Shortcuts
      </button>
      <ul>
        {hotkeys.map((hk, i) => (
          <li key={i}>
            <kbd>{hk.keys}</kbd>
            <span>{hk.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## isHotkeyPressed

Utility function to check if a key is currently pressed (outside of hook context).

### Signature

```typescript
isHotkeyPressed(keys: string | string[], splitKey?: string): boolean
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keys` | `string` or `string[]` | Yes | - | Key(s) to check |
| `splitKey` | `string` | No | `','` | Separator for multiple keys |

### Usage

```typescript
import { isHotkeyPressed } from 'react-hotkeys-hook';

// Check single key
if (isHotkeyPressed('shift')) {
  // Shift is being held down
}

// Check multiple keys (OR logic)
if (isHotkeyPressed(['ctrl', 'meta'])) {
  // Either Ctrl or Cmd is pressed
}

// Check combination
if (isHotkeyPressed('ctrl') && isHotkeyPressed('shift')) {
  // Ctrl+Shift is pressed
}
```

---

## useRecordHotkeys

Hook for recording custom hotkeys (let users define their own shortcuts).

### Signature

```typescript
const {
  keys,
  start,
  stop,
  isRecording,
} = useRecordHotkeys();
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `keys` | `Set<string>` | Set of recorded keys |
| `start` | `() => void` | Start recording |
| `stop` | `() => void` | Stop recording |
| `isRecording` | `boolean` | Recording state |

### Usage

```tsx
import { useRecordHotkeys } from 'react-hotkeys-hook';

function HotkeyRecorder() {
  const { keys, start, stop, isRecording } = useRecordHotkeys();

  return (
    <div>
      <p>Recorded: {Array.from(keys).join(' + ')}</p>
      <button onClick={isRecording ? stop : start}>
        {isRecording ? 'Stop Recording' : 'Record Shortcut'}
      </button>
    </div>
  );
}
```

---

## Options Reference

Configuration options for `useHotkeys`.

### Available Options

```typescript
interface Options {
  // Enable/disable the hotkey
  enabled?: boolean | ((event: KeyboardEvent, handler: HotkeysEvent) => boolean);

  // Enable in form elements (default: false)
  enableOnFormTags?: boolean | FormTags[];

  // Enable on contentEditable elements
  enableOnContentEditable?: boolean;

  // Key combination separator
  combinationKey?: string;

  // Multiple keys separator
  splitKey?: string;

  // Scope(s) for this hotkey
  scopes?: string | string[];

  // Trigger on keyup
  keyup?: boolean;

  // Trigger on keydown (default: true)
  keydown?: boolean;

  // Prevent default browser behavior
  preventDefault?: boolean | ((event: KeyboardEvent, handler: HotkeysEvent) => boolean);

  // Description for help modal
  description?: string;
}
```

### Option Details

#### enabled

Enable or disable the hotkey dynamically.

```typescript
// Boolean
const [enabled, setEnabled] = useState(true);
useHotkeys('ctrl+s', () => save(), { enabled });

// Function
useHotkeys('ctrl+s', () => save(), {
  enabled: (event) => {
    return !event.repeat; // Only trigger once per press
  }
});
```

#### enableOnFormTags

Allow hotkey to trigger when focused on form elements.

```typescript
// All form tags
useHotkeys('ctrl+s', () => save(), {
  enableOnFormTags: true
});

// Specific tags
useHotkeys('ctrl+enter', () => submit(), {
  enableOnFormTags: ['input', 'textarea']
});
```

#### scopes

Limit hotkey to specific scope(s).

```typescript
// Single scope
useHotkeys('ctrl+s', () => save(), {
  scopes: 'editor'
});

// Multiple scopes
useHotkeys('ctrl+s', () => save(), {
  scopes: ['editor', 'preview']
});
```

#### preventDefault

Prevent default browser behavior.

```typescript
// Always prevent
useHotkeys('meta+s', () => save(), {
  preventDefault: true
});

// Conditional
useHotkeys('meta+s', () => save(), {
  preventDefault: (event) => {
    // Don't prevent if in certain contexts
    return !event.target.closest('.allow-default');
  }
});
```

#### description

Description for building help modals.

```typescript
useHotkeys('ctrl+enter', () => generate(), {
  description: 'Generate image'
});

// Can be accessed via context
const { hotkeys } = useHotkeysContext();
hotkeys.map(h => (
  <div key={h.keys}>
    <kbd>{h.keys}</kbd>
    <span>{h.description}</span>
  </div>
));
```

---

## Migration from react-hotkeys

### Key Differences

| Feature | react-hotkeys | react-hotkeys-hook |
|---------|--------------|-------------------|
| API | Component-based | Hook-based |
| Focus management | `<HotKeys>` wrapper | Ref-based or scopes |
| Scopes | Built into component | Explicit scope strings |
| Description | Not available | Built-in `description` option |

### Migration Examples

**Before (react-hotkeys):**

```tsx
import { HotKeys } from 'react-hotkeys';

const keyMap = {
  GENERATE: 'ctrl+enter',
  SAVE: 'ctrl+s',
};

const handlers = {
  GENERATE: () => generate(),
  SAVE: () => save(),
};

function App() {
  return (
    <HotKeys keyMap={keyMap} handlers={handlers}>
      <div>...</div>
    </HotKeys>
  );
}
```

**After (react-hotkeys-hook):**

```tsx
import { useHotkeys } from 'react-hotkeys-hook';

function App() {
  useHotkeys('ctrl+enter', () => generate(), {
    description: 'Generate image'
  });
  useHotkeys('ctrl+s', () => save(), {
    description: 'Save settings'
  });

  return <div>...</div>;
}
```

---

## TypeScript Types

### Main Types

```typescript
// Hotkey event (second callback parameter)
interface HotkeysEvent {
  keys: string[];
  meta: Record<string, any>;
}

// Callback type
type HotkeyCallback = (event: KeyboardEvent, handler: HotkeysEvent) => void;

// Options type
interface Options {
  enabled?: boolean | ((event: KeyboardEvent, handler: HotkeysEvent) => boolean);
  enableOnFormTags?: boolean | FormTags[];
  enableOnContentEditable?: boolean;
  combinationKey?: string;
  splitKey?: string;
  scopes?: string | string[];
  keyup?: boolean;
  keydown?: boolean;
  preventDefault?: boolean | ((event: KeyboardEvent, handler: HotkeysEvent) => boolean);
  description?: string;
}

// Form tag types
type FormTags = 'input' | 'textarea' | 'select';
```

### Context Types

```typescript
interface HotkeysContextType {
  enableScope: (scope: string) => void;
  disableScope: (scope: string) => void;
  toggleScope: (scope: string) => void;
  hotkeys: Hotkey[];
}

interface Hotkey {
  keys: string | string[];
  callback: HotkeyCallback;
  description?: string;
  scopes?: string[];
  options: Options;
}
```

---

## Common Patterns

### Global Shortcuts

```typescript
function App() {
  // These work globally
  useHotkeys('ctrl+k', () => openCommandPalette());
  useHotkeys('ctrl+/', () => openHelp());

  return <YourApp />;
}
```

### Component-Scoped Shortcuts

```typescript
function PromptBar() {
  // Only works when this component has focus
  const ref = useHotkeys('ctrl+enter', () => generate());

  return (
    <div ref={ref} tabIndex={-1}>
      <input type="text" placeholder="Enter prompt..." />
      <p>Press Ctrl+Enter to generate</p>
    </div>
  );
}
```

### Scope-Based Organization

```typescript
function App() {
  return (
    <HotkeysProvider initiallyActiveScopes={['generate']}>
      <GeneratePanel />      {/* scope: 'generate' */}
      <GalleryPanel />        {/* scope: 'gallery' */}
      <ModelManager />        {/* scope: 'models' */}
    </HotkeysProvider>
  );
}

function GeneratePanel() {
  const { enableScope } = useHotkeysContext();

  useEffect(() => {
    enableScope('generate');
  }, []);

  useHotkeys('ctrl+enter', () => generate(), {
    scopes: 'generate',
    description: 'Generate image'
  });

  // ...
}
```

### Disable in Inputs

```typescript
// Hotkeys are automatically disabled in inputs by default
useHotkeys('ctrl+s', () => save());

// Explicitly enable in specific inputs
useHotkeys('ctrl+enter', () => submitForm(), {
  enableOnFormTags: ['input', 'textarea'],
  description: 'Submit form'
});
```

### Building a Help Modal

```typescript
function HotkeysHelp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { hotkeys } = useHotkeysContext();

  // Group by scope
  const byScope = hotkeys.reduce((acc, hk) => {
    const scope = hk.scopes?.[0] || 'global';
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(hk);
    return acc;
  }, {} as Record<string, typeof hotkeys>);

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
      {Object.entries(byScope).map(([scope, items]) => (
        <div key={scope}>
          <h3>{scope}</h3>
          {items.map((hk, i) => (
            <div key={i}>
              <kbd>{hk.keys}</kbd>
              <span>{hk.description}</span>
            </div>
          ))}
        </div>
      ))}
    </Dialog>
  );
}
```

### Conditional Hotkeys

```typescript
function EditableText({ isEditing }: { isEditing: boolean }) {
  useHotkeys('escape', () => setEditing(false), {
    enabled: isEditing,
    description: 'Cancel editing'
  });

  useHotkeys('enter', () => save(), {
    enabled: isEditing,
    enableOnFormTags: ['input'],
    description: 'Save changes'
  });

  return isEditing ? <input /> : <span onClick={() => setEditing(true)}>{text}</span>;
}
```

---

## Examples for sd.cpp Studio

### Generate Panel Hotkeys

```typescript
// components/GeneratePanel.tsx
import { useHotkeys } from 'react-hotkeys-hook';

export function GeneratePanel() {
  const { generate } = useImageGeneration();

  // Generate image
  useHotkeys('ctrl+enter, cmd+enter', () => {
    generate();
  }, { description: 'Generate image' });

  // Clear prompt
  useHotkeys('escape', () => {
    if (!prompt) return;
    clearPrompt();
  }, {
    enabled: !!prompt,
    description: 'Clear prompt'
  });

  // Open model selector
  useHotkeys('ctrl+m, cmd+m', () => {
    openModelSelector();
  }, { description: 'Change model' });

  return (
    <div>
      <PromptBar />
      <ModelSelector />
      <GenerateButton />
    </div>
  );
}
```

### Gallery Navigation

```typescript
// components/GalleryPanel.tsx
import { useHotkeys } from 'react-hotkeys-hook';

export function GalleryPanel() {
  const { nextImage, prevImage, selectImage } = useGallery();

  // Navigate images
  useHotkeys('right, j', () => nextImage(), {
    description: 'Next image'
  });
  useHotkeys('left, k', () => prevImage(), {
    description: 'Previous image'
  });

  // Open in lightbox
  useHotkeys('enter, space', () => {
    openLightbox(selectedImage);
  }, {
    enabled: !!selectedImage,
    description: 'View full size'
  });

  return <GalleryGrid />;
}
```

### Model Management

```typescript
// components/ModelManager.tsx
import { useHotkeys } from 'react-hotkeys-hook';

export function ModelManager() {
  const { startModel, stopModel } = useModels();

  useHotkeys('ctrl+shift+m', () => {
    stopCurrentModel();
  }, { description: 'Stop model' });

  return (
    <div>
      <ModelList />
    </div>
  );
}
```

### Global Shortcuts (App Root)

```typescript
// App.tsx
import { HotkeysProvider, useHotkeys } from 'react-hotkeys-hook';

export function App() {
  return (
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <GlobalHotkeys />
      <Router>
        <GeneratePanel />
        <GalleryPanel />
        <ModelManager />
      </Router>
      <HotkeyHelp />
    </HotkeysProvider>
  );
}

function GlobalHotkeys() {
  const navigate = useNavigate();

  // Command palette
  useHotkeys('ctrl+k, cmd+k', () => {
    openCommandPalette();
  }, { description: 'Open command palette' });

  // Navigation
  useHotkeys('ctrl+g', () => navigate('/generate'), {
    description: 'Go to Generate'
  });
  useHotkeys('ctrl+shift+g', () => navigate('/gallery'), {
    description: 'Go to Gallery'
  });
  useHotkeys('ctrl+shift+m', () => navigate('/models'), {
    description: 'Go to Models'
  });

  // Help
  useHotkeys('ctrl+/, cmd+/', () => {
    openHelpModal();
  }, { description: 'Show keyboard shortcuts' });

  return null;
}
```

---

## Resources

- [Official Documentation](https://react-hotkeys-hook.vercel.app/)
- [GitHub Repository](https://github.com/JohannesKlauss/react-hotkeys-hook)
- [NPM Package](https://www.npmjs.com/package/react-hotkeys-hook)
- [Stack Overflow Tag](https://stackoverflow.com/questions/tagged/react-hotkeys-hook)
