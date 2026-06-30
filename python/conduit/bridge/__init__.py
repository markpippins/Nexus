"""
Conduit → Kernel Bridge.

Polling projection consumer that maps conduit receipts to KernelDeltas
and feeds them to the WRP Kernel Runtime (port 3103).

See sync.py and checkpoint.py for details.
"""
