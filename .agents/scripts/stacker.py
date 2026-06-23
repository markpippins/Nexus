import os
import shutil
import re

def stack_file(file_path):
    if not os.path.exists(file_path):
        return

    base_dir = os.path.dirname(file_path)
    file_name = os.path.basename(file_path)
    
    resolved_path = os.path.join(base_dir, f"{file_name}.resolved")
    
    # If .resolved doesn't exist, just copy the current file to it
    if not os.path.exists(resolved_path):
        shutil.copy2(file_path, resolved_path)
        return

    # Find the next available index for .resolved.N
    pattern = re.compile(rf"^{re.escape(file_name)}\.resolved\.(\d+)$")
    max_index = -1
    for f in os.listdir(base_dir):
        match = pattern.match(f)
        if match:
            max_index = max(max_index, int(match.group(1)))
    
    next_index = max_index + 1
    next_resolved_path = os.path.join(base_dir, f"{file_name}.resolved.{next_index}")
    
    # Move current .resolved to .resolved.N
    shutil.copy2(resolved_path, next_resolved_path)
    
    # Copy current file to .resolved
    shutil.copy2(file_path, resolved_path)

def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: stacker.py <file1> <file2> ...")
        sys.exit(1)
    
    for f in sys.argv[1:]:
        stack_file(f)

if __name__ == "__main__":
    main()
