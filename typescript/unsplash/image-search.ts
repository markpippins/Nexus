// This is a Node.js server file. The triple-slash directive below ensures that Node.js type definitions are available to the TypeScript compiler.
// FIX: Removed the line '/// <reference types="node" />' because the build environment cannot resolve node types, causing an error.

// FIX: Add declarations for Node.js globals to work around a build environment
// issue where the triple-slash directive for node types is not being resolved correctly.
declare const __dirname: string;
declare const process: {
    env: { [key: string]: string | undefined };
    cwd(): string;
    exit(code?: number): never;
};

import * as http from 'http';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.UNSPLASH_SERVER_PORT || 8083;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/search/photos') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { query } = JSON.parse(body);
                console.log(`[Unsplash Mock] Received search query: ${query}`);
                
                // Mock response that mimics the Unsplash API structure
                const mockResults = {
                    total: 3,
                    total_pages: 1,
                    results: [
                        {
                            id: '_y-L0A-w2vY',
                            description: 'A beautiful landscape with mountains and a lake.',
                            alt_description: 'photo of mountains and lake',
                            urls: {
                                raw: 'https://picsum.photos/id/10/1920/1080',
                                full: 'https://picsum.photos/id/10/1920/1080',
                                regular: 'https://picsum.photos/id/10/1080/720',
                                small: 'https://picsum.photos/id/10/400/267',
                                thumb: 'https://picsum.photos/id/10/200/133',
                            },
                            user: {
                                name: 'Mock User 1',
                                portfolio_url: 'https://picsum.photos',
                            }
                        },
                        {
                            id: 't20-3g-ySA4',
                            description: 'A modern city skyline at night.',
                            alt_description: 'city skyline at night',
                            urls: {
                                raw: 'https://picsum.photos/id/20/1920/1080',
                                full: 'https://picsum.photos/id/20/1920/1080',
                                regular: 'https://picsum.photos/id/20/1080/720',
                                small: 'https://picsum.photos/id/20/400/267',
                                thumb: 'https://picsum.photos/id/20/200/133',
                            },
                            user: {
                                name: 'Mock User 2',
                                portfolio_url: 'https://picsum.photos',
                            }
                        },
                        {
                            id: '1527-91_m2Q',
                            description: 'Close-up of a colorful bird.',
                            alt_description: 'a colorful bird',
                            urls: {
                                raw: 'https://picsum.photos/id/30/1920/1080',
                                full: 'https://picsum.photos/id/30/1920/1080',
                                regular: 'https://picsum.photos/id/30/1080/720',
                                small: 'https://picsum.photos/id/30/400/267',
                                thumb: 'https://picsum.photos/id/30/200/133',
                            },
                            user: {
                                name: 'Mock User 3',
                                portfolio_url: 'https://picsum.photos',
                            }
                        }
                    ]
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(mockResults));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Unsplash mock server listening on http://localhost:${PORT}`);
});