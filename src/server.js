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
    try {
        const files = fs.readdirSync(outputDir)
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => ({
                name: file,
                url: `/output/${file}`,
                time: fs.statSync(path.join(outputDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by newest first
            
        res.json(files);
    } catch (err) {
        res.json([]);
    }
});

// Serve output images
app.use('/output', express.static('/workspace/ComfyUI/output'));

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
