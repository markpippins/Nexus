import re

def clean_transcript(input_path, output_path, markers):
    """
    Trims time markers and cleans up leading whitespace/punctuation.
    """
    try:
        with open(input_path, 'r', encoding='utf-8') as infile:
            lines = infile.readlines()

        cleaned_lines = []
        for line in lines:
            cut_off = -1
            
            for marker in markers:
                idx = line.find(marker)
                if idx != -1:
                    # Point to the end of the marker word
                    end_of_word = idx + len(marker)
                    if end_of_word > cut_off:
                        cut_off = end_of_word
            
            if cut_off != -1:
                # Extract the text after the marker
                new_line = line[cut_off:]
                # Clean up leading spaces and common transcript separators like ':' or '-'
                new_line = re.sub(r'^[ \t\:\-\]]+', '', new_line)
                cleaned_lines.append(new_line)
            else:
                cleaned_lines.append(line)

        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.writelines(cleaned_lines)
            
        print(f"Cleaned file saved to: {output_path}")

    except FileNotFoundError:
        print("File not found. Please check your file path.")

# Configuration
MY_MARKERS = ["minutes", "seconds", "min", "sec"]
clean_transcript('transcript.txt', 'cleaned_transcript.txt', MY_MARKERS)