
   ```python
   import pytest

   def test_start_file_end_file_format():
       # Simulate model output with START_FILE/END_FILE format
       ollama_output = """
       ---START_FILE:/path/to/file1.txt---
       Content of file1.txt
       