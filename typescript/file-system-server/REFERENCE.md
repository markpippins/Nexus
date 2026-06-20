# File System Server — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `PORT` | 4040 | Service port |
| `FILES_ROOT` | ./data/files | Root directory for file storage |
| `DIRECTORY_LISTING` | false | Enable directory listing |
| `MAX_FILE_SIZE_MB` | 500 | Maximum upload file size in MB |
| `CORS_ORIGIN` | * | Allowed CORS origin |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4040 | Service port |
| `FILES_ROOT` | ./data/files | File storage root path |
| `MAX_FILE_SIZE_MB` | 500 | Maximum upload file size |
| `ALLOW_DIRECTORY_LISTING` | false | Enable directory listing |
| `CORS_ORIGIN` | * | CORS allowed origin |
| `NODE_ENV` | development | Runtime environment |

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the service |
| `npm run dev` | Start with live reload (nodemon) |
| `npm test` | Run tests |
| `curl http://localhost:4040/files/README.md` | Fetch a file |
| `curl -X POST -F "file=@test.txt" http://localhost:4040/files/uploads/test.txt` | Upload a file |

## Troubleshooting

- **403 Forbidden**: Path traversal attempt detected — ensure all file paths resolve within FILES_ROOT
- **File not found**: Check the path is correct and the file exists in the configured FILES_ROOT
- **Upload fails**: Verify MAX_FILE_SIZE_MB is sufficient and the target directory is writable
- **MIME type wrong**: File extension-based MIME detection may need custom mappings — check the MIME configuration
