"""Utilities for loading and validating events from the event store."""

import json, os

from validators.events import validate_event


def load_events(event_dir):
    """Load all .json events from the directory, skipping invalid ones.

    Returns (valid_events, errors) where errors is a list of (filename, error_msg).
    """
    valid = []
    errors = []
    for f in os.listdir(event_dir):
        if not f.endswith(".json"):
            continue
        path = os.path.join(event_dir, f)
        try:
            with open(path) as fh:
                evt = json.load(fh)
        except json.JSONDecodeError as e:
            errors.append((f, f"Invalid JSON: {e}"))
            continue
        except Exception as e:
            errors.append((f, f"Read error: {e}"))
            continue

        is_valid, err = validate_event(evt)
        if is_valid:
            valid.append(evt)
        else:
            errors.append((f, err))
            continue

    return valid, errors
