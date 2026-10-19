import json
import unittest

from forecasting.contract import make_forecast_result


class ContractTests(unittest.TestCase):
    def result(self, **kwargs):
        args = dict(run_id="test-run", date="2026-10-19", target="ema.energy",
                    model_revision="revision", point=3)
        args.update(kwargs)
        return make_forecast_result(**args)

    def test_local_cutoff_and_scale(self):
        result = self.result(point=7, quantiles={"0.9": 8, "0.1": -2, "0.5": 4})
        self.assertEqual(result["cutoff"], "2026-10-19T09:00:00+03:00")
        self.assertEqual(result["assessment"], "2026-10-19T10:00:00+03:00")
        self.assertEqual(result["point"], 5)
        self.assertEqual(result["quantiles"], {"0.1": 1, "0.5": 4, "0.9": 5})
        self.assertEqual(result["unit"], "rating_1_5")
        self.assertEqual(result["status"], "experimental")
        json.dumps(result, allow_nan=False)

    def test_welltory_has_no_assumed_unit_or_bounds(self):
        result = self.result(target="welltory.energy", point=110)
        self.assertIsNone(result["unit"])
        self.assertEqual(result["point"], 110)
        quality = {"unit": "source-score", "fresh": False, "limitations": ["sparse"]}
        result = self.result(target="welltory.energy", quality=quality)
        self.assertEqual(result["unit"], "source-score")
        self.assertEqual(result["quality"], quality)
        self.assertIsNot(result["quality"], quality)

    def test_missing_point_is_explicit(self):
        result = self.result(target="ema.mood", point=None)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["point"])
        self.assertEqual(result["quantiles"], {})

    def test_rejects_invalid_contracts(self):
        invalid = [dict(target="energy"), dict(point=float("nan")), dict(point=float("inf")),
                   dict(point=True), dict(date="20261019"), dict(run_id=""),
                   dict(quantiles={"0.1": 4, "0.9": 2}),
                   dict(quantiles={"1": 3}), dict(quantiles={"0": 3}),
                   dict(quantiles={"0.5": 3, "0.50": 4}),
                   dict(quantiles={"0.5": float("nan")}),
                   dict(point=None, quantiles={"0.5": 3})]
        for kwargs in invalid:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.result(**kwargs)


if __name__ == "__main__":
    unittest.main()
