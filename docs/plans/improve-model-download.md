# Model Download Service Improvements

## Overview

This plan addresses multiple issues with the current model download service (`backend/services/modelDownloader.js`):

1. **Empty stderr reporting** - Python subprocess stderr shows empty messages
2. **No file logging** - Downloads only log to console
3. **Wrong default downloader** - Uses Python first instead of Node.js easydl
4. **No WebSocket progress** - Users can't see download progress in UI
5. **No test coverage** - Zero tests for download functionality
6. **Missing models shown** - UI shows all models regardless of file presence

## Target Model

We'll use **z-image-turbo** as the reference model:
- Repo: `leejet/Z-Image-Turbo-GGUF`
- Files:
  - `z_image_turbo-Q8_0.gguf` (main model)
  - `ae.safetensors` (VAE - from `black-forest-labs/FLUX.1-schnell`)
  - `Qwen3-4B-Instruct-2507-Q8_0.gguf` (LLM - from `unsloth/Qwen3-4B-Instruct-2507-GGUF`)

---

## Implementation Steps

### Phase 1: Fix Core Download Service Issues

#### Step 1.1: Fix stderr Reporting
**File**: `backend/services/modelDownloader.js`

**Current Issue** (lines 316-321):
```javascript
python.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    logger.error({ msg }, 'Python stderr');
  }
});
```

**Problem**: The log output shows `[modelDownloader] Python stderr` with an empty `msg` field because the logger is receiving the object with a `msg` key but the actual content is in `data.toString()`.

**Fix**:
1. Capture full stderr content with proper buffering (multi-line errors)
2. Include stderr in download job status for UI display
3. Add proper error context (file being downloaded, operation in progress)

```javascript
let stderrBuffer = [];
python.stderr.on('data', (data) => {
  const content = data.toString();
  stderrBuffer.push(content);
  logger.error({
    content: content.trim(),
    file: fileName,
    repo
  }, 'Python subprocess stderr');

  // Store in job for error reporting
  if (!job.stderr) job.stderr = [];
  job.stderr.push(content.trim());
});
```

#### Step 1.2: Add File Logging
**File**: `backend/services/modelDownloader.js`

**Changes**:
1. Add winston file transport for download-specific logs
2. Create dedicated download log file: `backend/data/logs/downloads.log`
3. Log all download operations, progress, and errors to file

```javascript
import { createLogger, transports } from '../utils/logger.js';
import { join } from 'path';

// Add file transport for download logs
const downloadLogger = createLogger('modelDownloader', [
  new transports.File({
    filename: join(process.cwd(), 'data/logs/downloads.log'),
    level: 'info'
  })
]);
```

#### Step 1.3: Switch Default Downloader
**File**: `backend/services/modelDownloader.js`

**Current** (line 61):
```javascript
const USE_PYTHON_DOWNLOADER = process.env.USE_PYTHON_DOWNLOADER !== 'false';
```

**Change to**:
```javascript
const USE_PYTHON_DOWNLOADER = process.env.USE_PYTHON_DOWNLOADER === 'true';
```

This makes Node.js (easydl) the default, with Python as opt-in via environment variable.

**Also update** `getDownloadMethod()` (line 121) to prefer Node.js:
```javascript
async function getDownloadMethod() {
  // Check explicit Python preference first
  if (USE_PYTHON_DOWNLOADER) {
    if (pythonAvailable && hfHubAvailable) {
      return DOWNLOAD_METHOD.PYTHON;
    }
  }

  // Prefer Node.js by default
  if (EasyDl) {
    return DOWNLOAD_METHOD.NODE;
  }

  // Fall back to Python if Node unavailable
  if (pythonAvailable && hfHubAvailable) {
    return DOWNLOAD_METHOD.PYTHON;
  }

  return DOWNLOAD_METHOD.UNKNOWN;
}
```

#### Step 1.4: Add WebSocket Progress Reporting
**Files**: `backend/services/modelDownloader.js`, `backend/services/websocket.js`

**In websocket.js** - Add download channel:
```javascript
// Add to channelTypes
download: {
  name: 'download',
  events: ['progress', 'complete', 'failed', 'cancelled']
}
```

**In modelDownloader.js**:
1. Import websocket service
2. Broadcast progress on `download` channel
3. Include job ID, file info, progress percentage

```javascript
import { broadcast } from './websocket.js';

// In downloadWithNode and downloadWithPython, replace onProgress callback:
function broadcastDownloadProgress(data) {
  broadcast('download', {
    type: 'progress',
    data: {
      jobId: data.jobId,
      repo: job.repo,
      method: job.method,
      fileIndex: data.fileIndex,
      totalFiles: data.totalFiles,
      fileName: data.fileName,
      fileProgress: data.fileProgress,
      overallProgress: data.overallProgress,
      bytesDownloaded: data.bytesDownloaded,
      totalBytes: data.totalBytes,
      speed: data.speed,
      eta: data.eta,
      status: data.status || 'downloading'
    }
  });
  if (onProgress) onProgress(data);
}
```

---

### Phase 2: Add Test Coverage

#### Step 2.1: Create Test File
**File**: `tests/modelDownloader.test.js`

**Test Structure**:
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  modelDownloader,
  DOWNLOAD_STATUS,
  DOWNLOAD_METHOD,
  formatBytes,
  formatTime,
  getHuggingFaceFileUrl
} from '../backend/services/modelDownloader.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ModelDownloader Service', () => {
  const TEST_DIR = join(process.cwd(), 'test-downloads');
  const TEST_DB = join(process.cwd(), 'test-downloads.db');

  beforeEach(() => {
    // Setup test directories
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    // Set test environment
    process.env.NODE_HF_CACHE = TEST_DIR;
    process.env.MODELS_DIR = TEST_DIR;
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Utility Functions', () => {
    // Test formatBytes, formatTime, getHuggingFaceFileUrl
  });

  describe('Download Method Detection', () => {
    // Test getDownloadMethod with different scenarios
  });

  describe('Download with Node.js (easydl)', () => {
    // Mock easydl and test download flow
    // Test progress reporting
    // Test error handling
    // Test cancellation
  });

  describe('Download with Python', () => {
    // Mock Python subprocess
    // Test JSON parsing from stdout
    // Test stderr capture
    // Test error handling
  });

  describe('Multi-file Downloads', () => {
    // Test downloading multiple files
    // Test overall progress calculation
    // Test partial failure handling
  });

  describe('Status and Job Management', () => {
    // Test getDownloadStatus
    // Test getAllJobs
    // Test cleanupOldJobs
  });
});
```

#### Step 2.2: Add Mocks for External Dependencies
**File**: `tests/mocks/easydl.mock.js`

```javascript
// Mock easydl for testing
export class MockEasyDl {
  constructor(url, dest, options) {
    this.url = url;
    this.dest = dest;
    this.options = options;
    this.progressEvents = [];
    this._shouldFail = false;
    this._progressInterval = null;
  }

  on(event, callback) {
    if (event === 'progress') {
      this.progressEvents.push(callback);
    }
  }

  async wait() {
    return new Promise((resolve, reject) => {
      if (this._shouldFail) {
        reject(new Error('Mock download failed'));
        return;
      }

      // Simulate progress
      let progress = 0;
      this._progressInterval = setInterval(() => {
        progress += 10;
        for (const cb of this.progressEvents) {
          cb({
            percent: progress,
            downloaded: progress * 1000000,
            total: 10000000,
            speed: 1000000,
            remaining: (100 - progress) * 1
          });
        }
        if (progress >= 100) {
          clearInterval(this._progressInterval);
          resolve(true);
        }
      }, 50);
    });
  }

  cancel() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
    }
  }

  // Test helpers
  _fail() {
    this._shouldFail = true;
  }
}
```

---

### Phase 3: UI Improvements

#### Step 3.1: Add Missing Models Toggle
**File**: `frontend/src/components/ModelManager.jsx`

**Changes**:
1. Add state for showing/hiding missing models
2. Add visual indicator for missing files
3. Add "Show Missing Models" toggle button
4. Update model list filtering logic

```javascript
const [showMissingModels, setShowMissingModels] = useState(false);

// In model list rendering:
const filteredModels = models.filter(model => {
  const isMissing = !model.filesPresent;
  return showMissingModels || !isMissing;
});

// Add toggle button:
<button
  onClick={() => setShowMissingModels(!showMissingModels)}
  className={showMissingModels ? 'bg-primary' : 'bg-secondary'}
>
  {showMissingModels ? 'Hide' : 'Show'} Missing Models
</button>
```

#### Step 3.2: Display Download Progress
**File**: `frontend/src/components/ModelManager.jsx`

**Changes**:
1. Subscribe to `download` WebSocket channel
2. Show progress bar for active downloads
3. Display download status (downloading, paused, completed, failed)
4. Add cancel/pause/resume buttons

```javascript
const { subscribe, unsubscribe } = useWebSocket();
const [downloads, setDownloads] = useState({});

useEffect(() => {
  const handleDownloadMessage = (msg) => {
    if (msg.channel === 'download') {
      setDownloads(prev => ({
        ...prev,
        [msg.data.jobId]: msg.data
      }));
    }
  };

  subscribe('download', handleDownloadMessage);
  return () => unsubscribe('download', handleDownloadMessage);
}, [subscribe, unsubscribe]);
```

#### Step 3.3: Create DownloadProgress Component
**File**: `frontend/src/components/DownloadProgress.jsx`

```javascript
export function DownloadProgress({ download }) {
  return (
    <div className="download-progress">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Progress value={download.overallProgress} />
          <p className="text-xs text-muted-foreground">
            {download.fileName}: {download.fileProgress.toFixed(1)}%
          </p>
        </div>
        <span className="text-sm">{download.speed}</span>
        <span className="text-sm">{download.eta}</span>
      </div>
    </div>
  );
}
```

---

### Phase 4: Integration

#### Step 4.1: Update Routes for Progress Streaming
**File**: `backend/routes/models.js`

**Add endpoint** for getting download status:
```javascript
// GET /api/models/download/status/:jobId
app.get('/download/status/:jobId', authenticateRequest, (req, res) => {
  const { jobId } = req.params;
  const status = modelDownloader.getDownloadStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: 'Download job not found' });
  }

  res.json(status);
});

// GET /api/models/download/jobs
app.get('/download/jobs', authenticateRequest, (req, res) => {
  const jobs = modelDownloader.getAllJobs();
  res.json(jobs);
});
```

#### Step 4.2: Update Model File Status Check
**File**: `backend/utils/modelHelpers.js`

**Enhance** `getModelFileStatus()` to return more detailed status:
```javascript
export function getModelFileStatus(model, modelsDir) {
  const files = [];

  for (const arg of model.args || []) {
    if (arg.startsWith('./models/') || arg.startsWith('/models/')) {
      const path = join(modelsDir, basename(arg));
      const exists = existsSync(path);
      const size = exists ? statSync(path).size : 0;

      files.push({
        path: arg,
        exists,
        size,
        humanSize: formatBytes(size)
      });
    }
  }

  return {
    modelId: model.id,
    allPresent: files.every(f => f.exists),
    files
  };
}
```

---

## Testing Strategy

### Unit Tests
- Utility functions (formatBytes, formatTime, URL generation)
- Download method detection logic
- Progress calculation
- Status management

### Integration Tests
- Full download flow with mocked easydl
- Full download flow with mocked Python subprocess
- WebSocket progress broadcasting
- Error handling and recovery

### Manual Testing
1. Download z-image-turbo with Node.js downloader
2. Verify stderr appears in logs with actual content
3. Check downloads.log file is created and populated
4. Observe progress in UI via WebSocket
5. Test missing models toggle
6. Test download cancellation

---

## Rollback Plan

If issues arise:
1. Revert `USE_PYTHON_DOWNLOADER` default to `!== 'false'` for Python-first
2. Disable WebSocket broadcasts temporarily
3. Remove file logging if it causes issues
4. Hide missing models toggle (default to showing all)

Each change can be independently reverted via environment variables:
- `USE_PYTHON_DOWNLOADER=true` - Force Python
- `DOWNLOAD_LOG_TO_FILE=false` - Disable file logging
- `DOWNLOAD_WEBSOCKET_PROGRESS=false` - Disable WebSocket progress

---

## Dependencies

**Required npm packages**:
- `easy-dl` - Already should be installed

**Required Python packages** (for fallback):
- `huggingface_hub` - Already should be installed

**No new dependencies required** - this is a refactor and feature completion.

---

## Files to Modify

1. `backend/services/modelDownloader.js` - Core fixes
2. `backend/services/websocket.js` - Add download channel
3. `backend/utils/modelHelpers.js` - Enhanced file status
4. `backend/routes/models.js` - Add status endpoints
5. `frontend/src/components/ModelManager.jsx` - UI enhancements
6. `frontend/src/components/DownloadProgress.jsx` - New component
7. `tests/modelDownloader.test.js` - New test file

---

## Success Criteria

1. ✅ stderr content properly logged with actual error messages
2. ✅ Download operations logged to `backend/data/logs/downloads.log`
3. ✅ Node.js (easydl) is the default downloader
4. ✅ WebSocket broadcasts real-time download progress
5. ✅ Test coverage >80% for modelDownloader service
6. ✅ Missing models hidden by default with toggle button
7. ✅ z-image-turbo downloads successfully with all 3 files
