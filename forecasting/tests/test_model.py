"""Boundary tests use a fake model: no weight download or network required."""
import os
from pathlib import Path
import socket
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import numpy as np

from forecasting.model import LocalTimestral, deny_network, download_model


class Tensor:
    def __init__(self, array):
        self.array = array

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.array


class ModelTests(unittest.TestCase):
    def test_joint_variates_and_covariates_receive_batch_axis(self):
        adapter = LocalTimestral.__new__(LocalTimestral)
        quantiles = np.arange(6).reshape(1, 2, 1, 3)
        adapter.forecaster = Mock()
        adapter.forecaster.forecast.return_value = SimpleNamespace(
            quantiles=Tensor(quantiles), quantile_levels=(0.1, 0.5, 0.9))
        context = np.array([[1, np.nan, 3], [4, 5, 6]])
        result = adapter(context, np.ones((4, 3)), np.ones((2, 4)))
        args, kwargs = adapter.forecaster.forecast.call_args
        self.assertEqual(args[0].shape, (1, 2, 3))
        self.assertTrue(np.isnan(args[0][0, 0, 1]))
        self.assertEqual(kwargs["past_covariates"].shape, (1, 4, 3))
        self.assertEqual(kwargs["known_covariates"].shape, (1, 2, 4))
        self.assertEqual(kwargs["prediction_length"], 1)
        np.testing.assert_equal(result["median"], [1, 4])
        self.assertEqual(result["quantiles"].shape, (2, 3))

    def test_invalid_data_never_reaches_model(self):
        adapter = LocalTimestral.__new__(LocalTimestral)
        adapter.forecaster = Mock()
        for context in (np.ones(3), np.empty((1, 0)), np.array([[np.nan, np.nan]]),
                        np.array([[1, np.inf]])):
            with self.assertRaises(ValueError):
                adapter(context)
        with self.assertRaises(ValueError):
            adapter(np.ones((1, 3)), known_covariates=np.ones((2, 3)))
        adapter.forecaster.forecast.assert_not_called()

    def test_inference_load_is_local_cpu_and_offline(self):
        fake_torch = SimpleNamespace(set_num_threads=Mock())
        factory = Mock()
        def load(*args, **kwargs):
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
            with self.assertRaises(RuntimeError):
                socket.create_connection(("example.com", 443))
            return Mock()
        factory.from_pretrained.side_effect = load
        with tempfile.TemporaryDirectory() as directory:
            for name in ("config.json", "model.safetensors"):
                Path(directory, name).touch()
            with patch.dict("sys.modules", {"torch": fake_torch,
                                           "timestral": SimpleNamespace(TimestralForecaster=factory)}):
                LocalTimestral(directory, threads=2)
        fake_torch.set_num_threads.assert_called_once_with(2)
        kwargs = factory.from_pretrained.call_args.kwargs
        self.assertEqual(kwargs, {"device": "cpu", "local_files_only": True,
                                  "per_shot_horizon_patches": 1})

    def test_socket_guard_denies_and_restores(self):
        original = socket.create_connection
        old_env = os.environ.get("HF_HUB_OFFLINE")
        with deny_network():
            with self.assertRaises(RuntimeError):
                socket.create_connection(("localhost", 9))
            with socket.socket() as connection:
                for method in (connection.connect, connection.connect_ex):
                    with self.assertRaises(RuntimeError):
                        method(("127.0.0.1", 9))
            with deny_network():
                self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
        self.assertIs(socket.create_connection, original)
        self.assertEqual(os.environ.get("HF_HUB_OFFLINE"), old_env)

    def test_download_is_pinned_and_only_requests_checkpoint(self):
        downloader = Mock(return_value="/tmp/model")
        config = '{"model":{"repo_id":"mistralai/Timestral-209M","revision":"' + 'a' * 40 + '"}}'
        with patch.dict("sys.modules", {"huggingface_hub": SimpleNamespace(snapshot_download=downloader)}):
            with patch("pathlib.Path.read_text", return_value=config):
                self.assertEqual(download_model("/tmp/model"), "/tmp/model")
            with patch("pathlib.Path.read_text", return_value=config.replace('a' * 40, 'main')):
                with self.assertRaises(ValueError):
                    download_model("/tmp/model")
        downloader.assert_called_once_with(
            repo_id="mistralai/Timestral-209M", revision="a" * 40,
            local_dir="/tmp/model", allow_patterns=["config.json", "model.safetensors"])

    def test_unexpected_output_rejected(self):
        adapter = LocalTimestral.__new__(LocalTimestral)
        adapter.forecaster = Mock()
        for values in (np.zeros((2, 1, 1, 3)), np.full((1, 1, 1, 3), np.nan)):
            adapter.forecaster.forecast.return_value = SimpleNamespace(
                quantiles=Tensor(values), quantile_levels=(0.1, 0.5, 0.9))
            with self.assertRaises(ValueError):
                adapter(np.ones((1, 3)))


if __name__ == "__main__":
    unittest.main()
