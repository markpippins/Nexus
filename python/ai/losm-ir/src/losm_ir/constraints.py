from typing import Any, Dict


class ConstraintViolation(Exception):
    def __init__(self, message: str, witness: Dict[str, Any]):
        super().__init__(message)
        self.witness = witness


__all__ = ["ConstraintViolation"]
