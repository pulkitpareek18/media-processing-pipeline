# Media Processing Pipeline

[![CI](https://github.com/pulkitpareek18/media-processing-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/pulkitpareek18/media-processing-pipeline/actions/workflows/ci.yml)
![Last Commit](https://img.shields.io/github/last-commit/pulkitpareek18/media-processing-pipeline)
![Stars](https://img.shields.io/github/stars/pulkitpareek18/media-processing-pipeline)
![Language](https://img.shields.io/badge/Languages-C%20%7C%20C%2B%2B-blue)

## Release Snapshot (March 2026)

- Status: Active
- Type: CLI video processing utility
- Core tooling: `ffprobe` + `ffmpeg`
- CI checks: C build + C++ syntax check

CLI utility to generate lower-resolution variants from a single source video using `ffprobe` + `ffmpeg`.

## What It Does

Given one input video file, the pipeline:

1. Detects source resolution with `ffprobe`
2. Creates an output folder named after the source file stem
3. Copies the original source into that folder
4. Produces subordinate resolutions (for example: 1080p -> 720p, 480p, 360p, 240p, 144p)

Output naming format:

```text
<stem>/<stem> <resolution>.mp4
```

## Implementations

- `process_video.c` (cross-platform oriented C implementation)
- `process_video.cpp` (C++ implementation; currently tuned for Windows `_popen`)

## Prerequisites

- `ffmpeg` available on `PATH`
- `ffprobe` available on `PATH`
- C/C++ compiler (depending on implementation)

## Build

### C (macOS/Linux)

```bash
cc process_video.c -o process_video
```

### C (Windows, MinGW)

```bash
gcc process_video.c -o process_video.exe
```

### C++ (Windows, MinGW)

```bash
g++ process_video.cpp -std=c++17 -o process_video_cpp.exe
```

## Usage

```bash
./process_video input.mp4
```

Windows:

```bash
process_video.exe input.mp4
```

## Example

Input:

```text
video.mp4 (1080p)
```

Generated:

```text
video/video 1080.mp4
video/video 720.mp4
video/video 480.mp4
video/video 360.mp4
video/video 240.mp4
video/video 144.mp4
```

## Notes

- The tool currently preserves audio stream via `-c:a copy`.
- Processing time depends on source duration, resolution, and machine performance.
