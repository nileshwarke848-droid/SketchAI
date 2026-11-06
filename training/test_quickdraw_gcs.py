"""Offline tests for the public-GCS byte-range bitmap loader."""
from __future__ import annotations

import io
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

import quickdraw_gcs
import quickdraw_ndjson
import train_345


class RangeFixture(BaseHTTPRequestHandler):
    payload = b""
    requests: list[tuple[int, int]] = []
    response_ranges: list[tuple[int, int]] = []
    ignore_range = False

    def do_GET(self):  # noqa: N802 - stdlib handler API
        header = self.headers.get("Range", "")
        if not header.startswith("bytes="):
            self.send_response(400)
            self.end_headers()
            return
        first, last = (int(value) for value in header.removeprefix("bytes=").split("-", 1))
        type(self).requests.append((first, last))
        if type(self).ignore_range:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(type(self).payload)
            return
        last = min(last, len(type(self).payload) - 1)
        type(self).response_ranges.append((first, last))
        body = type(self).payload[first:last + 1]
        self.send_response(206)
        self.send_header("Content-Range", f"bytes {first}-{last}/{len(type(self).payload)}")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class QuickDrawGCSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.images = np.zeros((100, 28, 28), dtype=np.uint8)
        for i in range(len(cls.images)):
            cls.images[i, 7:20, 5 + i % 3:20] = 255
        stream = io.BytesIO()
        np.save(stream, cls.images.reshape(len(cls.images), 784), allow_pickle=False)
        RangeFixture.payload = stream.getvalue()
        RangeFixture.requests = []
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), RangeFixture)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}/"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        RangeFixture.requests = []
        RangeFixture.response_ranges = []
        RangeFixture.ignore_range = False
        quickdraw_gcs.GCS_BASE_URL = self.base

    def test_label_url_quotes_as_one_object_name(self):
        self.assertEqual(
            quickdraw_gcs.category_url("The Great Wall of China"),
            self.base + "The%20Great%20Wall%20of%20China.npy",
        )

    def test_header_probe_reads_only_a_range(self):
        header = quickdraw_gcs.read_npy_header(quickdraw_gcs.category_url("cat"))
        self.assertEqual(header["rows"], 100)
        self.assertEqual(header["shape"], [100, 784])
        self.assertEqual(header["dtype"], "uint8")
        self.assertEqual(RangeFixture.requests, [(0, 65535)])
        self.assertLess(RangeFixture.response_ranges[0][1], len(RangeFixture.payload) - 1)

    def test_refuses_full_object_fallback_if_server_ignores_range(self):
        RangeFixture.ignore_range = True
        with self.assertRaises(quickdraw_gcs.GCSRangeError):
            quickdraw_gcs.read_npy_header(quickdraw_gcs.category_url("cat"))

    def test_chunk_cache_matches_app_geometry_and_resumes(self):
        with tempfile.TemporaryDirectory() as temporary:
            calls = 0

            def fail_after_one_chunk(request, timeout=120):
                nonlocal calls
                calls += 1
                if calls >= 3:  # header, first chunk, then an injected disconnection
                    raise OSError("injected disconnect")
                return quickdraw_gcs.urllib.request.urlopen(request, timeout=timeout)

            with self.assertRaises(RuntimeError):
                quickdraw_gcs.cache_category(
                    "cat", Path(temporary), chunk_rows=4, logger=lambda *_: None,
                    opener=fail_after_one_chunk,
                )
            progress = Path(temporary) / "cat.progress.json"
            self.assertTrue(progress.exists())
            self.assertEqual(__import__("json").loads(progress.read_text())["completed_rows"], 4)

            result = quickdraw_gcs.cache_category(
                "cat", Path(temporary), chunk_rows=4, logger=lambda *_: None,
            )
            self.assertEqual(result["rows"], 100)
            self.assertEqual(result["cached"], False)
            self.assertFalse(progress.exists())
            self.assertNotIn((0, len(RangeFixture.payload) - 1), RangeFixture.requests)
            self.assertGreater(len(RangeFixture.requests), 3)

            actual = np.load(Path(temporary) / "cat.npy", mmap_mode="r")
            expected = quickdraw_ndjson.to_app_geometry(self.images.astype(np.float32) / 255.0)
            expected = np.rint(expected * 255).astype(np.uint8).reshape(100, 784)
            np.testing.assert_array_equal(actual, expected)

    def test_row_limit_is_bounded_for_smoke_tests(self):
        with tempfile.TemporaryDirectory() as temporary:
            result = quickdraw_gcs.cache_category(
                "cat", Path(temporary), chunk_rows=3, row_limit=5,
                logger=lambda *_: None,
            )
            self.assertEqual(result["rows"], 5)
            self.assertEqual(np.load(Path(temporary) / "cat.npy", mmap_mode="r").shape, (5, 784))

    def test_train_pipeline_integrates_full_mode_without_sample_cap(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            cfg = train_345.Config(
                dataset="quickdraw-gcs-full",
                samples_per_class=0,
                gcs_chunk_rows=4,
                cache_dir=root / "cache",
                data_dir=root / "data",
                output_dir=root / "run",
                export_dir=root / "export",
                train_fraction=0.6,
                val_fraction=0.2,
            )
            train_345.download_dataset(["cat"], cfg, logger=lambda *_: None)
            cache = np.load(root / "cache" / "cat.npy", mmap_mode="r")
            self.assertEqual(cache.shape, (100, 784))
            bundle = train_345.build_splits(["cat"], cfg, logger=lambda *_: None)
            self.assertEqual(len(bundle.train) + len(bundle.val) + len(bundle.test), 100)

    def test_train_pipeline_samples_requested_rows_per_class(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            cfg = train_345.Config(
                dataset="quickdraw-gcs-sampled",
                samples_per_class=32,
                gcs_chunk_rows=8,
                cache_dir=root / "cache",
                data_dir=root / "data",
                output_dir=root / "run",
                export_dir=root / "export",
            )
            train_345.download_dataset(["cat"], cfg, logger=lambda *_: None)
            cache = np.load(root / "cache" / "cat.npy", mmap_mode="r")
            self.assertEqual(cache.shape, (32, 784))


if __name__ == "__main__":
    unittest.main(verbosity=2)
