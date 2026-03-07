# Wan2GP Backend

## Overview
Wan2GP is a video generation backend that supports text-to-video and image-to-video generation.

## Installation
Located in `./Wan2GP` folder (gitignored, may not appear in listings).

## Startup
```bash
pyenv activate wan && python wgp.py
```

## Usage Pattern
- On-demand startup (similar to sd-server backend)
- Generate video
- Auto-stop after generation completes

## Configuration
Models are configured in backend config YAML files with:
- `exec_mode: "wan2gp"`
- `capabilities: ["text-to-video", "image-to-video"]`

## API Endpoints
(TBD - to be implemented)

## Notes
- Requires Python environment with "wan" pyenv
- Video generation is resource-intensive
- Supports both text and image inputs for video generation
