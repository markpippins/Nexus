"""
Conduit → Kernel Bridge.

Polling projection consumer that maps conduit receipts to KernelDeltas
and feeds them to the in-process WRP Kernel Runtime.

See sync.py and checkpoint.py for details.
"""
