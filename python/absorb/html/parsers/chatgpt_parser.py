import re
from pathlib import Path

from models import NormalizedMessage, TimestampInfo, ImageReference, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class ChatGPTParser(BaseParser):
    """Parser for ChatGPT / ChatGPT-like (including custom GPTs) HTML exports.

    Detection heuristic: exported markdown contains \"**ChatGPT\" speaker
    labels typical of ChatGPT exports rendered through DocLing, or the
    filename contains \"chatgpt\".
    """

    @property
    def source_name(self) -> str:
        return "ChatGPT"

    def can_handle(self, doc, source_path: Path) -> bool:
        if doc is None:
            return False
        md = doc.export_to_markdown()
        # Look for **ChatGPT label at line-start (handles **ChatGPT**, **ChatGPT:**, etc.)
        has_chatgpt_label = any("**ChatGPT" in line for line in md.split('\n'))
        # Also check if the source filename suggests ChatGPT
        filename_lower = source_path.name.lower()
        is_chatgpt_filename = 'chatgpt' in filename_lower or 'chat-gpt' in filename_lower
        return has_chatgpt_label or is_chatgpt_filename

    def extract_metadata(self, doc, source_path: Path) -> ConversationMetadata:
        md = doc.export_to_markdown()

        # Title: first heading in the document
        title = None
        for line in md.split('\n'):
            if line.startswith('# '):
                title = line.lstrip('# ').strip()
                break
        if not title:
            title = source_path.stem

        # Model heuristic: check for model mentions in text
        model = None
        model_match = re.search(r'(gpt-4|gpt-3\.5|gpt-4o|gpt-4-turbo)', md, re.IGNORECASE)
        if model_match:
            model = model_match.group(1)

        file_ts = self.file_timestamp(source_path)

        return ConversationMetadata(
            title=title,
            create_time=file_ts.value,
            model=model,
        )

    def parse(self, doc, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        md = doc.export_to_markdown()

        messages: list[NormalizedMessage] = []
        turn_counter = 0
        last_speaker: str | None = None

        ts = TimestampInfo(
            value=metadata.create_time,
            confidence="low",
            source="file_metadata",
            raw_value=metadata.create_time,
        ) if metadata.create_time else self.file_timestamp(source_path)

        # Parse markdown into alternating speaker blocks using simple string ops
        lines = md.split('\n')
        current_speaker = None
        current_text_parts: list[str] = []

        # Speaker label detection prefixes
        SPEAKER_MAP = {
            '**ChatGPT': 'assistant',
            '**User': 'user',
            '**You': 'user',
        }

        for line in lines:
            stripped = line.strip()
            matched_speaker = None
            matched_rest = None

            for prefix, speaker in SPEAKER_MAP.items():
                if stripped.startswith(prefix):
                    # Find where the label ends (after the bold markers and optional colon)
                    # Handle formats: **Label:**, **Label**:, **Label**
                    after_label = stripped[len(prefix):]
                    if after_label.startswith('**'):
                        after_label = after_label[2:]
                    after_label = after_label.lstrip(':').lstrip()
                    matched_speaker = speaker
                    matched_rest = after_label
                    break

            if matched_speaker is not None:
                # Save previous message
                if current_speaker and current_text_parts:
                    text = '\n'.join(current_text_parts).strip()
                    text = ChatGPTParser._strip_citations(text)
                    text = BaseParser.normalize_text(text)

                    if last_speaker == current_speaker:
                        turn_counter += 1

                    messages.append(NormalizedMessage(
                        message_id=f'chatgpt-msg-{len(messages)}',
                        speaker=current_speaker,
                        timestamp=ts,
                        text=text,
                        turn_index=turn_counter,
                        raw_html_ref=f'{source_path.name}:{len(messages)}',
                    ))
                    last_speaker = current_speaker

                current_speaker = matched_speaker
                current_text_parts = [matched_rest] if matched_rest else []
            else:
                if current_speaker:
                    current_text_parts.append(line)

        # Save last message
        if current_speaker and current_text_parts:
            text = '\n'.join(current_text_parts).strip()
            text = ChatGPTParser._strip_citations(text)
            text = BaseParser.normalize_text(text)

            messages.append(NormalizedMessage(
                message_id=f'chatgpt-msg-{len(messages)}',
                speaker=current_speaker,
                timestamp=ts,
                text=text,
                turn_index=turn_counter,
                raw_html_ref=f'{source_path.name}:{len(messages)}',
            ))

        return messages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_citations(text: str) -> str:
        """Remove Markdown and numeric citation artifacts from ChatGPT output."""
        # Remove footnote-style citations: [^1], [^citation_name]
        text = re.sub(r'\[\^[^\]]+\]', '', text)
        # Remove trailing numeric citations that appear after punctuation: text.[1]
        text = re.sub(r'\.\[\d+\]', '.', text)
        # Remove inline source attribution: (Source: ...)
        text = re.sub(r'\(Source:[^)]*\)', '', text, flags=re.IGNORECASE)
        return text
