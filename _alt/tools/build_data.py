#!/usr/bin/env python3
"""
build_data.py - generate the static GO data files that ORA-cle fetches at run time.

    python tools/build_data.py --obo go-basic.obo --ic-dir <folder with <id>_IC.csv files> --out data

Writes (compact JSON, keys sorted so rebuilds are byte-identical and diff well in git):

    data/manifest.json   GO release, organism list, file names, counts
    data/go-dag.json     shared by all organisms: {"GO:...": {"n": name, "ns": "BP|MF|CC", "p": [[parentId, weight], ...]}}
    data/go-defs.json    shared by all organisms: {"GO:...": {"d": definition, "s": sources?, "c": comment?}}
    data/ic/<id>.json    one per organism:        {"GO:...": ic}

The graph AND the definitions both come from go-basic.obo only (the full go.obo contains a cycle and extra
relation types). Parsing follows build_go_dag.py; the HTML-embedding part of that script is gone.

To add an organism: put <id>_IC.csv (columns term_id,ic) in the IC folder, add ONE row to ORGANISMS below,
rerun. The app reads the organism list from manifest.json, so nothing else changes.
"""
import argparse, csv, json, os, re, sys

# ── Constants (edit here) ─────────────────────────────────────────────────────
WEIGHT_IS_A = 0.8
WEIGHT_PART_OF = 0.6
WEIGHT_OTHER = 0.7            # regulates, positively_regulates, negatively_regulates, ...

NS_MAP = {'biological_process': 'BP', 'molecular_function': 'MF', 'cellular_component': 'CC'}
ONTOLOGIES = ('BP', 'MF', 'CC')

# One row per organism. id = file prefix of <id>_IC.csv. Order here = order in the dropdown.
ORGANISMS = [
    # id,  label,        species,                    taxon, orgdb package,  orgdb version
    ('mm', 'Mouse',      'Mus musculus',              10090, 'org.Mm.eg.db', '3.23.0'),
    ('hs', 'Human',      'Homo sapiens',               9606, 'org.Hs.eg.db', '3.23.1'),
    ('rn', 'Rat',        'Rattus norvegicus',         10116, 'org.Rn.eg.db', '3.23.0'),
    ('ce', 'C. elegans', 'Caenorhabditis elegans',     6239, 'org.Ce.eg.db', '3.22.0'),
    ('dm', 'Fruit fly',  'Drosophila melanogaster',    7227, 'org.Dm.eg.db', '3.22.0'),
]

# Names of the generated files
F_MANIFEST, F_GRAPH, F_DEFS, D_IC = 'manifest.json', 'go-dag.json', 'go-defs.json', 'ic'


class BuildError(Exception):
    """A condition that must stop the build."""


# ── OBO parsing (same rules as build_go_dag.py) ───────────────────────────────
_DEF_RE = re.compile(r'^def:\s+"((?:[^"\\]|\\.)*)"\s*\[([^\]]*)\]')
_ISA_RE = re.compile(r'is_a:\s+(GO:\d+)')
_REL_RE = re.compile(r'relationship:\s+(\S+)\s+(GO:\d+)')


def parse_obo(path):
    """Return (terms, defs, data_version).

    terms: {id: {'n', 'ns', 'p': [[parent, weight], ...]}}  live (non-obsolete) BP/MF/CC terms only
    defs:  {id: {'d', 's'?, 'c'?}}                          live terms that have a definition
    A stanza is committed when the next stanza starts or the file ends (build_go_dag.py lost a last
    [Term] that was not followed by a blank line; go-basic.obo never ends that way, so counts are the same).
    """
    terms, defs, version = {}, {}, None
    cur = None

    def commit():
        nonlocal cur
        if cur and cur['id'] and not cur['obsolete']:
            if cur['ns'] in ONTOLOGIES:
                terms[cur['id']] = {'n': cur['name'], 'ns': cur['ns'], 'p': cur['parents']}
            if cur['d']:
                e = {'d': cur['d']}
                if cur['s']: e['s'] = cur['s']
                if cur['c']: e['c'] = cur['c']
                defs[cur['id']] = e
        cur = None

    with open(path, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if line.startswith('data-version:') and version is None and cur is None:
                version = line.split(':', 1)[1].strip()
            if line.startswith('['):
                commit()
                if line == '[Term]':
                    cur = {'id': None, 'name': '', 'ns': None, 'parents': [], 'obsolete': False, 'd': None, 's': None, 'c': None}
                continue
            if cur is None:
                continue
            if line.startswith('id: '): cur['id'] = line[4:].strip()
            elif line.startswith('name: '): cur['name'] = line[6:].strip()
            elif line.startswith('namespace: '): cur['ns'] = NS_MAP.get(line[11:].strip())
            elif line.startswith('is_obsolete: true'): cur['obsolete'] = True
            elif line.startswith('is_a: '):
                m = _ISA_RE.match(line)
                if m: cur['parents'].append([m.group(1), WEIGHT_IS_A])
            elif line.startswith('relationship: '):
                m = _REL_RE.match(line)
                if m:
                    cur['parents'].append([m.group(2), WEIGHT_PART_OF if m.group(1) == 'part_of' else WEIGHT_OTHER])
            elif line.startswith('def: '):
                m = _DEF_RE.match(line)
                if m:
                    text = m.group(1).replace('\\"', '"').replace('\\n', ' ').replace('\\\\', '\\').strip()
                    cur['d'] = text
                    srcs = [s.strip() for s in m.group(2).split(',') if s.strip()]
                    if srcs: cur['s'] = ', '.join(srcs)
            elif line.startswith('comment: '):
                c = line[9:].strip()
                if c and c.lower() != 'none': cur['c'] = c
    commit()
    return terms, defs, version


# ── Checks ────────────────────────────────────────────────────────────────────
def find_cycle(terms):
    """Return a list of term ids forming a cycle in the parent graph, or None. Iterative DFS."""
    WHITE, GREY, BLACK = 0, 1, 2
    color = {t: WHITE for t in terms}
    for root in terms:
        if color[root] != WHITE:
            continue
        color[root] = GREY
        path = [root]
        stack = [iter([p for p, _ in terms[root]['p'] if p in terms])]
        while stack:
            nxt = next(stack[-1], None)
            if nxt is None:
                color[path.pop()] = BLACK
                stack.pop()
            elif color[nxt] == GREY:
                return path[path.index(nxt):] + [nxt]
            elif color[nxt] == WHITE:
                color[nxt] = GREY
                path.append(nxt)
                stack.append(iter([p for p, _ in terms[nxt]['p'] if p in terms]))
    return None


def read_ic_csv(path):
    ic = {}
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            ic[row['term_id'].strip()] = float(row['ic'])
    return ic


def validate_graph(terms, defs):
    for ns in ONTOLOGIES:
        if not any(t['ns'] == ns for t in terms.values()):
            raise BuildError(f'ontology {ns} is empty in the graph')
    cyc = find_cycle(terms)
    if cyc:
        raise BuildError('the graph has a cycle: ' + ' -> '.join(cyc))
    orphan_defs = sorted(set(defs) - set(terms))
    if orphan_defs:
        raise BuildError(f'{len(orphan_defs)} definition(s) belong to terms that are not in the graph, e.g. {orphan_defs[:5]}')


# ── Output ────────────────────────────────────────────────────────────────────
def dump(obj, path):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False, sort_keys=True)
    return os.path.getsize(path)


def build(obo, ic_dir, out, go_release=None, organisms=ORGANISMS, log=print):
    terms, defs, version = parse_obo(obo)
    validate_graph(terms, defs)
    release = go_release or (version.split('/')[-1] if version else None)
    if not release:
        raise BuildError('no data-version in the OBO header; pass --go-release')

    counts = {ns: sum(1 for t in terms.values() if t['ns'] == ns) for ns in ONTOLOGIES}
    edges = sum(len(t['p']) for t in terms.values())
    dangling = sum(1 for t in terms.values() for p, _ in t['p'] if p not in terms)
    warnings = []
    if dangling:
        warnings.append(f'{dangling} edge(s) point to a parent that is not a live BP/MF/CC term (kept as in the OBO)')

    sizes = {F_GRAPH: dump(terms, os.path.join(out, F_GRAPH)), F_DEFS: dump(defs, os.path.join(out, F_DEFS))}

    org_rows, ic_summary = [], []
    known = set()
    for oid, label, species, taxon, orgdb, orgdb_ver in organisms:
        known.add(oid)
        p = os.path.join(ic_dir, f'{oid}_IC.csv')
        if not os.path.isfile(p):
            raise BuildError(f'organism "{oid}" is in ORGANISMS but {p} does not exist')
        ic = read_ic_csv(p)
        kept = {t: v for t, v in ic.items() if t in terms}
        dropped = len(ic) - len(kept)
        no_ic = sum(1 for t in terms if t not in kept)
        if dropped: warnings.append(f'{oid}: {dropped} IC term(s) are not in the graph (dropped)')
        if no_ic:   warnings.append(f'{oid}: {no_ic} graph term(s) have no IC')
        rel = f'{D_IC}/{oid}.json'
        sizes[rel] = dump(kept, os.path.join(out, rel))
        org_rows.append({'id': oid, 'label': label, 'species': species, 'taxon': taxon, 'orgdb': orgdb,
                         'orgdb_version': orgdb_ver, 'ic_file': rel, 'ic_terms': len(kept)})
        ic_summary.append((oid, len(ic), len(kept), dropped, no_ic))
    if os.path.isdir(ic_dir):
        for fn in sorted(os.listdir(ic_dir)):
            m = re.fullmatch(r'(\w+)_IC\.csv', fn)
            if m and m.group(1) not in known:
                warnings.append(f'{fn} is in the IC folder but not in ORGANISMS (ignored)')

    manifest = {
        'go_release': release,
        'files': {'graph': F_GRAPH, 'definitions': F_DEFS},
        'counts': {'terms': len(terms), 'BP': counts['BP'], 'MF': counts['MF'], 'CC': counts['CC'],
                   'edges': edges, 'definitions': len(defs)},
        'organisms': org_rows,
    }
    sizes[F_MANIFEST] = dump(manifest, os.path.join(out, F_MANIFEST))

    log(f'GO release {release}  (OBO data-version: {version})')
    log('')
    log(f'{"ontology":<10}{"terms":>8}')
    for ns in ONTOLOGIES: log(f'{ns:<10}{counts[ns]:>8}')
    log(f'{"total":<10}{len(terms):>8}   edges: {edges}   definitions: {len(defs)}')
    log('')
    log(f'{"organism":<10}{"IC in csv":>10}{"kept":>8}{"dropped":>9}{"graph terms w/o IC":>20}')
    for oid, n_csv, kept, dropped, no_ic in ic_summary:
        log(f'{oid:<10}{n_csv:>10}{kept:>8}{dropped:>9}{no_ic:>20}')
    log('')
    log('files written:')
    for name, size in sizes.items(): log(f'  {os.path.join(out, name):<32}{size:>12,} bytes')
    if warnings:
        log('')
        for w in warnings: log('WARNING: ' + w)
    return manifest, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description='Build the GO data files for ORA-cle.')
    ap.add_argument('--obo', required=True, help='go-basic.obo (graph and definitions)')
    ap.add_argument('--ic-dir', required=True, help='folder containing <id>_IC.csv (columns term_id,ic)')
    ap.add_argument('--out', default='data', help='output folder (default: data)')
    ap.add_argument('--go-release', default=None, help='override the release shown in the app (default: OBO data-version)')
    a = ap.parse_args(argv)
    try:
        build(a.obo, a.ic_dir, a.out, a.go_release)
    except BuildError as e:
        print('BUILD FAILED: ' + str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
