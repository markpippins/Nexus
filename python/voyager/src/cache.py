import json
import logging

class DedupeCache:
    def __init__(self, redis_url=None):
        self.redis = None
        self.local_cache = {}
        self.local_dir_cache = {}
        
        if redis_url:
            try:
                import redis
                self.redis = redis.from_url(redis_url)
                self.redis.ping()
                logging.info(f"Connected to Redis at {redis_url}")
            except ImportError:
                logging.warning("redis-py not installed. Using in-memory cache.")
            except Exception as e:
                logging.warning(f"Could not connect to Redis: {e}. Falling back to in-memory cache.")

    def get(self, path: str):
        if self.redis:
            try:
                data = self.redis.get(f"fs:cache:{path}")
                return json.loads(data) if data else None
            except Exception as e:
                logging.error(f"Redis get error: {e}")
                return self.local_cache.get(path)
        return self.local_cache.get(path)

    def set(self, path: str, mtime: str, size: int, observation_id: str, inode: int):
        data = {
            "mtime": mtime,
            "size": size,
            "observation_id": observation_id,
            "inode": inode
        }
        if self.redis:
            try:
                self.redis.set(f"fs:cache:{path}", json.dumps(data))
            except Exception as e:
                logging.error(f"Redis set error: {e}")
                self.local_cache[path] = data
        else:
            self.local_cache[path] = data

    def get_dir(self, path: str):
        if self.redis:
            try:
                data = self.redis.get(f"fs:dirc:{path}")
                return json.loads(data) if data else None
            except Exception as e:
                logging.error(f"Redis get_dir error: {e}")
                return self.local_dir_cache.get(path)
        return self.local_dir_cache.get(path)

    def set_dir(self, path: str, signature: dict):
        if self.redis:
            try:
                self.redis.set(f"fs:dirc:{path}", json.dumps(signature))
            except Exception as e:
                logging.error(f"Redis set_dir error: {e}")
                self.local_dir_cache[path] = signature
        else:
            self.local_dir_cache[path] = signature
