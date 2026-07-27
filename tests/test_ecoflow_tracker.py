"""
Unit-Tests für ecoflow_tracker_github.py — insbesondere die neue
Smart-Plug-Extraktion, Config-Parsing und die generalisierte CSV-Migration.

Ausführen: python -m unittest discover -s tests
(reine Standardbibliothek, kein zusätzliches Test-Dependency nötig)
"""

import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ecoflow_tracker_github as tracker


class ExtractSmartplugTests(unittest.TestCase):
    def test_scales_watts_and_current_but_not_volt_and_temp(self):
        # 2_1.watts ist Integer×10 kodiert (Dezi-Watt), current in Milliampere.
        # 2_1.volt/2_1.temp sind bereits Endwerte -- anhand realer DEBUG-
        # Rohdaten produktiver Plugs verifiziert (CHANGELOG): z. B. volt=235
        # bedeutet 235 V, nicht 23.5 V; temp=34 bedeutet 34 °C, nicht 3.4 °C.
        raw = {
            "2_1.watts": 1234,
            "2_1.switchSta": 1,
            "2_1.volt": 235,
            "2_1.current": 5360,
            "2_1.temp": 34,
            "2_1.brightness": 512,
        }
        result = tracker.extract_smartplug(raw)
        self.assertEqual(result["watts"], 123.4)
        self.assertEqual(result["switch_sta"], 1.0)
        self.assertEqual(result["volt"], 235.0)
        self.assertEqual(result["current_a"], 5.4)
        self.assertEqual(result["temp_c"], 34.0)
        self.assertEqual(result["led_brightness"], 512.0)

    def test_falls_back_to_bare_keys_without_prefix(self):
        raw = {"watts": 500, "switchSta": 0, "volt": 231}
        result = tracker.extract_smartplug(raw)
        self.assertEqual(result["watts"], 50.0)
        self.assertEqual(result["switch_sta"], 0.0)
        self.assertEqual(result["volt"], 231.0)

    def test_missing_fields_default_to_zero(self):
        result = tracker.extract_smartplug({})
        self.assertEqual(result, {
            "watts": 0.0, "switch_sta": 0.0, "volt": 0.0,
            "current_a": 0.0, "temp_c": 0.0, "led_brightness": 0.0,
        })

    def test_explicit_zero_is_not_treated_as_missing(self):
        # get_field() muss zwischen "Feld fehlt" und "Feld ist 0" unterscheiden.
        raw = {"2_1.watts": 0, "2_1.switchSta": 0}
        result = tracker.extract_smartplug(raw)
        self.assertEqual(result["watts"], 0.0)
        self.assertEqual(result["switch_sta"], 0.0)


class ParseSmartplugsConfigTests(unittest.TestCase):
    def setUp(self):
        self._original = tracker.SMARTPLUGS_JSON

    def tearDown(self):
        tracker.SMARTPLUGS_JSON = self._original

    def test_empty_config_returns_empty_list(self):
        tracker.SMARTPLUGS_JSON = ""
        self.assertEqual(tracker.parse_smartplugs_config(), [])

    def test_valid_json_list_is_parsed(self):
        tracker.SMARTPLUGS_JSON = (
            '[{"sn": "SN-1", "name": "Kühlschrank"}, {"sn": "SN-2", "name": "Waschmaschine"}]'
        )
        result = tracker.parse_smartplugs_config()
        self.assertEqual(result, [
            {"sn": "SN-1", "name": "Kühlschrank"},
            {"sn": "SN-2", "name": "Waschmaschine"},
        ])

    def test_entry_without_name_falls_back_to_sn(self):
        tracker.SMARTPLUGS_JSON = '[{"sn": "SN-1"}]'
        result = tracker.parse_smartplugs_config()
        self.assertEqual(result, [{"sn": "SN-1", "name": "SN-1"}])

    def test_entry_without_sn_is_skipped(self):
        tracker.SMARTPLUGS_JSON = '[{"name": "ohne SN"}, {"sn": "SN-1", "name": "gültig"}]'
        result = tracker.parse_smartplugs_config()
        self.assertEqual(result, [{"sn": "SN-1", "name": "gültig"}])

    def test_invalid_json_returns_empty_list(self):
        tracker.SMARTPLUGS_JSON = "{not valid json"
        self.assertEqual(tracker.parse_smartplugs_config(), [])

    def test_non_list_json_returns_empty_list(self):
        tracker.SMARTPLUGS_JSON = '{"sn": "SN-1"}'
        self.assertEqual(tracker.parse_smartplugs_config(), [])


class MigrateCsvIfNeededTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.csv_file = os.path.join(self.tmpdir.name, "test.csv")

    def tearDown(self):
        self.tmpdir.cleanup()

    def _write_csv(self, fieldnames, rows):
        with open(self.csv_file, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    def _read_csv(self):
        with open(self.csv_file, "r", newline="") as f:
            return list(csv.DictReader(f))

    def test_noop_when_file_does_not_exist(self):
        tracker.migrate_csv_if_needed(self.csv_file, ["a", "b"], 1)
        self.assertFalse(os.path.exists(self.csv_file))

    def test_noop_when_schema_already_current(self):
        fieldnames = ["timestamp", "watts"]
        self._write_csv(fieldnames, [{"timestamp": "t1", "watts": "10"}])
        mtime_before = os.path.getmtime(self.csv_file)
        tracker.migrate_csv_if_needed(self.csv_file, fieldnames, 1)
        self.assertEqual(os.path.getmtime(self.csv_file), mtime_before)

    def test_adds_new_columns_and_keeps_old_values(self):
        self._write_csv(["timestamp", "watts"], [{"timestamp": "t1", "watts": "10"}])
        tracker.migrate_csv_if_needed(self.csv_file, ["timestamp", "watts", "switch_sta"], 2)
        rows = self._read_csv()
        self.assertEqual(rows, [{"timestamp": "t1", "watts": "10", "switch_sta": ""}])

    def test_drops_removed_columns(self):
        self._write_csv(["timestamp", "watts", "legacy"], [{"timestamp": "t1", "watts": "10", "legacy": "x"}])
        tracker.migrate_csv_if_needed(self.csv_file, ["timestamp", "watts"], 2)
        rows = self._read_csv()
        self.assertEqual(rows, [{"timestamp": "t1", "watts": "10"}])


class AppendRowsToCsvTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.csv_file = os.path.join(self.tmpdir.name, "plugs.csv")

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_writes_header_once_and_appends_multiple_rows(self):
        fieldnames = ["timestamp", "plug_sn", "watts"]
        rows_a = [
            {"timestamp": "t1", "plug_sn": "SN-1", "watts": 10},
            {"timestamp": "t1", "plug_sn": "SN-2", "watts": 20},
        ]
        rows_b = [{"timestamp": "t2", "plug_sn": "SN-1", "watts": 15}]

        tracker.append_rows_to_csv(rows_a, self.csv_file, fieldnames)
        tracker.append_rows_to_csv(rows_b, self.csv_file, fieldnames)

        with open(self.csv_file, "r", newline="") as f:
            content = list(csv.DictReader(f))
        self.assertEqual(len(content), 3)
        self.assertEqual(content[0]["plug_sn"], "SN-1")
        self.assertEqual(content[2]["timestamp"], "t2")

    def test_noop_for_empty_rows(self):
        tracker.append_rows_to_csv([], self.csv_file, ["timestamp"])
        self.assertFalse(os.path.exists(self.csv_file))


if __name__ == "__main__":
    unittest.main()
