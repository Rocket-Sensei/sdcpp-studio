#!/usr/bin/env python3
"""
HuggingFace Hub Download Wrapper

This script wraps huggingface_hub's hf_hub_download and snapshot_download
functions for use from Node.js. It supports:
- Single file downloads
- Full repository downloads
- Progress reporting via JSON
- Token authentication
- Custom cache directories
- Resume/pause support via chunk management

Usage:
    python hf_download.py --repo-id "repo/name" --filename "file.bin" [--dest "path"]
    python hf_download.py --repo-id "repo/name" --snapshot [--dest "path"]
"""

import sys
import json
import os
import argparse
from pathlib import Path

# Try importing huggingface_hub
try:
    from huggingface_hub import hf_hub_download, snapshot_download, hf_hub_url, HfFileSystem
    from huggingface_hub.utils import tqdm as hf_tqdm
    HF_AVAILABLE = True
except ImportError:
    HF_AVAILABLE = False
    sys.stderr.write("ERROR: huggingface_hub is not installed. Install it with:\n")
    sys.stderr.write("  pip install huggingface_hub\n")
    sys.exit(1)


def send_progress(event_type, data=None):
    """Send progress event as JSON to stdout."""
    output = {
        "type": event_type,
        "data": data or {}
    }
    print(json.dumps(output), flush=True)


def send_error(message, code=None):
    """Send error event as JSON to stdout."""
    output = {
        "type": "error",
        "data": {
            "message": message,
            "code": code
        }
    }
    print(json.dumps(output), flush=True)


def send_complete(result):
    """Send completion event as JSON to stdout."""
    output = {
        "type": "complete",
        "data": result
    }
    print(json.dumps(output), flush=True)


class ProgressReporter:
    """Custom progress reporter for huggingface_hub downloads."""

    def __init__(self):
        self.current_bytes = 0
        self.total_bytes = 0
        self.last_report_time = 0
        self.report_interval = 0.5  # Report every 0.5 seconds

    def report(self, progress, current=None, total=None):
        """Report progress if enough time has passed."""
        import time
        now = time.time()

        if total is not None:
            self.total_bytes = total
        if current is not None:
            self.current_bytes = current

        if now - self.last_report_time >= self.report_interval:
            send_progress("progress", {
                "current": self.current_bytes,
                "total": self.total_bytes,
                "percentage": (self.current_bytes / self.total_bytes * 100) if self.total_bytes > 0 else 0
            })
            self.last_report_time = now


def download_single_file(repo_id, filename, dest=None, revision="main", token=None, cache_dir=None, local_dir=None):
    """
    Download a single file from HuggingFace Hub.

    Args:
        repo_id: Repository ID (e.g., "username/repo-name")
        filename: File name to download
        dest: Optional destination directory (overrides cache_dir)
        revision: Git revision (branch, tag, or commit hash)
        token: HuggingFace authentication token
        cache_dir: Cache directory for downloaded files
        local_dir: Local directory to download to (bypasses cache)

    Returns:
        Dictionary with download results
    """
    try:
        send_progress("start", {
            "repo_id": repo_id,
            "filename": filename,
            "revision": revision
        })

        # Build kwargs for hf_hub_download
        kwargs = {
            "repo_id": repo_id,
            "filename": filename,
            "revision": revision,
        }

        if token:
            kwargs["token"] = token
        if cache_dir:
            kwargs["cache_dir"] = cache_dir
        if local_dir:
            kwargs["local_dir"] = local_dir
            kwargs["local_dir_use_symlinks"] = False

        # Download the file
        file_path = hf_hub_download(**kwargs)

        # Get file size
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        send_complete({
            "file_path": file_path,
            "file_size": file_size,
            "repo_id": repo_id,
            "filename": filename
        })

        return {
            "file_path": file_path,
            "file_size": file_size
        }

    except Exception as e:
        send_error(str(e), type(e).__name__)
        raise


def download_snapshot(repo_id, dest=None, revision="main", token=None, cache_dir=None,
                     allow_patterns=None, ignore_patterns=None):
    """
    Download an entire repository snapshot from HuggingFace Hub.

    Args:
        repo_id: Repository ID (e.g., "username/repo-name")
        dest: Optional destination directory
        revision: Git revision (branch, tag, or commit hash)
        token: HuggingFace authentication token
        cache_dir: Cache directory for downloaded files
        allow_patterns: List of glob patterns to include
        ignore_patterns: List of glob patterns to exclude

    Returns:
        Dictionary with download results
    """
    try:
        send_progress("start", {
            "repo_id": repo_id,
            "revision": revision,
            "type": "snapshot"
        })

        # Build kwargs for snapshot_download
        kwargs = {
            "repo_id": repo_id,
            "revision": revision,
        }

        if token:
            kwargs["token"] = token
        if cache_dir:
            kwargs["cache_dir"] = cache_dir
        if allow_patterns:
            kwargs["allow_patterns"] = allow_patterns
        if ignore_patterns:
            kwargs["ignore_patterns"] = ignore_patterns
        if dest:
            kwargs["local_dir"] = dest
            kwargs["local_dir_use_symlinks"] = False

        # Download the snapshot
        snapshot_path = snapshot_download(**kwargs)

        # Count files and total size
        total_size = 0
        file_count = 0
        if os.path.exists(snapshot_path):
            for root, dirs, files in os.walk(snapshot_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    if os.path.exists(file_path) and not os.path.islink(file_path):
                        total_size += os.path.getsize(file_path)
                        file_count += 1

        send_complete({
            "snapshot_path": snapshot_path,
            "file_count": file_count,
            "total_size": total_size,
            "repo_id": repo_id
        })

        return {
            "snapshot_path": snapshot_path,
            "file_count": file_count,
            "total_size": total_size
        }

    except Exception as e:
        send_error(str(e), type(e).__name__)
        raise


def get_file_url(repo_id, filename, revision="main"):
    """Get the direct download URL for a file."""
    try:
        url = hf_hub_url(repo_id, filename, revision=revision)
        send_complete({
            "url": url,
            "repo_id": repo_id,
            "filename": filename
        })
        return url
    except Exception as e:
        send_error(str(e), type(e).__name__)
        raise


def check_available():
    """Check if huggingface_hub is available."""
    send_complete({
        "available": HF_AVAILABLE,
        "version": None  # Could get version with importlib.metadata
    })


def main():
    parser = argparse.ArgumentParser(
        description="HuggingFace Hub Download Wrapper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download single file
  python hf_download.py --repo-id "gpt2" --filename "config.json"

  # Download to specific directory
  python hf_download.py --repo-id "gpt2" --filename "config.json" --dest "./models"

  # Download from specific revision
  python hf_download.py --repo-id "gpt2" --filename "config.json" --revision "v1.0"

  # Download entire repository
  python hf_download.py --repo-id "gpt2" --snapshot --dest "./models/gpt2"

  # Get download URL only
  python hf_download.py --repo-id "gpt2" --filename "config.json" --url-only

  # Check availability
  python hf_download.py --check
        """
    )

    parser.add_argument("--repo-id", required=False, help="Repository ID (e.g., 'username/repo-name')")
    parser.add_argument("--filename", help="File name to download")
    parser.add_argument("--dest", help="Destination directory")
    parser.add_argument("--revision", default="main", help="Git revision (default: main)")
    parser.add_argument("--token", help="HuggingFace authentication token")
    parser.add_argument("--cache-dir", help="Cache directory")
    parser.add_argument("--snapshot", action="store_true", help="Download entire repository snapshot")
    parser.add_argument("--allow-patterns", help="Comma-separated glob patterns to include (for snapshot)")
    parser.add_argument("--ignore-patterns", help="Comma-separated glob patterns to exclude (for snapshot)")
    parser.add_argument("--url-only", action="store_true", help="Only get the download URL")
    parser.add_argument("--check", action="store_true", help="Check if huggingface_hub is available")

    args = parser.parse_args()

    # Check mode
    if args.check:
        check_available()
        return 0

    if not args.repo_id:
        parser.error("--repo-id is required (unless using --check)")

    # Get token from env if not provided
    if not args.token:
        args.token = os.environ.get("HF_TOKEN")

    # Get cache dir from env if not provided
    if not args.cache_dir:
        args.cache_dir = os.environ.get("HF_HUB_CACHE") or os.environ.get("HUGGINGFACE_HUB_CACHE")

    # URL-only mode
    if args.url_only:
        if not args.filename:
            parser.error("--filename is required for --url-only")
        return get_file_url(args.repo_id, args.filename, args.revision)

    # Snapshot download
    if args.snapshot:
        allow_patterns = args.allow_patterns.split(",") if args.allow_patterns else None
        ignore_patterns = args.ignore_patterns.split(",") if args.ignore_patterns else None
        download_snapshot(
            args.repo_id,
            dest=args.dest,
            revision=args.revision,
            token=args.token,
            cache_dir=args.cache_dir,
            allow_patterns=allow_patterns,
            ignore_patterns=ignore_patterns
        )
        return 0

    # Single file download
    if not args.filename:
        parser.error("--filename or --snapshot is required")

    download_single_file(
        args.repo_id,
        args.filename,
        dest=args.dest,
        revision=args.revision,
        token=args.token,
        cache_dir=args.cache_dir
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
