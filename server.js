const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept video files only
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed!'), false);
        }
    }
});

// In-memory job storage (use database in production)
const jobs = new Map();

// Routes

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Upload video
app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        const jobId = uuidv4();
        const job = {
            id: jobId,
            filename: req.file.originalname,
            filepath: req.file.path,
            filesize: req.file.size,
            status: 'uploaded',
            uploadedAt: new Date().toISOString(),
            progress: 0,
            message: 'File uploaded successfully'
        };

        jobs.set(jobId, job);

        res.json({
            jobId: jobId,
            message: 'Video uploaded successfully',
            filename: req.file.originalname,
            filesize: req.file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed', message: error.message });
    }
});

// Start processing
app.post('/api/process/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'uploaded') {
        return res.status(400).json({ error: 'Job already processed or in progress' });
    }

    // Update job status
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    job.progress = 10;
    job.message = 'Starting video processing...';

    // Start C++ processing asynchronously
    processVideoAsync(job);

    res.json({
        jobId: jobId,
        message: 'Processing started',
        status: 'processing'
    });
});

// Get job status
app.get('/api/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        jobId: job.id,
        status: job.status,
        filename: job.filename,
        filesize: job.filesize,
        uploadedAt: job.uploadedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        progress: job.progress,
        message: job.message,
        outputFolder: job.outputFolder,
        processedFiles: job.processedFiles,
        error: job.error
    });
});

// List all jobs
app.get('/api/jobs', (req, res) => {
    const jobList = Array.from(jobs.values()).map(job => ({
        jobId: job.id,
        filename: job.filename,
        status: job.status,
        uploadedAt: job.uploadedAt,
        progress: job.progress,
        message: job.message
    }));

    res.json({ jobs: jobList });
});

// Download processed files
app.get('/api/download/:jobId/:quality?', (req, res) => {
    const { jobId, quality } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed yet' });
    }

    if (!job.outputFolder || !fs.existsSync(job.outputFolder)) {
        return res.status(404).json({ error: 'Output files not found' });
    }

    try {
        const files = fs.readdirSync(job.outputFolder);
        let targetFile = null;

        if (quality) {
            // Find specific quality file
            targetFile = files.find(f => f.includes(` ${quality}.mp4`));
            if (!targetFile) {
                return res.status(404).json({ error: `Quality ${quality} not found` });
            }
        } else {
            // Return first MP4 file
            targetFile = files.find(f => f.endsWith('.mp4'));
            if (!targetFile) {
                return res.status(404).json({ error: 'No video files found' });
            }
        }

        const filePath = path.join(job.outputFolder, targetFile);
        res.download(filePath);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Delete job
app.delete('/api/jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    // Clean up files
    try {
        if (fs.existsSync(job.filepath)) {
            fs.unlinkSync(job.filepath);
        }
        if (job.outputFolder && fs.existsSync(job.outputFolder)) {
            fs.rmSync(job.outputFolder, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn('File cleanup error:', error.message);
    }

    jobs.delete(jobId);
    res.json({ message: 'Job deleted successfully' });
});

// Process video using C++ executable
async function processVideoAsync(job) {
    try {
        const executablePath = path.join(__dirname, 'process_video.exe');
        
        // Check if executable exists
        if (!fs.existsSync(executablePath)) {
            throw new Error('process_video.exe not found. Please compile the C++ application.');
        }

        job.progress = 20;
        job.message = 'Analyzing video...';

        // Run the C++ process
        const process = spawn(executablePath, [job.filepath], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            console.log(`[${job.id}] ${output.trim()}`);

            // Parse progress from output
            if (output.includes('Processing')) {
                job.progress = Math.min(job.progress + 15, 85);
                const match = output.match(/Processing (\d+)p/);
                if (match) {
                    job.message = `Processing ${match[1]}p quality...`;
                }
            }
            
            if (output.includes('completed')) {
                job.progress = Math.min(job.progress + 5, 90);
            }
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`[${job.id}] ${data.toString().trim()}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                // Success
                job.status = 'completed';
                job.completedAt = new Date().toISOString();
                job.progress = 100;
                job.message = 'Video processing completed successfully';

                // Find output folder
                const stem = path.basename(job.filepath, path.extname(job.filepath));
                const outputFolder = path.join(__dirname, stem);
                
                if (fs.existsSync(outputFolder)) {
                    job.outputFolder = outputFolder;
                    job.processedFiles = fs.readdirSync(outputFolder)
                        .filter(f => f.endsWith('.mp4'))
                        .map(f => ({
                            filename: f,
                            quality: extractQuality(f)
                        }));
                }

                console.log(`[${job.id}] Processing completed successfully`);
            } else {
                // Error
                job.status = 'failed';
                job.progress = 0;
                job.error = stderr || 'Processing failed with unknown error';
                job.message = 'Video processing failed';
                console.error(`[${job.id}] Processing failed with code ${code}`);
            }
        });

        process.on('error', (error) => {
            job.status = 'failed';
            job.progress = 0;
            job.error = error.message;
            job.message = 'Failed to start processing';
            console.error(`[${job.id}] Process error:`, error);
        });

    } catch (error) {
        job.status = 'failed';
        job.progress = 0;
        job.error = error.message;
        job.message = 'Processing setup failed';
        console.error(`[${job.id}] Setup error:`, error);
    }
}

// Helper function to extract quality from filename
function extractQuality(filename) {
    const match = filename.match(/(\d+)\.mp4$/);
    return match ? match[1] + 'p' : 'unknown';
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large (max 500MB)' });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Video Processing API running on port ${PORT}`);
    console.log(`📖 Open http://localhost:${PORT} to access the web interface`);
    console.log(`📁 API endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;