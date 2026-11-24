"""Reader for the verbatim production migration-history archive (shared by test_gate.py and test-repair-guard.sh)."""
import os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARCHIVE = os.path.join(ROOT, 'supabase/history/production-migration-history-2026-11-20.sql')

def pg_text_array(stmts):
    # PostgreSQL's text form of a text[] whose elements all contain whitespace: every element double-quoted, with
    # backslash and double quote escaped by a backslash.
    return '{' + ','.join('"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"' for s in stmts) + '}'

def read_archive(path):
    """[(version, name, [statements])] from the verbatim archive markers."""
    rows, cur, stmt = [], None, None
    for line in open(path, encoding='utf-8').read().split('\n'):
        m = re.match(r'^-- @migration version=(\d+) name=(\S+) statements=(\d+)$', line)
        if m:
            cur = (m.group(1), m.group(2), []); rows.append(cur); continue
        if re.match(r'^-- @statement \d+ begin$', line):
            stmt = []; continue
        if re.match(r'^-- @statement \d+ end$', line):
            cur[2].append('\n'.join(stmt)); stmt = None; continue
        if stmt is not None:
            stmt.append(line)
    return rows

