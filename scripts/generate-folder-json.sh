#!/bin/bash

# Script to generate JSON representation of folder structure (recursive)
# Usage: ./generate-folder-json.sh <path>
# Example: ./generate-folder-json.sh /home/user/Documents

if [ $# -ne 1 ]; then
    echo "Usage: $0 <path>"
    exit 1
fi

INPUT_PATH="$1"

if [ ! -d "$INPUT_PATH" ]; then
    echo "Error: $INPUT_PATH is not a directory"
    exit 1
fi

# Function to print indented text
print_indented() {
    local level=$1
    local text=$2
    local indent=""
    for ((i=0; i<level; i++)); do
        indent+="  "
    done
    echo "${indent}${text}"
}

# Recursive function to process a directory
process_directory() {
    local dir="$1"
    local level="$2"
    local name=$(basename "$dir")
    
    # Find all subdirectories
    local subdirs=()
    for item in "$dir"/*; do
        if [ -d "$item" ] && [ -r "$item" ]; then
            subdirs+=("$item")
        fi
    done
    
    # Print the current directory object
    print_indented $level "{"
    print_indented $level "  \"name\": \"$name\","
    print_indented $level "  \"type\": \"folder\","
    
    if [ ${#subdirs[@]} -gt 0 ]; then
        print_indented $level "  \"children\": ["
        
        local count=0
        local total=$((${#subdirs[@]} - 1))
        
        # Process each subdirectory
        for subdir in "${subdirs[@]}"; do
            local subname=$(basename "$subdir")
            
            print_indented $((level + 2)) "{"
            print_indented $((level + 2)) "  \"name\": \"$subname\","
            print_indented $((level + 2)) "  \"type\": \"folder\","
            
            # Check if this subdirectory has children
            local sub_subdirs=()
            for sub_item in "$subdir"/*; do
                if [ -d "$sub_item" ] && [ -r "$sub_item" ]; then
                    sub_subdirs+=("$sub_item")
                fi
            done
            
            if [ ${#sub_subdirs[@]} -gt 0 ]; then
                print_indented $((level + 2)) "  \"children\": ["
                # Recursively process the subdirectory
                process_subdir_recursive "$subdir" $((level + 4))
                print_indented $((level + 2)) "  ]"
            else
                print_indented $((level + 2)) "  \"children\": []"
            fi
            
            # Add closing brace and comma if needed
            if [ $count -lt $total ]; then
                print_indented $((level + 2)) "},"
            else
                print_indented $((level + 2)) "}"
            fi
            
            ((count++))
        done
        
        print_indented $level "  ]"
    else
        print_indented $level "  \"children\": []"
    fi
    
    print_indented $level "}"
}

# Recursive helper function to handle nested directories
process_subdir_recursive() {
    local dir="$1"
    local level="$2"
    
    # Find all subdirectories
    local subdirs=()
    for item in "$dir"/*; do
        if [ -d "$item" ] && [ -r "$item" ]; then
            subdirs+=("$item")
        fi
    done
    
    local count=0
    local total=$((${#subdirs[@]} - 1))
    
    for subdir in "${subdirs[@]}"; do
        local subname=$(basename "$subdir")
        
        print_indented $level "{"
        print_indented $level "  \"name\": \"$subname\","
        print_indented $level "  \"type\": \"folder\","
        
        # Check if this subdirectory has children
        local sub_subdirs=()
        for sub_item in "$subdir"/*; do
            if [ -d "$sub_item" ] && [ -r "$sub_item" ]; then
                sub_subdirs+=("$sub_item")
            fi
        done
        
        if [ ${#sub_subdirs[@]} -gt 0 ]; then
            print_indented $level "  \"children\": ["
            process_subdir_recursive "$subdir" $((level + 2))
            print_indented $level "  ]"
        else
            print_indented $level "  \"children\": []"
        fi
        
        # Add closing brace and comma if needed
        if [ $count -lt $total ]; then
            print_indented $level "},"
        else
            print_indented $level "}"
        fi
        
        ((count++))
    done
}

# Main execution - get the base name
name=$(basename "$INPUT_PATH")

# Find root subdirectories
subdirs=()
for item in "$INPUT_PATH"/*; do
    if [ -d "$item" ] && [ -r "$item" ]; then
        subdirs+=("$item")
    fi
done

# Print the root object
echo "{"
print_indented 1 "\"name\": \"$name\","
print_indented 1 "\"type\": \"folder\","

if [ ${#subdirs[@]} -gt 0 ]; then
    print_indented 1 "\"children\": ["
    
    count=0
    total=$((${#subdirs[@]} - 1))
    
    for subdir in "${subdirs[@]}"; do
        subname=$(basename "$subdir")
        
        print_indented 2 "{"
        print_indented 2 "  \"name\": \"$subname\","
        print_indented 2 "  \"type\": \"folder\","
        
        # Check if this subdirectory has children
        sub_subdirs=()
        for sub_item in "$subdir"/*; do
            if [ -d "$sub_item" ] && [ -r "$sub_item" ]; then
                sub_subdirs+=("$sub_item")
            fi
        done
        
        if [ ${#sub_subdirs[@]} -gt 0 ]; then
            print_indented 2 "  \"children\": ["
            process_subdir_recursive "$subdir" 4
            print_indented 2 "  ]"
        else
            print_indented 2 "  \"children\": []"
        fi
        
        # Add closing brace and comma if needed
        if [ $count -lt $total ]; then
            print_indented 2 "},"
        else
            print_indented 2 "}"
        fi
        
        ((count++))
    done
    
    print_indented 1 "]"
else
    print_indented 1 "\"children\": []"
fi

echo "}"