"""E2E Pipeline Test v2 — SUPERSEDED by Temporal.

The legacy _dispatch_one() has been replaced by
PlanExecutionWorkflow in nexus/python/conduit/temporal/workflows/.
These tests (builder/critic/reviewer dispatch, multi-role chain)
validated the old subprocess-based dispatch loop.

Kept as documentation of the expected contract; all tests are skipped.
"""

import unittest


@unittest.skip("Legacy _dispatch_one tests — superseded by Temporal PlanExecutionWorkflow")
class TestE2EPipelineV2(unittest.TestCase):
    """Extended E2E pipeline: builder/critic/reviewer dispatch + multi-role chain.

    These tests validated the old subprocess-based dispatch loop.
    Equivalent coverage now lives in the Temporal integration tests
    at nexus/python/conduit/temporal/tests/.
    """
    pass


if __name__ == "__main__":
    unittest.main()
