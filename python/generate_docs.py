import ast
import glob
import os
import sys

if len(sys.argv) < 2:
    print("Usage: python generate_docs.py <target_directory>")
    sys.exit(1)

target_dir = sys.argv[1]
package_name = os.path.basename(os.path.normpath(target_dir))

markdown = f"# Nexus {package_name} - API Reference\n\n"
markdown += f"This document details every module, class, and method within the `{package_name}` package.\n\n"

search_pattern = os.path.join(target_dir, "**/*.py")
for filepath in sorted(glob.glob(search_pattern, recursive=True)):
    filename = os.path.basename(filepath)
    if filename.startswith("test_") or filename == "generate_docs.py": 
        continue
    
    try:
        with open(filepath, "r") as f:
            tree = ast.parse(f.read())
    except Exception as e:
        continue
        
    rel_path = os.path.relpath(filepath, target_dir)
    markdown += f"## Module: `{rel_path}`\n\n"
    
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            markdown += f"### Class: `{node.name}`\n"
            docstring = ast.get_docstring(node)
            if docstring:
                markdown += f"> {docstring}\n\n"
            
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    args = [a.arg for a in item.args.args if a.arg != 'self']
                    markdown += f"- **Method**: `{item.name}({', '.join(args)})`\n"
                    func_doc = ast.get_docstring(item)
                    if func_doc:
                        func_doc_single = " ".join(func_doc.split())
                        markdown += f"  - {func_doc_single}\n"
            markdown += "\n"
        elif isinstance(node, ast.FunctionDef):
            args = [a.arg for a in node.args.args]
            markdown += f"### Function: `{node.name}({', '.join(args)})`\n"
            func_doc = ast.get_docstring(node)
            if func_doc:
                func_doc_single = " ".join(func_doc.split())
                markdown += f"> {func_doc_single}\n\n"

output_path = os.path.join(target_dir, "API_REFERENCE.md")
with open(output_path, "w") as f:
    f.write(markdown)

print(f"API_REFERENCE.md generated successfully in {target_dir}")
