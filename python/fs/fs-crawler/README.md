# Media Metadata Service v2.0

A modern, containerized media file metadata indexing service built with Docker, Redis, MongoDB, and MySQL. This is a complete rewrite of the legacy media_hound system with improved reliability, performance, and maintainability.

## Key Features

- **Resumable Scanning**: Network/power interruption resistant with Redis-based state persistence
- **Multi-format Support**: Audio (MP3, FLAC, etc.), Video (MP4, MKV, etc.), Images (JPEG, PNG, etc.), Documents
- **Duplicate Detection**: Advanced duplicate detection using audio fingerprints and content hashing
- **Quality Assessment**: Automatic quality scoring based on format, bitrate, and sample rate
- **Smart Deletion Rules**: Path-based preferences (albums > compilations > misc) with configurable rules
- **Flexible Metadata Storage**: MongoDB for scalable, schema-flexible metadata storage
- **Async Processing**: Modern Python async/await for better performance
- **Docker-based**: Easy deployment and scaling
- **REST API**: Full API for querying and managing the system

## Architecture

- **FastAPI**: Modern async web framework
- **Redis**: State persistence and caching
- **MongoDB**: Flexible metadata document storage
- **MySQL**: Configuration and library management
- **Docker Compose**: Orchestrated multi-container deployment

## Quick Start

### Option 1: Using the startup script (Linux/Mac)
```bash
cd docker
./start-dev.sh
```

### Option 2: Manual Docker Compose
```bash
cd docker
docker-compose up --build -d
```

### Access the Application
- **Web UI**: http://localhost:3000 (Main interface)
- **API**: http://localhost:8000 (Backend API)
- **API Documentation**: http://localhost:8000/docs

### First Steps in the UI
1. **Configure Library Paths**: Go to Libraries → Add Library Path
2. **Start Scanning**: Go to Scanning → Start Scan
3. **Monitor Progress**: Watch the Dashboard for real-time updates
4. **View Statistics**: Check Statistics page for collection insights

## Development Mode

For development with debug tools:

```bash
docker-compose --profile debug up -d
```

This includes:
- Redis Commander (http://localhost:8081)

## Configuration

Key environment variables (set in docker-compose.yml):

- `REDIS_URL`: Redis connection string
- `MONGODB_URL`: MongoDB connection string  
- `MYSQL_URL`: MySQL connection string
- `MAX_CONCURRENT_SCANS`: Maximum parallel scan operations
- `SCAN_BATCH_SIZE`: Files processed per batch

## API Endpoints

### System Management
- `GET /health` - Health check
- `GET /system/status` - Detailed system status
- `GET /api/v1/stats` - File statistics

### Library Management
- `GET /api/v1/libraries` - List library paths
- `POST /api/v1/libraries` - Add library path

### Scanning
- `POST /api/v1/scan/start` - Start scan
- `GET /api/v1/scan/status` - Scan status
- `POST /api/v1/scan/stop` - Stop scan

### Search
- `GET /api/v1/search` - Search files
- `GET /api/v1/files/{id}` - Get file metadata

### Duplicate Detection
- `GET /api/v1/duplicates/stats` - Duplicate statistics
- `POST /api/v1/duplicates/detect` - Start duplicate detection
- `GET /api/v1/duplicates/groups` - Get duplicate groups
- `GET /api/v1/duplicates/candidates` - Get deletion candidates

### Rules Engine
- `GET /api/v1/rules` - List deletion rules
- `POST /api/v1/rules` - Create custom rule
- `POST /api/v1/rules/templates` - Create rule from template
- `GET /api/v1/rules/templates` - List available templates
- `POST /api/v1/duplicates/resolve` - Resolve duplicates using rules
- `GET /api/v1/duplicates/preview` - Preview resolution results

## Resumable Scanning

The system is designed to handle interruptions gracefully:

1. **State Persistence**: All scan progress is saved to Redis
2. **Checkpoint System**: Progress is saved every 50 files processed
3. **Auto-Resume**: On startup, the system automatically resumes interrupted scans
4. **File Tracking**: Completed files are tracked to avoid reprocessing

## Metadata Extraction

Supports multiple metadata extraction libraries:

- **Mutagen**: Audio metadata (ID3, FLAC, etc.)
- **Pillow + ExifRead**: Image EXIF data
- **python-magic**: File type detection
- **Generic Handler**: Basic file system metadata

## Monitoring

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Health Endpoints**: Database connectivity and system status
- **Redis State**: Real-time scan progress and system state
- **Statistics API**: File counts, processing statistics

## Differences from Legacy System

### Improvements
- **Async Processing**: Better performance and resource utilization
- **Modern Python**: Type hints, proper error handling, clean architecture
- **Containerized**: Easy deployment and scaling
- **Flexible Schema**: MongoDB vs rigid Elasticsearch mappings
- **Better State Management**: Cleaner Redis-based state vs complex ops system
- **API-First**: REST API for all operations

### Simplified Components
- **Removed Complex Mode System**: Simplified service architecture
- **Streamlined Caching**: Removed performance hacks, rely on proper async patterns
- **Cleaner Configuration**: Environment-based vs complex config files

## Production Deployment

For production:

1. Update `docker-compose.yml` with proper passwords
2. Configure volume mounts for your media directories
3. Set up proper logging aggregation
4. Configure backup for Redis/MongoDB/MySQL data
5. Set up monitoring and alerting

## Troubleshooting

### Scan Not Resuming
- Check Redis connectivity: `docker-compose logs redis`
- Verify scan state: Use Redis Commander to inspect `scan:state:*` keys

### Database Connection Issues
- Check service logs: `docker-compose logs app`
- Verify network connectivity between containers

### Performance Issues
- Adjust `SCAN_BATCH_SIZE` and `MAX_CONCURRENT_SCANS`
- Monitor resource usage: `docker stats`
- Check for disk I/O bottlenecks on media directories
#
# Duplicate Detection System

The system includes sophisticated duplicate detection designed for large music collections with many duplicates.

### How It Works

1. **Audio Fingerprinting**: Creates fingerprints based on title, artist, album, and duration
2. **Quality Scoring**: Assigns scores based on format (FLAC > MP3 320 > MP3 128), bitrate, and sample rate
3. **Path Classification**: Categorizes files as album, compilation, soundtrack, single, or misc
4. **Smart Resolution**: Uses quality + path preferences to determine which duplicates to keep

### Quality Scoring

- **FLAC/Lossless**: 1000+ points (highest priority)
- **MP3 320kbps**: ~600 points
- **MP3 128kbps**: ~540 points
- **Path bonuses**: Album (+100) > Soundtrack (+90) > Single (+80) > Compilation (+70) > Misc (+50)

### Deletion Rules

Files are marked for deletion when:
- **Quality difference ≥200 points**: Always delete lower quality (e.g., FLAC vs MP3 128)
- **Quality difference ≥100 points + path preference**: Delete if lower quality is in misc/compilation and better is in album
- **Similar quality + path difference ≥30 points**: Delete misc copies when album version exists

### Usage Examples

```bash
# Get duplicate statistics
curl http://localhost:8000/api/v1/duplicates/stats

# Start duplicate detection (analysis only)
curl -X POST http://localhost:8000/api/v1/duplicates/detect

# Start with auto-marking for deletion
curl -X POST "http://localhost:8000/api/v1/duplicates/detect?auto_mark=true"

# View deletion candidates
curl http://localhost:8000/api/v1/duplicates/candidates

# View duplicate groups
curl "http://localhost:8000/api/v1/duplicates/groups?method=fingerprint&limit=10"
```

### Library Path Configuration

Configure deletion behavior per library path in MySQL:

```sql
UPDATE library_paths SET 
    auto_delete_duplicates = TRUE,
    deletion_priority = 90,  -- High deletion priority for misc folders
    quality_threshold = 50   -- Lower threshold for aggressive cleanup
WHERE path LIKE '%/misc/%';
```#
# Rules Engine

The sophisticated rules engine allows you to create complex, configurable deletion logic - the "reasons" system from your original design.

### Rule Structure

Rules consist of:
- **Conditions**: What to match (codec, bitrate, path type, etc.)
- **Logical Operators**: AND, OR, NOT for complex logic
- **Actions**: What to do (delete, keep, review, tag)
- **Scope**: Which files/paths the rule applies to

### Rule Templates

Pre-built templates for common scenarios:

```bash
# Create rule to delete low-quality MP3s
curl -X POST "http://localhost:8000/api/v1/rules/templates" \
     -H "Content-Type: application/json" \
     -d '{"template_name": "delete_low_quality_mp3s", "parameters": {"bitrate_threshold": 128}}'

# Create rule to prefer albums over misc directories
curl -X POST "http://localhost:8000/api/v1/rules/templates" \
     -H "Content-Type: application/json" \
     -d '{"template_name": "prefer_albums_over_misc"}'
```

### Custom Rules

Create sophisticated custom rules:

```json
{
  "name": "Delete MP3s in misc when FLAC in albums exists",
  "description": "Complex rule combining quality, format, and path preferences",
  "priority": 95,
  "condition_group": {
    "operator": "and",
    "conditions": [
      {"target": "codec", "operator": "equals", "value": "MP3"},
      {"target": "path_type", "operator": "equals", "value": "misc"},
      {"target": "duplicate_count", "operator": "greater_than", "value": 1},
      {"target": "quality_rank", "operator": "greater_than", "value": 1}
    ]
  },
  "action": {
    "action": "delete",
    "reason_template": "MP3 in misc directory when better organized version exists"
  },
  "file_categories": ["audio"]
}
```

### Rule Builder (Python)

For programmatic rule creation:

```python
from utils.rule_builder import RuleBuilder

rule = (RuleBuilder("Delete low quality MP3s")
        .when_codec_equals("MP3")
        .and_bitrate_less_than(128)
        .and_has_duplicates()
        .and_not_best_quality()
        .then_delete("Low quality MP3 with better version available")
        .for_audio_files()
        .with_priority(90)
        .build())
```

### Available Conditions

- **File Properties**: path, name, size, extension
- **Audio Metadata**: bitrate, codec, duration, artist, album, genre, year
- **Quality Metrics**: quality_score, path_type
- **Duplicate Context**: duplicate_count, is_best_quality, quality_rank

### Available Actions

- **DELETE**: Mark file for deletion
- **KEEP**: Explicitly keep file (overrides other delete rules)
- **MARK_FOR_REVIEW**: Add to manual review queue
- **ADD_TAG**: Add custom tag for organization

### Resolution Workflow

1. **Detect Duplicates**: Find groups of similar files
2. **Apply Rules**: Evaluate each file against all enabled rules
3. **Resolve Conflicts**: Priority-based decision making
4. **Execute Actions**: Delete, keep, or mark for review
5. **Audit Trail**: Track all decisions for review

### Example Workflows

```bash
# Preview what rules would do (dry run)
curl -X POST "http://localhost:8000/api/v1/duplicates/resolve?dry_run=true"

# Execute rules for real
curl -X POST "http://localhost:8000/api/v1/duplicates/resolve?dry_run=false"

# Check resolution statistics
curl http://localhost:8000/api/v1/duplicates/resolution-stats
```

### Rule Priority System

Rules execute in priority order (higher first):
- **100+**: Critical rules (prefer lossless over lossy)
- **90-99**: Quality-based rules (bitrate thresholds)
- **80-89**: Path-based rules (album vs misc)
- **70-79**: Review rules (manual decisions)
- **<70**: Cleanup rules (very small files, etc.)

The rules engine provides the sophisticated "reasons" logic you wanted - configurable, auditable, and powerful enough to handle complex collection management scenarios.## W
eb UI Features

The React-based web interface provides a complete management experience:

### Dashboard
- **Real-time System Status**: Service health, active scans, file counts
- **Quick Actions**: Start/stop scans, refresh data
- **Recent Activity**: Latest scan operations and progress
- **Status Indicators**: Visual health monitoring with color-coded chips

### Library Management
- **Path Configuration**: Add, edit, delete library paths
- **Scan Settings**: Enable/disable scanning, deep scan options
- **Duplicate Rules**: Configure auto-deletion, quality thresholds, format preferences
- **Path Types**: Classify as album, compilation, recent, or general

### Scan Monitoring
- **Active Scan Progress**: Real-time progress bars and file counts
- **Quick Actions**: Scan all libraries, deep scan, or specific paths
- **Scan History**: Complete history with status, timing, and error details
- **Resumable Operations**: Automatic resume after interruptions

### Statistics & Analytics
- **File Statistics**: Total files, categories, storage usage
- **Visual Charts**: Pie charts and bar graphs for data visualization
- **Duplicate Analysis**: Duplicate groups, deletion candidates, quality distribution
- **Category Breakdown**: Files and storage by type (audio, video, image, etc.)

### Theme Support
- **Dark/Light Mode**: Toggle between themes with persistent preference
- **Responsive Design**: Works on desktop and tablet (mobile not optimized)
- **Material Design**: Clean, professional interface using Material-UI

### Real-time Updates
- **Auto-refresh**: Key data refreshes automatically (system status every 5s, scans every 2s)
- **Live Progress**: Scan progress updates in real-time
- **Status Indicators**: Immediate feedback on system health and operations

The UI is designed for mouse-driven workflows with rich tooltips, confirmation dialogs, and comprehensive error handling. All operations provide immediate feedback through toast notifications and status updates.