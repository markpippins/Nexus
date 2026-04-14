#!/usr/bin/env python3
"""
Test script to check if the server can start properly
"""

import asyncio
import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

def test_basic_imports():
    """Test if basic imports work"""
    print("Testing basic imports...")
    
    try:
        from config import settings
        print("✓ Config import successful")
    except Exception as e:
        print(f"✗ Config import failed: {e}")
        return False
    
    try:
        from database import init_databases, close_databases
        print("✓ Database import successful")
    except Exception as e:
        print(f"✗ Database import failed: {e}")
        return False
    
    try:
        from services.startup import StartupService
        print("✓ Startup service import successful")
    except Exception as e:
        print(f"✗ Startup service import failed: {e}")
        return False
    
    return True

def test_database_connections():
    """Test if database connections work"""
    print("\nTesting database connections...")
    
    try:
        from database import init_databases, close_databases
        import asyncio
        
        async def test():
            await init_databases()
            print("✓ Database connections initialized successfully")
            await close_databases()
            print("✓ Database connections closed successfully")
        
        asyncio.run(test())
        return True
    except Exception as e:
        print(f"✗ Database connection test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_startup_service():
    """Test if startup service works"""
    print("\nTesting startup service...")
    
    try:
        from services.startup import StartupService
        import asyncio
        
        async def test():
            service = StartupService()
            await service.initialize_system()
            print("✓ Startup service initialized successfully")
            await service.graceful_shutdown()
            print("✓ Startup service shutdown successfully")
        
        asyncio.run(test())
        return True
    except Exception as e:
        print(f"✗ Startup service test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Running server startup tests...\n")
    
    if not test_basic_imports():
        print("\nBasic imports failed. Cannot proceed with tests.")
        sys.exit(1)
    
    if not test_database_connections():
        print("\nDatabase connections failed. Check your database configuration.")
        sys.exit(1)
    
    if not test_startup_service():
        print("\nStartup service failed. Check your database configuration and connectivity.")
        sys.exit(1)
    
    print("\n✓ All tests passed! The server should be able to start.")