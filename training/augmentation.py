"""Small, dependency-free helpers for drawing-specific data augmentation."""

from __future__ import annotations

import math


def rotation_factor_from_radians(max_angle_radians: float) -> float:
    """Convert a maximum angle in radians to Keras' fraction-of-a-turn factor.

    ``RandomRotation(factor=x)`` samples turns in ``[-x, x]`` (one turn is
    2π radians); passing 0.05 directly would rotate by as much as 18°, not 2.9°.
    """
    radians = abs(float(max_angle_radians))
    return min(0.5, max(0.0, radians / (2.0 * math.pi)))
