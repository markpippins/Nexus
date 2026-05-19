import { fileURLToPath } from 'url';
import * as http from 'http';

interface RequestModel {
    alias: string;
    path: string[];
    operation: string;
    newName?: string;
    filename?: string;
    sourcePath?: string[];
    toAlias?: string;
    toPath?: string[];
    destPath?: string[];
    items?: { name: string; type: 'file' | 'folder' }[];
}

function makeRequest(requestData: RequestModel): Promise<any> {
    return new Promise((resolve, reject) => {
        const options: http.RequestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            host: 'localhost',
            port: 4040,
            path: '/fs'
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const response = body ? JSON.parse(body) : {};
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject({
                            statusCode: res.statusCode,
                            message: response.detail || `HTTP ${res.statusCode}`,
                            response
                        });
                    }
                } catch (e) {
                    reject({
                        statusCode: res.statusCode,
                        message: 'Failed to parse response JSON',
                        rawBody: body
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(requestData));
        req.end();
    });
}

async function testCopyOperation() {
    console.log('Testing copy operation specifically...\n');

    // Setup: create source directory and file
    console.log('Setting up: creating source directory...');
    await makeRequest({
        alias: 'test',
        path: [],
        operation: 'mkdir',
        toPath: ['copytest']
    });
    console.log('✓ Created copytest directory');

    console.log('Creating source file...');
    await makeRequest({
        alias: 'test',
        path: ['copytest'],
        operation: 'newfile',
        filename: 'source.txt'
    });
    console.log('✓ Created source.txt');

    // Test copy
    console.log('\nTesting copy...');
    const copyResult = await makeRequest({
        alias: 'test',
        path: ['copytest', 'source.txt'],
        operation: 'copy',
        toPath: ['copytest', 'copy.txt']
    });
    console.log('✓ Copy operation successful:', copyResult);

    // Verify original still exists
    console.log('\nVerifying original still exists...');
    await makeRequest({
        alias: 'test',
        path: ['copytest'],
        operation: 'hasfile',
        filename: 'source.txt'
    });
    console.log('✓ Original file still exists');

    // Verify copy exists
    console.log('Verifying copy exists...');
    await makeRequest({
        alias: 'test',
        path: ['copytest'],
        operation: 'hasfile',
        filename: 'copy.txt'
    });
    console.log('✓ Copy file exists');

    // Cleanup
    console.log('\nCleaning up...');
    await makeRequest({
        alias: 'test',
        path: ['copytest', 'source.txt'],
        operation: 'delete'
    });
    await makeRequest({
        alias: 'test',
        path: ['copytest', 'copy.txt'],
        operation: 'delete'
    });
    await makeRequest({
        alias: 'test',
        path: ['copytest'],
        operation: 'rmdir'
    });
    console.log('✓ Cleanup complete');
}

async function runCopyTest() {
    try {
        await testCopyOperation();
        console.log('\nCopy operation test completed!');
    } catch (error) {
        console.error('\nCopy operation test failed:', error);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runCopyTest().catch(console.error);
}
