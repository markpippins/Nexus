# File System Server - Complete Test Suite

This directory contains a comprehensive test suite for the secure-file-system-server.

## Files

- `fs-serv.ts` - File system server (ESM, bun-compatible)
- `test-fs-server.ts` - Main test suite covering all core operations
- `test-copy.ts` - Specific test for copy operation with setup/teardown
- `start.sh` - Server startup script (respects `FS_ROOT_DIR` env var)
- `run-tests.sh` - Script to run all tests under bun

## Operations Tested

All operations passing:
- Health check (`/health` endpoint)
- List directory (`ls` operation)
- Create directory (`mkdir` operation)
- Create file (`newfile` operation)
- Delete file (`deletefile` operation)
- Delete directory (`rmdir` operation)
- Rename file/directory (`rename` operation)
- Check file existence (`hasfile` operation)
- Check folder existence (`hasfolder` operation)
- Move file/directory (`move` operation) - includes EXDEV fallback
- Copy file/directory (`copy` operation)

## Running Tests

```bash
cd nexus/typescript/secure-file-system-server
bash run-tests.sh
```

## Server Requirements

- bun runtime
- Port 4040 available
- `FS_ROOT_DIR` env var (optional, defaults to `fs_root/`)

## Starting the Server

```bash
bash start.sh                    # uses fs_root/ by default
FS_ROOT_DIR=/custom/path bash start.sh  # custom root
```
