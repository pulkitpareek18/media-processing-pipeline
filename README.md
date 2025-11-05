# Media Processing Pipeline

A C++ application that processes video files into multiple resolution variants (YouTube-style quality ladder). Takes an input video and generates subordinate quality versions while preserving the original.

## Features

- Automatically detects input video resolution using ffprobe
- Generates subordinate quality versions (2160p, 1440p, 1080p, 720p, 480p, 360p, 240p, 144p)
- Only creates versions lower than the input resolution
- Preserves audio tracks in all outputs
- Cross-platform compatible (Windows/Linux/macOS)
- Safe filesystem operations with proper error handling

## Requirements

- C++17 compatible compiler (GCC, Clang, or MSVC)
- FFmpeg (with ffprobe) installed and accessible in PATH

## Building

```bash
# Standard build
g++ -std=c++17 process_video.cpp -o process_video

# Or use the provided VS Code task (if GCC path is configured)
```

## Usage

```bash
./process_video video.mp4
```

The program will:
1. Create a directory named after the input video file
2. Copy the original video with resolution suffix (e.g., `video 1080.mp4`)
3. Generate scaled versions for all subordinate qualities
4. Report processing time and results

## Technical Implementation

### Filesystem Compatibility

The application was refactored to avoid C++17 `<filesystem>` dependencies for broader compiler compatibility:

- **Directory Creation**: Uses platform-specific `mkdir()` with proper error checking
- **File Operations**: Implements custom `copyFile()` using standard streams
- **Path Handling**: Custom `getFilenameStem()` for cross-platform filename parsing
- **File Existence Checks**: Uses POSIX `access()` with Windows compatibility layer

### FFprobe Integration

Video metadata extraction uses a robust system call approach:

- **Command Execution**: Uses `system()` with temporary file output instead of `popen()`
- **Error Handling**: Comprehensive validation of ffprobe availability and output
- **Output Parsing**: Safe string trimming and integer conversion with exception handling
- **Cleanup**: Automatic temporary file removal after processing

### Quality Ladder Logic

The resolution processing follows YouTube's quality standards:

```cpp
std::vector<std::pair<std::string, int>> allQualities = {
    {"2160", 2160}, // 4K
    {"1440", 1440}, // 2K  
    {"1080", 1080}, // Full HD
    {"720", 720},   // HD
    {"480", 480},   // SD
    {"360", 360},   // Low
    {"240", 240},   // Very Low
    {"144", 144}    // Lowest
};
```

Only qualities below the input resolution are processed to avoid upscaling.

### Error Recovery

The application includes comprehensive error handling:

- **Missing Dependencies**: Clear messaging when ffprobe is unavailable
- **File System Errors**: Safe directory creation with conflict detection
- **Processing Failures**: Individual quality processing with continue-on-error
- **Invalid Input**: File existence validation and readable error messages

## Recent Updates (October 2025)

### Fixed Critical Issues

1. **Filesystem Runtime Errors**
   - **Problem**: Unguarded `std::filesystem` operations causing crashes
   - **Solution**: Replaced with standard C functions and proper exception handling
   - **Impact**: Eliminated `std::filesystem::filesystem_error` exceptions

2. **Compilation Compatibility**
   - **Problem**: `<filesystem>` header not available in MinGW/older GCC
   - **Solution**: Implemented filesystem operations using standard C++ streams and POSIX calls
   - **Impact**: Broader compiler compatibility without external dependencies

3. **Process Communication**
   - **Problem**: Platform-specific `popen()`/`pclose()` portability issues
   - **Solution**: Switched to `system()` with temporary file approach
   - **Impact**: Consistent behavior across Windows/Linux/macOS

4. **Memory Safety**
   - **Problem**: Potential buffer overflows and resource leaks in pipe handling
   - **Solution**: RAII file handling with automatic cleanup
   - **Impact**: Improved reliability and resource management

### Code Quality Improvements

- **Exception Safety**: All filesystem operations wrapped in try-catch blocks
- **Resource Management**: Automatic cleanup of temporary files and handles
- **Error Diagnostics**: Detailed error messages with context information
- **Platform Abstraction**: Unified interface hiding OS-specific implementations

## Development Notes

The codebase prioritizes:
- **Compatibility**: Works with minimal dependencies across different environments
- **Robustness**: Graceful handling of edge cases and error conditions  
- **Maintainability**: Clear separation of concerns and comprehensive error reporting
- **Performance**: Efficient file operations and minimal temporary resource usage

## Example Output

```
Input video resolution: 1080p
Original copied as: video/video 1080.mp4
Processing subordinate qualities: 720p 480p 360p 240p 144p 
Processing 720p...
✓ 720p completed
Processing 480p...
✓ 480p completed
...
Processing complete. Files saved in folder: video
Total processing time: 45.32 seconds
Hello Everyone !!!
```
