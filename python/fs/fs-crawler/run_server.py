#!/usr/bin/env python3
"""
Simple script to run the media metadata service
"""

import sys
import os
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

# Change to the app directory
os.chdir(app_dir)

def main():
    try:
        # Import the app
        from main import app
        import uvicorn
        
        print("Starting Media Metadata Service...")
        print("Access the API at: http://localhost:8004")
        print("API Documentation: http://localhost:8004/docs")
        print("Press Ctrl+C to stop the server")
        
        # Run the server
        uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")
        
    except ImportError as e:
        print(f"Import error: {e}")
        import traceback
        traceback.print_exc()
    except Exception as e:
        print(f"Error running server: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()