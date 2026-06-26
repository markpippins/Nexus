"""Pytest configuration for replay test suite."""


def pytest_collection_modifyitems(config, items):
    """Apply 'replay' marker to all collected tests."""
    for item in items:
        item.add_marker("replay")
