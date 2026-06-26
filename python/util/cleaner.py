import re

TIMESTAMP_RE = re.compile(r'^\d+:\d{2}$')

def clean_transcript(input_path, output_path):
    """
    Strips timestamp-only lines (e.g. 0:00, 1:30) and blank lines from a transcript file.
    """
    try:
        with open(input_path, 'r', encoding='utf-8') as infile:
            lines = infile.readlines()

        cleaned_lines = [
            line for line in lines
            if line.strip() and not TIMESTAMP_RE.match(line.strip())
        ]

        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.writelines(cleaned_lines)

        print(f"Cleaned file saved to: {output_path}")

    except FileNotFoundError:
        print("File not found. Please check your file path.")

clean_transcript('transcript.txt', 'cleaned_transcript.txt')