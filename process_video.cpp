#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <cstdlib>
#include <cstdio>
#include <chrono>
#include <iomanip>
#include <fstream>

// Windows/POSIX compatibility
#ifdef _WIN32
    #include <direct.h>
    #include <io.h>
    #define mkdir(path, mode) _mkdir(path)
    #define access(path, mode) _access(path, mode)
    #define F_OK 0
#else
    #include <unistd.h>
    #include <sys/stat.h>
#endif

// Get video height using ffprobe
int getVideoHeight(const std::string& videoPath) {
    std::string tempFile = "temp_height.txt";
    std::string cmd = "ffprobe -v error -select_streams v:0 -show_entries stream=height "
                      "-of default=noprint_wrappers=1:nokey=1 \"" + videoPath + "\" > " + tempFile;
    
    int result = system(cmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to execute ffprobe. Is it installed and in your PATH?" << std::endl;
        return -1;
    }
    
    std::ifstream file(tempFile);
    if (!file) {
        std::cerr << "Error: Could not read ffprobe output file." << std::endl;
        return -1;
    }
    
    std::string heightStr;
    std::getline(file, heightStr);
    file.close();
    
    // Clean up temp file
    remove(tempFile.c_str());

    // Trim whitespace which can cause stoi to fail
    size_t first = heightStr.find_first_not_of(" \t\n\r");
    if (std::string::npos == first) {
        std::cerr << "Error: ffprobe returned empty output for video height." << std::endl;
        return -1;
    }
    size_t last = heightStr.find_last_not_of(" \t\n\r");
    std::string trimmed_result = heightStr.substr(first, (last - first + 1));

    try {
        return std::stoi(trimmed_result);
    } catch (const std::invalid_argument& e) {
        std::cerr << "Error: Could not parse video height from ffprobe output: '" << trimmed_result << "'. " << e.what() << std::endl;
        return -1;
    } catch (const std::out_of_range& e) {
        std::cerr << "Error: Video height value from ffprobe is out of range: '" << trimmed_result << "'. " << e.what() << std::endl;
        return -1;
    }
}

// Get subordinate qualities based on input resolution (YouTube style)
std::vector<std::pair<std::string, int>> getSubordinateQualities(int inputHeight) {
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
    
    std::vector<std::pair<std::string, int>> subordinateQualities;
    
    // Only include qualities that are lower than input resolution
    for (const auto& quality : allQualities) {
        if (quality.second < inputHeight) {
            subordinateQualities.push_back(quality);
        }
    }
    
    return subordinateQualities;
}

// Helper function to extract filename without extension
std::string getFilenameStem(const std::string& path) {
    size_t lastSlash = path.find_last_of("/\\");
    size_t start = (lastSlash == std::string::npos) ? 0 : lastSlash + 1;
    size_t lastDot = path.find_last_of('.');
    size_t end = (lastDot == std::string::npos || lastDot < start) ? path.length() : lastDot;
    return path.substr(start, end - start);
}

// Helper function to copy file
bool copyFile(const std::string& src, const std::string& dst) {
    std::ifstream source(src, std::ios::binary);
    std::ofstream dest(dst, std::ios::binary);
    
    if (!source || !dest) {
        return false;
    }
    
    dest << source.rdbuf();
    return source.good() && dest.good();
}

// Helper function to check if directory exists
bool directoryExists(const std::string& path) {
    return access(path.c_str(), F_OK) == 0;
}

void processVideo(const std::string& videoPath) {
    auto start_time = std::chrono::high_resolution_clock::now();
    
    std::string stem = getFilenameStem(videoPath);
    std::string folderName = stem;

    // Create output folder
    if (!directoryExists(folderName)) {
        if (mkdir(folderName.c_str(), 0755) != 0) {
            std::cerr << "Error: Failed to create directory '" << folderName << "'" << std::endl;
            return;
        }
    }
    // Get input video height
    int inputHeight = getVideoHeight(videoPath);
    if (inputHeight == -1) {
        std::cerr << "Could not determine input video height.\n";
        return;
    }
    
    std::cout << "Input video resolution: " << inputHeight << "p" << std::endl;
    
    // Copy original video with height in filename
    std::string originalOut = folderName + "/" + stem + " " + std::to_string(inputHeight) + ".mp4";
    if (!copyFile(videoPath, originalOut)) {
        std::cerr << "Error: Failed to copy original video to '" << originalOut << "'" << std::endl;
        return;
    }
    std::cout << "Original copied as: " << originalOut << std::endl;

    // Get subordinate qualities
    std::vector<std::pair<std::string, int>> subordinateQualities = getSubordinateQualities(inputHeight);
    
    if (subordinateQualities.empty()) {
        std::cout << "No subordinate qualities to process for " << inputHeight << "p video." << std::endl;
        return;
    }
    
    std::cout << "Processing subordinate qualities: ";
    for (const auto& q : subordinateQualities) {
        std::cout << q.first << "p ";
    }
    std::cout << std::endl;

    // Process each subordinate quality
    for (const auto& q : subordinateQualities) {
        std::string outFile = folderName + "/" + stem + " " + q.first + ".mp4";
        std::string cmd = "ffmpeg -y -i \"" + videoPath + "\" -vf \"scale=-2:" + std::to_string(q.second) + "\" -c:a copy \"" + outFile + "\"";
        std::cout << "Processing " << q.first << "p..." << std::endl;
        
        int result = system(cmd.c_str());
        if (result == 0) {
            std::cout << "✓ " << q.first << "p completed" << std::endl;
        } else {
            std::cout << "✗ " << q.first << "p failed" << std::endl;
            std::cerr << "✗ " << q.first << "p failed. Command was: " << cmd << std::endl;
        }
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
    double total_time = duration.count() / 1000.0;

    std::cout << "\nProcessing complete. Files saved in folder: " << folderName << std::endl;
    std::cout << "Total processing time: " << std::fixed << std::setprecision(2) << total_time << " seconds" << std::endl;
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: process_video <video_path>\n";
        std::cerr << "Example: process_video.exe video.mp4\n";
        return 1;
    }
    
    if (access(argv[1], F_OK) != 0) {
        std::cerr << "Error: File does not exist: " << argv[1] << std::endl;
        return 1;
    }
    
    processVideo(argv[1]);
    return 0;
}