"""Cascade Conformance Probe v0.1 — architecture recovery from live transitions.

This package observes running cascade transitions (observation.captured →
assessment.completed → assembly.created) and projects them into
TransitionRequest/TransitionResult pairs for LOSM semantic validation.

No mutations. No new services. Pure observation.

See vision-8.md and vision-9.md for the design rationale.
"""
