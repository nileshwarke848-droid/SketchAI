#!/usr/bin/env python3
"""Regression tests for training augmentation units; no ML packages required."""
import math
import unittest

from augmentation import rotation_factor_from_radians


class RotationFactorTests(unittest.TestCase):
    def test_radians_are_converted_to_keras_turns(self):
        self.assertAlmostEqual(rotation_factor_from_radians(0.05), 0.05 / (2 * math.pi))
        self.assertAlmostEqual(rotation_factor_from_radians(-0.05), 0.05 / (2 * math.pi))

    def test_zero_and_half_turn_bounds(self):
        self.assertEqual(rotation_factor_from_radians(0), 0)
        self.assertEqual(rotation_factor_from_radians(math.pi), 0.5)
        self.assertEqual(rotation_factor_from_radians(4 * math.pi), 0.5)


if __name__ == '__main__':
    unittest.main()
