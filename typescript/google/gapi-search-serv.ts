

import * as http from 'http';
import * as https from 'https';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.SEARCH_SERVER_PORT || 8082;

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`gapi-search: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[gapi-search] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[gapi-search] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

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

    if (req.method === 'POST' && req.url === '/search') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
                console.error('ERROR: Missing GOOGLE_API_KEY or SEARCH_ENGINE_ID in environment variables.');
                const errorPayload = JSON.stringify({ error: 'Server is not configured for Google Search. Missing API Key or Search Engine ID.' });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(errorPayload);
                return;
            }

            try {
                const { query } = JSON.parse(body);
                console.log(`Forwarding search query to Google: ${query}`);

                const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
                searchUrl.searchParams.append('key', GOOGLE_API_KEY!);
                searchUrl.searchParams.append('cx', SEARCH_ENGINE_ID!);
                searchUrl.searchParams.append('q', query);

                const googleRequest = https.get(searchUrl.toString(), (googleResponse) => {
                    // Forward headers and status code from Google's response
                    res.writeHead(googleResponse.statusCode ?? 500, googleResponse.headers);
                    // Pipe the response body directly to our client
                    googleResponse.pipe(res, { end: true });
                });

                googleRequest.on('error', (e) => {
                    console.error(`Error during Google API request: ${e.message}`);
                    const errorPayload = JSON.stringify({ error: 'Failed to communicate with the Google Search API.' });
                    res.writeHead(502, { 'Content-Type': 'application/json' }); // 502 Bad Gateway
                    res.end(errorPayload);
                });

                googleRequest.end();

            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Google Search proxy server listening on http://localhost:${PORT}`);
    if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
        console.warn('*********************************************************************************');
        console.warn('*** WARNING: GOOGLE_API_KEY or SEARCH_ENGINE_ID is not set in your .env file. ***');
        console.warn('*** The search service will not function correctly.                           ***');
        console.warn('*********************************************************************************');
    }
});