"""Integration test for _dispatch_one() — SUPERSEDED by Temporal.

The legacy _dispatch_one() has been replaced by
PlanExecutionWorkflow in nexus/python/conduit/temporal/workflows/.
These tests validated the old subprocess-based dispatch loop;
equivalent coverage now lives in the Temporal integration tests.

Kept as documentation of the expected contract; all tests are skipped.
"""

import unittest


@unittest.skip("Legacy _dispatch_one tests — superseded by Temporal PlanExecutionWorkflow")
class TestDispatchIntegration(unittest.TestCase):
    """Integration tests exercising _dispatch_one() with a fake executor.

    These tests validated the old subprocess-based dispatch loop.
    Equivalent coverage now lives in the Temporal integration tests
    at nexus/python/conduit/temporal/tests/.
    """
    pass


if __name__ == "__main__":
    unittest.main()
