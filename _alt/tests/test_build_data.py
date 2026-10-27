"""Tests for tools/build_data.py on tiny synthetic OBO files (stdlib only):  python3 tests/test_build_data.py"""
import contextlib, io, json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import build_data as bd

HEADER = 'format-version: 1.2\ndata-version: releases/2030-01-02\n\n'
def term(i, name, ns, parents=(), rels=(), obsolete=False, d='A definition.'):
    s = f'[Term]\nid: GO:{i:07d}\nname: {name}\nnamespace: {ns}\ndef: "{d}" [GOC:x]\n'
    s += ''.join(f'is_a: GO:{p:07d} ! x\n' for p in parents)
    s += ''.join(f'relationship: {r} GO:{p:07d} ! x\n' for r, p in rels)
    if obsolete: s += 'is_obsolete: true\n'
    return s + '\n'
GOOD = HEADER + term(1, 'bp root', 'biological_process') + term(2, 'bp child', 'biological_process', [1], [('part_of', 1)]) \
     + term(3, 'bp reg', 'biological_process', [2], [('regulates', 1)]) + term(4, 'mf root', 'molecular_function') \
     + term(5, 'cc root', 'cellular_component') + term(6, 'gone', 'biological_process', obsolete=True)
ORG = [('xx', 'Xeno', 'Xenopus x', 1, 'org.Xx.eg.db', '1.0')]

class T(unittest.TestCase):
    def run_build(self, obo, ic_csv='"term_id","ic"\n"GO:0000001",0.01\n"GO:0000002",2.5\n'):
        d = tempfile.mkdtemp()
        open(f'{d}/t.obo', 'w').write(obo); open(f'{d}/xx_IC.csv', 'w').write(ic_csv)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            res = bd.build(f'{d}/t.obo', d, f'{d}/out', organisms=ORG, log=lambda s='': print(s))
        return d, res, out.getvalue()

    def test_good_build(self):
        d, (manifest, warns), text = self.run_build(GOOD)
        g = json.load(open(f'{d}/out/go-dag.json'))
        self.assertEqual(set(g), {f'GO:000000{i}' for i in range(1, 6)})                     # obsolete term dropped
        self.assertEqual(g['GO:0000002']['p'], [['GO:0000001', 0.8], ['GO:0000001', 0.6]])   # is_a 0.8, part_of 0.6
        self.assertEqual(g['GO:0000003']['p'], [['GO:0000002', 0.8], ['GO:0000001', 0.7]])   # other relation 0.7
        self.assertEqual(manifest['go_release'], '2030-01-02')
        self.assertEqual(manifest['counts'], {'terms': 5, 'BP': 3, 'MF': 1, 'CC': 1, 'edges': 4, 'definitions': 5})
        self.assertEqual(json.load(open(f'{d}/out/ic/xx.json')), {'GO:0000001': 0.01, 'GO:0000002': 2.5})
        self.assertIn('3 graph term(s) have no IC', ' '.join(warns))
        raw = open(f'{d}/out/go-dag.json').read(); self.assertTrue(', ' not in raw and ': ' not in raw and '\n' not in raw)   # compact JSON

    def test_ic_terms_not_in_graph_are_dropped_with_warning(self):
        d, (m, warns), _ = self.run_build(GOOD, '"term_id","ic"\n"GO:0000001",0.01\n"GO:0000006",9\n"GO:0999999",9\n')
        self.assertEqual(list(json.load(open(f'{d}/out/ic/xx.json'))), ['GO:0000001'])
        self.assertTrue(any('2 IC term(s) are not in the graph' in w for w in warns))
        self.assertEqual(m['organisms'][0]['ic_terms'], 1)

    def test_cycle_fails(self):
        obo = HEADER + term(1, 'a', 'biological_process', [3]) + term(2, 'b', 'biological_process', [1]) + term(3, 'c', 'biological_process', [2]) \
            + term(4, 'mf', 'molecular_function') + term(5, 'cc', 'cellular_component')
        with self.assertRaisesRegex(bd.BuildError, 'cycle'): self.run_build(obo)

    def test_empty_ontology_fails(self):
        obo = HEADER + term(1, 'a', 'biological_process') + term(4, 'mf', 'molecular_function')    # no CC
        with self.assertRaisesRegex(bd.BuildError, 'CC is empty'): self.run_build(obo)

    def test_definition_for_term_not_in_graph_fails(self):
        d = bd.validate_graph  # the check itself, with a definition that has no graph term
        terms, defs, _ = bd.parse_obo(self._write(GOOD))
        defs['GO:0000099'] = {'d': 'orphan'}
        with self.assertRaisesRegex(bd.BuildError, 'not in the graph'): d(terms, defs)

    def test_missing_ic_file_fails(self):
        d = tempfile.mkdtemp(); open(f'{d}/t.obo', 'w').write(GOOD)
        with self.assertRaisesRegex(bd.BuildError, 'does not exist'):
            bd.build(f'{d}/t.obo', d, f'{d}/out', organisms=ORG, log=lambda s='': None)

    def test_last_term_without_trailing_blank_line_is_kept(self):
        terms, _, _ = bd.parse_obo(self._write(GOOD.rstrip('\n') ))
        self.assertIn('GO:0000005', terms)

    def _write(self, text):
        p = os.path.join(tempfile.mkdtemp(), 'x.obo'); open(p, 'w').write(text); return p

if __name__ == '__main__':
    unittest.main(verbosity=2)
