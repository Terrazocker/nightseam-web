"""Neutral catalog reader contracts after the desktop repository extraction."""
import csv
import json
from pathlib import Path

from catalog_data.loader import read_catalog, web_rows

ROOT = Path(__file__).resolve().parents[1]


def test_reader_round_trips_quoted_semicolons_and_nullable_values(tmp_path):
    path = tmp_path / "objects.csv"
    row = ["object1", "Nebula; cluster", "", "", "", "nebula", "1.5", "-2.5", "", "30", "Ori", "", "", "nebula; cluster"]
    with path.open("w", encoding="utf-8", newline="") as stream:
        csv.writer(stream, delimiter=";").writerow(row)
    result = read_catalog(path)
    assert len(result) == 1
    assert result[0]["primary_name"] == "Nebula; cluster"
    assert result[0]["search"] == "nebula; cluster"
    assert result[0]["ra_hours"] == 1.5
    assert result[0]["dec_deg"] == -2.5
    assert result[0]["vmag"] is None


def test_reader_skips_comment_blank_and_malformed_rows(tmp_path):
    path = tmp_path / "objects.csv"
    path.write_text("# header\n\nshort;row\nobject1;Name;;;;nebula;not-a-number;0;;30;Ori;;;name\n", encoding="utf-8")
    assert read_catalog(path) == []
    assert read_catalog(tmp_path / "missing.csv") == []


def test_neutral_builder_reproduces_the_complete_committed_web_payload():
    payload = json.loads((ROOT / "web/catalog.json").read_text(encoding="utf-8"))
    assert web_rows() == payload
