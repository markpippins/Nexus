#!/usr/bin/env python3
"""Fixture tests for stage0 mapper structural normalization (ruling 8596d726).

Covers historical discover 'top hit' shapes, similarity key variants,
name normalization sentinels, and apply-band eligibility (ids required).
Run: python3 test_mapper_structural.py
"""
import sys

from stage0_map import normalize_match

FAILURES = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f"  {detail}" if not cond else ""))
    if not cond:
        FAILURES.append(name)


def t_shape_flat_ids():
    nm = normalize_match("cand-1", {
        "entity": {"systemId": "sys-9", "subsystemId": "sub-3", "name": "  Alpha Core "},
        "similarity": 0.91})
    check("flat ids", nm["system_id"] == "sys-9" and nm["subsystem_id"] == "sub-3", str(nm))
    check("name trimmed", nm["name"] == "Alpha Core", repr(nm["name"]))
    check("similarity", nm["similarity"] == 0.91)


def t_shape_nested():
    nm = normalize_match("cand-2", {
        "entity": {"system": {"id": "sys-1", "name": "Beta"},
                   "subsystem": {"id": "sub-7"}},
        "score": 0.66})  # alt similarity key
    check("nested system id", nm["system_id"] == "sys-1", str(nm))
    check("nested subsystem id", nm["subsystem_id"] == "sub-7")
    check("score key read", nm["similarity"] == 0.66)


def t_shape_bare_system_row():
    nm = normalize_match("cand-3", {"entity": {"id": "sys-5", "name": "Gamma"},
                                    "similarity": "0.83"})  # str sim
    check("bare-row id used", nm["system_id"] == "sys-5", str(nm))
    check("string sim coerced", nm["similarity"] == 0.83)


def t_sentinels_and_garbage():
    nm = normalize_match("cand-4", {"entity": {"systemId": "sys-2", "name": "(none)"},
                                    "similarity": None})
    check("(none) name -> empty", nm["name"] == "", repr(nm["name"]))
    check("missing sim -> 0.0", nm["similarity"] == 0.0)
    check("no ids stays None", normalize_match("c", {"entity": {}, "similarity": 0.9})["system_id"] is None)
    nm2 = normalize_match("cand-5", {"entity": {"name": "X"}, "similarity": "abc"})
    check("garbage sim -> 0.0", nm2["similarity"] == 0.0)


def t_apply_band_eligibility():
    # Mirror the loop's eligibility rule: sim >= threshold AND system_id present
    THR = 0.80
    cases = [
        ({"entity": {"systemId": "s"}, "similarity": 0.85}, True),
        ({"entity": {"name": "no-id"}, "similarity": 0.95}, False),  # high sim, no id -> proposed_only
        ({"entity": {"systemId": "s"}, "similarity": 0.60}, False),  # id but low sim -> proposed_only
    ]
    for top, expect in cases:
        nm = normalize_match("x", top)
        eligible = nm["similarity"] >= THR and bool(nm["system_id"])
        check(f"band {top['similarity']}/{bool(nm['system_id'])} -> {expect}",
              eligible == expect)


if __name__ == "__main__":
    t_shape_flat_ids()
    t_shape_nested()
    t_shape_bare_system_row()
    t_sentinels_and_garbage()
    t_apply_band_eligibility()
    print()
    if FAILURES:
        print(f"FAILED: {FAILURES}")
        sys.exit(1)
    print("ALL MAPPER TESTS PASSED")
