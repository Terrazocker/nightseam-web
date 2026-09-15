"""L6 probe 9: standard_ids padding rule - does an UNSCORED id ever reach
standard mode, as the docstring/CATALOG.md promise it never does?"""
import sys
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
sys.path.insert(0, str(ROOT))
from app.catalog_data import standard_ids, STANDARD_TOP_N

print("empty popularity dict        :", standard_ids(["a", "b"], {}))
print("all-zero scores, top_n=200   :", standard_ids(["a", "b", "c"], {"a": 0, "b": 0, "c": 0}))
print("only 2 scored of 4, top_n=3  :", standard_ids(
    ["a", "b", "c", "d"], {"a": 5, "b": 3, "c": 0, "d": 0}, top_n=3))
print("shipped catalog, top_n=10000 :", len(standard_ids(
    [f"x{i}" for i in range(12176)], {"x0": 1}, top_n=10000)))
print()
print("docstring claim: 'an object with no score is not \"popular\" and never "
      "becomes standard'\nCATALOG.md: 'an unscored object is never standard'")
