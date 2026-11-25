#!/usr/bin/env python3
"""Checks a Supabase backup (roles.sql, schema.sql, data.sql from `supabase db dump`).

  split <data.sql> <out_app_data.sql> <counts.tsv>
      Counts the rows of every table in the data dump, and writes the rows of
      the app's own schemas (public, private) to a separate file so they can be
      restored into a throwaway database.
  countsql <counts.tsv> <app|all>
      Prints one SQL query that counts the same tables in a database.
  compare <expected.tsv> <actual.tsv> <label>
      Compares two "schema.table<TAB>rows" lists. Prints counts only (the logs
      of this repository are public) and exits 1 on any difference.
"""
import re
import sys

APP_SCHEMAS = {"public", "private"}
COPY_RE = re.compile(r'^COPY "?([^".]+)"?\."?([^"\s(]+)"?')


def split(data_path, out_path, counts_path):
    counts = {}
    with open(data_path, encoding="utf-8") as src, open(out_path, "w", encoding="utf-8") as out:
        in_copy = None
        keep = False
        for line in src:
            if in_copy is None:
                m = COPY_RE.match(line)
                if m:
                    in_copy = f"{m.group(1)}.{m.group(2)}"
                    keep = m.group(1) in APP_SCHEMAS
                    counts[in_copy] = 0
                    if keep:
                        out.write(line)
                    continue
                # Settings and sequence positions: keep the general ones and the app's own.
                ref = re.search(r'"([a-z_]+)"\."', line)
                if ref is None or ref.group(1) in APP_SCHEMAS:
                    out.write(line)
            else:
                if line.rstrip("\n") == "\\.":
                    if keep:
                        out.write(line)
                    in_copy = None
                    continue
                counts[in_copy] += 1
                if keep:
                    out.write(line)
    with open(counts_path, "w", encoding="utf-8") as f:
        for t in sorted(counts):
            f.write(f"{t}\t{counts[t]}\n")
    total = sum(counts.values())
    print(f"Backup holds {len(counts)} tables with data rows, {total} rows in all.")
    for schema in sorted({t.split('.')[0] for t in counts}):
        n = sum(v for t, v in counts.items() if t.startswith(schema + "."))
        print(f"  {schema}: {n} rows")


def read(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if "\t" in line:
                t, n = line.rstrip("\n").split("\t")
                out[t] = int(n)
    return out


def compare(expected_path, actual_path, label):
    exp, act = read(expected_path), read(actual_path)
    bad = [t for t in exp if act.get(t) != exp[t]]
    for t in bad:
        print(f"  MISMATCH {t}: expected {exp[t]}, found {act.get(t)}")
    if bad:
        print(f"{label}: {len(bad)} of {len(exp)} tables differ.")
        sys.exit(1)
    print(f"{label}: all {len(exp)} tables match ({sum(exp.values())} rows).")


def countsql(counts_path, which):
    tables = [t for t in read(counts_path) if which == "all" or t.split(".")[0] in APP_SCHEMAS]
    parts = []
    for t in tables:
        schema, name = t.split(".", 1)
        parts.append(f"select '{t}' || chr(9) || count(*) from \"{schema}\".\"{name}\"")
    print(" union all ".join(parts) + ";")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "split" and len(sys.argv) == 5:
        split(*sys.argv[2:])
    elif cmd == "countsql" and len(sys.argv) == 4:
        countsql(*sys.argv[2:])
    elif cmd == "compare" and len(sys.argv) == 5:
        compare(*sys.argv[2:])
    else:
        print(__doc__)
        sys.exit(2)
