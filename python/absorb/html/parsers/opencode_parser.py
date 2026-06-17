import re
from pathlib import Path

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class OpenCodeParser(BaseParser):
    """Parser for OpenCode HTML exports.

    Detection: exported markdown with "**Assistant" / "**User" labels
    from OpenCode session exports rendered through DocLing, or filename
    contains "opencode".
    """

    @property
    def source_name(self) -> str:
        return "OpenCode"

    def can_handle(self, doc, source_path: Path) -> bool:
        if doc is None:
            return False
        md = doc.export_to_markdown()
        has_assistant = any("**Assistant" in line for line in md.split('\n'))
        has_user = any("**User" in line for line in md.split('\n'))
        filename_lower = source_path.name.lower()
        is_opencode = 'opencode' in filename_lower or 'open-code' in filename_lower
        return (has_assistant and has_user) or is_opencode

    def extract_metadata(self, doc, source_path: Path) -> ConversationMetadata:
        md = doc.export_to_markdown()
        title = None
        for line in md.split('\n'):
            if line.startswith('# '):
                title = line.lstrip('# ').strip()
                break
        if not title:
            title = source_path.stem

        file_ts = self.file_timestamp(source_path)

        return ConversationMetadata(
            title=title,
            create_time=file_ts.value,
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

        # Speaker label detection
        SPEAKER_MAP = {
            '**Assistant': 'assistant',
            '**User': 'user',
        }

        lines = md.split('\n')
        current_speaker = None
        current_text_parts: list[str] = []

        for line in lines:
            stripped = line.strip()
            matched_speaker = None
            matched_rest = None

            for prefix, speaker in SPEAKER_MAP.items():
                if stripped.startswith(prefix):
                    after_label = stripped[len(prefix):]
                    if after_label.startswith('**'):
                        after_label = after_label[2:]
                    after_label = after_label.lstrip(':').lstrip()
                    matched_speaker = speaker
                    matched_rest = after_label
                    break

            if matched_speaker is not None:
                if current_speaker and current_text_parts:
                    text = '\n'.join(current_text_parts).strip()
                    text = BaseParser.normalize_text(text)

                    if last_speaker == current_speaker:
                        turn_counter += 1

                    messages.append(NormalizedMessage(
                        message_id=f'opencode-msg-{len(messages)}',
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

        if current_speaker and current_text_parts:
            text = '\n'.join(current_text_parts).strip()
            text = BaseParser.normalize_text(text)

            messages.append(NormalizedMessage(
                message_id=f'opencode-msg-{len(messages)}',
                speaker=current_speaker,
                timestamp=ts,
                text=text,
                turn_index=turn_counter,
                raw_html_ref=f'{source_path.name}:{len(messages)}',
            ))

        return messages
