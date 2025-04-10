const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 2999;

// Enable CORS
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Proxy middleware options for forwarding requests to tusd
const proxyOptions = {
    target: 'http://localhost:8080',
    changeOrigin: true,
    onProxyRes: function(proxyRes, req, res) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept';
    }
};

// Use the proxy middleware for /files route
app.use('/files', createProxyMiddleware(proxyOptions));

// Endpoint to get output images
app.get('/output-images', (req, res) => {
    const outputDir = '/workspace/ComfyUI/output';
    
    // Log for debugging
    console.log(`Checking for images in directory: ${outputDir}`);
    
    try {
        // Check if directory exists
        if (!fs.existsSync(outputDir)) {
            console.log(`Output directory does not exist. Creating: ${outputDir}`);
            fs.mkdirSync(outputDir, { recursive: true });
            res.json([]);
            return;
        }
        
        const files = fs.readdirSync(outputDir);
        console.log(`Found ${files.length} files in output directory`);
        
        const imageFiles = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const filePath = path.join(outputDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    url: `/output/${file}`,
                    time: stats.mtime.getTime(),
                    size: stats.size
                };
            })
            .sort((a, b) => b.time - a.time); // Sort by newest first
        
        console.log(`Found ${imageFiles.length} image files to display`);
        
        res.json(imageFiles);
    } catch (err) {
        console.error(`Error accessing output directory: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Serve output images with explicit cache control
app.use('/output', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}, express.static('/workspace/ComfyUI/output'));

// Start the tusd server
const tusdBinaryPath = 'tusd';
const tusdArgs = [
  '-upload-dir', '/workspace',
  '-hooks-dir', '/etc/tusd/hooks',
  '-behind-proxy'
];
const tusd = spawn(tusdBinaryPath, tusdArgs);

tusd.stdout.on('data', (data) => {
    console.log(`tusd stdout: ${data.toString()}`);
});

tusd.stderr.on('data', (data) => {
    console.error(`tusd stderr: ${data.toString()}`);
});

tusd.on('close', (code) => {
    console.log(`tusd process exited with code ${code}`);
});

// Start the Express server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening at http://0.0.0.0:${port}`);
    console.log(`Output images should be served from: /workspace/ComfyUI/output`);
});

process.on('SIGINT', () => {
    console.log('Shutting down...');
    tusd.kill();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    tusd.kill();
    process.exit();
});
