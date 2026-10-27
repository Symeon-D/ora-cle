# ORA-cle split: report

## 1. Environment
Chat sandbox (Linux, Node 22, Python 3.12, git present but no repository, **no browser**). Everything below that says
"jsdom" ran in jsdom, which is a DOM simulator with no layout engine; **no real browser test was run**.

## 2. Mismatches between the brief and the files (please read)
| Brief says | Files show |
|---|---|
| GO release 2026-01-23; `go-basic.obo` equals `go_graph.csv` (38,739 terms, 73,004 edges, BP 24,547 / MF 10,123 / CC 4,069) | The supplied `go-basic.obo` is **release 2026-07-26** (`data-version`). It gives **38,092 terms, 71,496 edges** (BP 23,974 / MF 10,041 / CC 4,077). Versus `go_graph.csv`: 732 terms only in the CSV (all obsolete in this OBO), 85 only in the OBO, 1,500 shared terms with different parents/names. So `go_graph.csv`, the IC files and the old definitions look like an older release than this OBO. |
| IC terms: mm 21,473 / hs 20,631 / rn 21,365 all in graph; ce 53 and dm 57 to drop | Against this OBO the build drops **mm 199, hs 190, rn 198, ce 171, dm 178** IC terms. Against `go_graph.csv` the brief's numbers hold exactly (ce 53, dm 57, others 0). |
| New graph gives 10 clusters at 0.7 | With the supplied OBO: **10 clusters at 0.7** (48 of the 49 terms; `GO:0016054 organic acid catabolic process` is obsolete in this release, replaced by `GO:0008152`, and goes to Ungrouped, as the app does for terms not in the graph). With `go_graph.csv`: 10 as well (49 terms). |
| "Definitions and comments identical to go-basic's for this release" | Old embedded definitions: 38,739 entries; this OBO: 38,092; texts identical for 37,536 of 38,007 common terms. |
| Embedded graph "has no IC data; `dag.ic` is empty" | The old blob **has** an `ic` field with 21,686 entries. It is not `mm_IC.csv` (21,221 terms in common, max difference 5.39). The old IC methods therefore did run, with different numbers than the new IC files give. |
| `#data=<base64 csv>` hash | The code also supports `#gist=<id>` (fetches a GitHub gist). Kept as is. |
| `index.html` 4,645 lines | 4,642 lines (3,634,996 bytes). |
| Section banners at given lines | Banners exist but use a different style; sections were located by function name. |
| Wang check (e): both graphs agree to 1e-9 | **Not met**, because the two graphs are different releases (max difference 0.51 on the 49-term matrix). Not a code problem. |

**Decision taken:** you said "use `go-basic.obo` only", so `data/` is built from the supplied OBO and the manifest says
`go_release: 2026-07-26` (read from the OBO header; `--go-release` overrides it). I did not write 2026-01-23, because
that is not what this OBO is. If you meant a different OBO, give it to me (or run the build yourself) and the
numbers in the brief should appear.

## 3. What moved where
Declarations were moved **verbatim** by a script (acorn + eslint-scope); the only text edits are (a) the 11 shared
variables that the old code reassigned (`panels`, `panelCounter`, `activePanelId`, `clusterMode`, `clusterCounter`,
`dragSrcTerm`, `dragHoverPill`, `assignMenuOpen`, `accordionMode`, `_stickyInfo`, `_stickyTermInfo`) now live on the
`state` object in `js/state.js` (`panels` -> `state.panels`), because an imported binding cannot be reassigned; and
(b) the data-loading patches listed in section 5.

| New file | Contents (old names) |
|---|---|
| `state.js` | state object, `controls`, `PANEL_COLORS`, `CLUSTER_PALETTE`, `openTermKeys`, `activePanel`, `defaultFilters`, `defaultAppearance` |
| `utils.js` | `v`, `numVal`, `colorVal`, `snapToNearest`, `syncNum`, `syncRange` |
| `io/parse.js` | `parseLine`, `detectFormat`, `normaliseRow` (dispatcher), `parseFileText` |
| `io/formats/{native,gprofiler,genecodis}.js` | the three branches of `normaliseRow`, unchanged |
| `io/hash.js` | body of the `DOMContentLoaded` handler -> `loadFromHash()` |
| `io/upload.js` | `loadFileIntoPanel`, `sidebarUploadClick`, `addSubplotFromSidebar`, `processFile`, `setupDrop`, drop-zone wiring (`initDropZones`) |
| `io/examples.js` | `showFormatError`, `showExamplesFromToast`, `toggleFormatExamples`, `loadExampleData` |
| `panels.js` | `addPanel`, `deleteActivePanel`, `confirmDeletePanel`, `dismissDeleteConfirm`, `moveActivePanel`, `removePanel`, `setActivePanelId`, `updateDropZones` |
| `pipeline.js` | `getPanelData` |
| `plot/render.js` | `renderAll`, `render` (whole, see section 7) |
| `plot/title-edit.js`, `plot/gene-matrix.js`, `plot/sticky.js` | `startTitleEdit`; accordion functions; the four sticky-header functions + scroll wiring |
| `clustering/manual.js` | `applyRrvgoClusters`, `getPanelClusters`, `userClusters`, `setUserClusters`, `getTermCluster`, `reconcileUngrouped`, `syncClusterDefs` (no DOM) |
| `clustering/manual-ui.js` | cluster bar, assign menu, drag and drop (`renderClusterBar`, `attachClusterDrag`, ...) |
| `clustering/semantic/` | `wang.js`, `ic.js` (`getMICA`, `icSimilarity`), `linkage.js`, `matrix.js` (`computeSimilarityMatrix`), `run.js` (`runWangClustering`, method descriptions) |
| `go/data.js` | **new**: fetch manifest, graph, definitions, per-organism IC (replaces `loadGoDag`/`loadGoDefs` and the base64 blobs) |
| `go/tooltip.js` | `showInfoTooltip`, `positionInfoTooltip` |
| `ui/` | `sidebar.js`, `header.js`, `export.js` (PNG, CSV), `info-tip.js`, `organism.js` (**new**), `actions.js` (**new**) |

Differences from the suggested layout: no `semantic/dag.js` (the old code has no separate graph logic; loading is in
`go/data.js`); `manual-ui.js` and `matrix.js` were added; the blobs and `DecompressionStream` code are deleted (nothing else used them).
The old `build_go_dag.py` is superseded by `tools/build_data.py` and is not included.
Nothing is attached to `window`. Globals still used: `d3` (CDN) and browser APIs.

## 4. Inline handlers -> data attributes (all 80)
Attribute scheme: `data-on-<click|input|change|blur>="action"`, arguments in `data-*`. One listener function is
registered on the document for `click`, `input`, `change` and `focusout` (blur does not bubble; focusout does).
Like inline handlers, an event runs the element's action and then its ancestors' unless an action stops
propagation (`toggle-format-examples` does, so the upload zone behind it is not triggered, as before).
Slider/number pairs use two generic actions: `slider-input` (`syncNum` then `data-then`) and `number-commit` (`syncRange` then `data-then`;
`data-then` = `filter:<which>` | `appearance` | `render` | absent). One handler was **added**: the organism dropdown (`organism-change`).

| # | line in old file | element | old handler | new attributes |
|---|---|---|---|---|
| 1 | 851 | `button#sidebar-toggle-btn` | `onclick="toggleSidebar()"` | `data-on-click="toggle-sidebar"` |
| 2 | 867 | `button#pib-edit` | `onclick="toggleEditMode()"` | `data-on-click="toggle-edit-mode"` |
| 3 | 870 | `button#pib-cluster` | `onclick="toggleClusterMode()"` | `data-on-click="toggle-cluster-mode"` |
| 4 | 873 | `button#pib-genes` | `onclick="toggleAccordionMode()"` | `data-on-click="toggle-gene-matrix"` |
| 5 | 877 | `button#pib-up` | `onclick="moveActivePanel(-1)"` | `data-on-click="move-panel"` `dir=-1` |
| 6 | 880 | `button#pib-down` | `onclick="moveActivePanel(1)"` | `data-on-click="move-panel"` `dir=1` |
| 7 | 883 | `button#pib-reset` | `onclick="contextReset()"` | `data-on-click="context-reset"` |
| 8 | 887 | `button#pib-delete` | `onclick="deleteActivePanel()"` | `data-on-click="delete-panel"` |
| 9 | 899 | `div#sideDropZone` | `onclick="sidebarUploadClick()"` | `data-on-click="upload-click"` |
| 10 | 918 | `div#lolipopToggle` | `onclick="toggleCtrl('lolipopToggle','lolipop')"` | `data-on-click="toggle-ctrl"` `toggle=lolipopToggle key=lolipop` |
| 11 | 922 | `select#sizeMode` | `onchange="applyPanelAppearance()"` | `data-on-change="appearance-change"` |
| 12 | 938 | `input#topN` | `oninput="syncNum('topN','topNNum');applyPanelFilter('topN')"` | `data-on-input="slider-input"` `range=topN num=topNNum then=filter:topN` |
| 13 | 939 | `input#topNNum` | `onchange="syncRange('topNNum','topN');applyPanelFilter('topN')"` | `data-on-change="number-commit"` `num=topNNum range=topN then=filter:topN` |
| 14 | 939 | `input#topNNum` | `onblur="syncRange('topNNum','topN');applyPanelFilter('topN')"` | `data-on-blur="number-commit"` `num=topNNum range=topN then=filter:topN` |
| 15 | 945 | `input#minInter` | `oninput="syncNum('minInter','minInterNum');applyPanelFilter('minInter')"` | `data-on-input="slider-input"` `range=minInter num=minInterNum then=filter:minInter` |
| 16 | 946 | `input#minInterNum` | `onchange="syncRange('minInterNum','minInter');applyPanelFilter('minInter')"` | `data-on-change="number-commit"` `num=minInterNum range=minInter then=filter:minInter` |
| 17 | 946 | `input#minInterNum` | `onblur="syncRange('minInterNum','minInter');applyPanelFilter('minInter')"` | `data-on-blur="number-commit"` `num=minInterNum range=minInter then=filter:minInter` |
| 18 | 952 | `input#minTerm` | `oninput="syncNum('minTerm','minTermNum');applyPanelFilter('minTerm')"` | `data-on-input="slider-input"` `range=minTerm num=minTermNum then=filter:minTerm` |
| 19 | 953 | `input#minTermNum` | `onchange="syncRange('minTermNum','minTerm');applyPanelFilter('minTerm')"` | `data-on-change="number-commit"` `num=minTermNum range=minTerm then=filter:minTerm` |
| 20 | 953 | `input#minTermNum` | `onblur="syncRange('minTermNum','minTerm');applyPanelFilter('minTerm')"` | `data-on-blur="number-commit"` `num=minTermNum range=minTerm then=filter:minTerm` |
| 21 | 959 | `input#maxTerm` | `oninput="syncNum('maxTerm','maxTermNum');applyPanelFilter('maxTerm')"` | `data-on-input="slider-input"` `range=maxTerm num=maxTermNum then=filter:maxTerm` |
| 22 | 960 | `input#maxTermNum` | `onchange="syncRange('maxTermNum','maxTerm');applyPanelFilter('maxTerm')"` | `data-on-change="number-commit"` `num=maxTermNum range=maxTerm then=filter:maxTerm` |
| 23 | 960 | `input#maxTermNum` | `onblur="syncRange('maxTermNum','maxTerm');applyPanelFilter('maxTerm')"` | `data-on-blur="number-commit"` `num=maxTermNum range=maxTerm then=filter:maxTerm` |
| 24 | 966 | `input#minLog2FE` | `oninput="syncNum('minLog2FE','minLog2FENum');applyPanelFilter('minLog2FE')"` | `data-on-input="slider-input"` `range=minLog2FE num=minLog2FENum then=filter:minLog2FE` |
| 25 | 967 | `input#minLog2FENum` | `onchange="syncRange('minLog2FENum','minLog2FE');applyPanelFilter('minLog2FE')"` | `data-on-change="number-commit"` `num=minLog2FENum range=minLog2FE then=filter:minLog2FE` |
| 26 | 967 | `input#minLog2FENum` | `onblur="syncRange('minLog2FENum','minLog2FE');applyPanelFilter('minLog2FE')"` | `data-on-blur="number-commit"` `num=minLog2FENum range=minLog2FE then=filter:minLog2FE` |
| 27 | 970 | `button#resetBtn` | `onclick="contextReset()"` | `data-on-click="context-reset"` |
| 28 | 995 | `select#clusterMethod` | `onchange="updateMethodDescription()"` | `data-on-change="method-change"` |
| 29 | 1009 | `input#wangThreshold` | `oninput="syncNum('wangThreshold','wangThresholdNum')"` | `data-on-input="slider-input"` `range=wangThreshold num=wangThresholdNum` |
| 30 | 1010 | `input#wangThresholdNum` | `onchange="syncRange('wangThresholdNum','wangThreshold')"` | `data-on-change="number-commit"` `num=wangThresholdNum range=wangThreshold` |
| 31 | 1010 | `input#wangThresholdNum` | `onblur="syncRange('wangThresholdNum','wangThreshold')"` | `data-on-blur="number-commit"` `num=wangThresholdNum range=wangThreshold` |
| 32 | 1016 | `button#wangClusterBtn` | `onclick="runWangClustering()"` | `data-on-click="run-clustering"` |
| 33 | 1026 | `button#clusterModeBtn` | `onclick="toggleClusterMode()"` | `data-on-click="toggle-cluster-mode"` |
| 34 | 1027 | `button#filterClustersBtn` | `onclick="filterTopPerCluster()"` | `data-on-click="filter-top-per-cluster"` |
| 35 | 1028 | `button#geneMatrixBtn` | `onclick="toggleAccordionMode()"` | `data-on-click="toggle-gene-matrix"` |
| 36 | 1029 | `button#editModeBtn` | `onclick="toggleEditMode()"` | `data-on-click="toggle-edit-mode"` |
| 37 | 1040 | `input#fontSize` | `oninput="syncNum('fontSize','fontSizeNum');applyPanelAppearance()"` | `data-on-input="slider-input"` `range=fontSize num=fontSizeNum then=appearance` |
| 38 | 1041 | `input#fontSizeNum` | `onchange="syncRange('fontSizeNum','fontSize');applyPanelAppearance()"` | `data-on-change="number-commit"` `num=fontSizeNum range=fontSize then=appearance` |
| 39 | 1041 | `input#fontSizeNum` | `onblur="syncRange('fontSizeNum','fontSize');applyPanelAppearance()"` | `data-on-blur="number-commit"` `num=fontSizeNum range=fontSize then=appearance` |
| 40 | 1047 | `input#titleSize` | `oninput="syncNum('titleSize','titleSizeNum');applyPanelAppearance()"` | `data-on-input="slider-input"` `range=titleSize num=titleSizeNum then=appearance` |
| 41 | 1048 | `input#titleSizeNum` | `onchange="syncRange('titleSizeNum','titleSize');applyPanelAppearance()"` | `data-on-change="number-commit"` `num=titleSizeNum range=titleSize then=appearance` |
| 42 | 1048 | `input#titleSizeNum` | `onblur="syncRange('titleSizeNum','titleSize');applyPanelAppearance()"` | `data-on-blur="number-commit"` `num=titleSizeNum range=titleSize then=appearance` |
| 43 | 1054 | `input#legendScale` | `oninput="syncNum('legendScale','legendScaleNum');renderAll()"` | `data-on-input="slider-input"` `range=legendScale num=legendScaleNum then=render` |
| 44 | 1055 | `input#legendScaleNum` | `onchange="syncRange('legendScaleNum','legendScale');renderAll()"` | `data-on-change="number-commit"` `num=legendScaleNum range=legendScale then=render` |
| 45 | 1055 | `input#legendScaleNum` | `onblur="syncRange('legendScaleNum','legendScale');renderAll()"` | `data-on-blur="number-commit"` `num=legendScaleNum range=legendScale then=render` |
| 46 | 1061 | `input#plotScale` | `oninput="syncNum('plotScale','plotScaleNum');renderAll()"` | `data-on-input="slider-input"` `range=plotScale num=plotScaleNum then=render` |
| 47 | 1062 | `input#plotScaleNum` | `onchange="syncRange('plotScaleNum','plotScale');renderAll()"` | `data-on-change="number-commit"` `num=plotScaleNum range=plotScale then=render` |
| 48 | 1062 | `input#plotScaleNum` | `onblur="syncRange('plotScaleNum','plotScale');renderAll()"` | `data-on-blur="number-commit"` `num=plotScaleNum range=plotScale then=render` |
| 49 | 1068 | `input#dotScale` | `oninput="syncNum('dotScale','dotScaleNum');applyPanelAppearance()"` | `data-on-input="slider-input"` `range=dotScale num=dotScaleNum then=appearance` |
| 50 | 1069 | `input#dotScaleNum` | `onchange="syncRange('dotScaleNum','dotScale');applyPanelAppearance()"` | `data-on-change="number-commit"` `num=dotScaleNum range=dotScale then=appearance` |
| 51 | 1069 | `input#dotScaleNum` | `onblur="syncRange('dotScaleNum','dotScale');applyPanelAppearance()"` | `data-on-blur="number-commit"` `num=dotScaleNum range=dotScale then=appearance` |
| 52 | 1075 | `input#lineWidth` | `oninput="syncNum('lineWidth','lineWidthNum');applyPanelAppearance()"` | `data-on-input="slider-input"` `range=lineWidth num=lineWidthNum then=appearance` |
| 53 | 1076 | `input#lineWidthNum` | `onchange="syncRange('lineWidthNum','lineWidth');applyPanelAppearance()"` | `data-on-change="number-commit"` `num=lineWidthNum range=lineWidth then=appearance` |
| 54 | 1076 | `input#lineWidthNum` | `onblur="syncRange('lineWidthNum','lineWidth');applyPanelAppearance()"` | `data-on-blur="number-commit"` `num=lineWidthNum range=lineWidth then=appearance` |
| 55 | 1080 | `input#colorLow` | `oninput="applyPanelAppearance()"` | `data-on-input="appearance-change"` |
| 56 | 1081 | `input#colorHigh` | `oninput="applyPanelAppearance()"` | `data-on-input="appearance-change"` |
| 57 | 1083 | `button.btn` | `onclick="resetAppearance()"` | `data-on-click="reset-appearance"` |
| 58 | 1092 | `button#addSubplotBtn` | `onclick="addSubplotFromSidebar()"` | `data-on-click="add-subplot"` |
| 59 | 1094 | `button#moveUpBtn` | `onclick="moveActivePanel(-1)"` | `data-on-click="move-panel"` `dir=-1` |
| 60 | 1095 | `button#moveDownBtn` | `onclick="moveActivePanel(1)"` | `data-on-click="move-panel"` `dir=1` |
| 61 | 1097 | `button.btn` | `onclick="downloadPNG()"` | `data-on-click="download-png"` |
| 62 | 1098 | `button.btn` | `onclick="downloadCSV()"` | `data-on-click="download-csv"` |
| 63 | 1099 | `button#deletePanelBtn` | `onclick="deleteActivePanel()"` | `data-on-click="delete-panel"` |
| 64 | 1110 | `div#sidebar-edge-tab` | `onclick="toggleSidebar()"` | `data-on-click="toggle-sidebar"` |
| 65 | 1117 | `div#drop-hit-area` | `onclick="document.getElementById('fileInput').click()"` | `data-on-click="open-file-input"` |
| 66 | 1124 | `button#show-examples-btn` | `onclick="toggleFormatExamples(event)"` | `data-on-click="toggle-format-examples"` |
| 67 | 1137 | `button.fmt-load-btn` | `onclick="loadExampleData('gprofiler')"` | `data-on-click="load-example"` `example=gprofiler` |
| 68 | 1160 | `button.fmt-load-btn` | `onclick="loadExampleData('genecodis')"` | `data-on-click="load-example"` `example=genecodis` |
| 69 | 1181 | `button.toast-close` | `onclick="v('format-error-toast').classList.remove('show')"` | `data-on-click="dismiss-format-toast"` |
| 70 | 1187 | `span` | `onclick="showExamplesFromToast()"` | `data-on-click="show-examples-from-toast"` |
| 71 | 1199 | `button#cluster-bar-top` | `onclick="toggleClusterPills()"` | `data-on-click="toggle-cluster-pills"` |
| 72 | 1203 | `button#cb-add-btn` | `onclick="addCluster()"` | `data-on-click="add-cluster"` |
| 73 | 1210 | `button.cb-top-btn` | `onclick="applyClusterMode()"` | `data-on-click="apply-cluster-mode"` |
| 74 | 1211 | `button.cb-top-btn` | `onclick="clearClusterMode()"` | `data-on-click="clear-cluster-mode"` |
| 75 | 1212 | `button.cb-top-btn` | `onclick="contextReset()"` | `data-on-click="context-reset"` |
| 76 | 1228 | `button.cb-top-btn` | `onclick="applyEditMode()"` | `data-on-click="apply-edit-mode"` |
| 77 | 1229 | `button.cb-top-btn` | `onclick="cancelEditMode()"` | `data-on-click="cancel-edit-mode"` |
| 78 | 1230 | `button#eb-reset-btn` | `onclick="contextReset()"` | `data-on-click="context-reset"` |
| 79 | 1256 | `button.dc-cancel` | `onclick="dismissDeleteConfirm()"` | `data-on-click="dismiss-delete-confirm"` |
| 80 | 1257 | `button` | `onclick="confirmDeletePanel()"` | `data-on-click="confirm-delete-panel"` |

## 5. Data loading: edits beyond moving code
`runWangClustering` (patch list in the build tool, each matched exactly once): the IC is read from the loaded
organism IC instead of `_goIC`; IC is fetched only for non-Wang methods; the two obsolete messages were replaced:
"GO DAG not embedded. Run build_go_dag.py first." -> "Could not load the GO graph (data/go-dag.json). Serve the folder over HTTP and run tools/build_data.py if the file is missing."
and the `mm_IC.csv` message -> "`<method>` needs IC for `<organism>`, but `ic/<id>.json` could not be loaded." (or a "not available for Other" text).
`showInfoTooltip`: "Definition data not embedded..." -> "Definition data could not be loaded (data/go-defs.json)."
These are the only message changes (they referenced the removed embedding). If an IC file fails to load, the IC methods are disabled with a note and the selection falls back to Wang.

## 6. Verification actually run
| # | Check | Result |
|---|---|---|
| 1 | **Before any change**: original Wang + `hierarchicalCluster` (sliced out of the old HTML) on the old embedded graph, 49 terms of the cluster file | **13 clusters at 0.7, identical partition**. Other thresholds 0.5/0.6/0.8/0.9: 17/14/9/5 |
| 2a | Both sample files parse, format detected (`native`), 49 rows, cluster column detected; g:Profiler / GeneCodis / unknown header detection | pass (`node tests/run-tests.mjs`) |
| 2b | Graph vs manifest, acyclic, all parents exist, weights in {0.8, 0.6, 0.7}, definitions all in graph | pass; **counts differ from the brief** (section 2) |
| 2c | Wang on the 49 terms, new graph, clusters at 0.5 / 0.6 / 0.7 / 0.8 / 0.9 | 19 / 15 / **10** / 8 / 5 (48 terms; 1 obsolete -> Ungrouped). With `go_graph.csv` (49 terms): 18 / 16 / 10 / 9 / 5 |
| 2d | Resnik, Lin, Rel, Jiang for mm, hs, rn, ce, dm on 50 BP terms from each IC file | no errors, no NaN, values within [0,1] |
| 2e | Wang matrices from OBO graph vs `go_graph.csv`, agreement 1e-9 | **not met** (different releases, max diff 0.51) |
| - | `build_data.py`: good build, weights, drop of IC terms, cycle fails, empty ontology fails, orphan definition fails, missing IC file fails, last stanza without blank line | 7/7 (`python3 tests/test_build_data.py`) |
| - | My OBO parser vs `build_go_dag.py` on this OBO | graph and definitions identical |
| - | **Old app vs new app in jsdom**: same two sample files and the two built-in examples, same simulated input events (sliders, number boxes incl. blur, selects, toggles, gene matrix, edit mode, manual clustering, filter top per cluster); serialised chart SVG and sidebar state compared | **21/21 identical per file, 0 console errors** (SVG up to 556,085 characters) |
| - | New UI in jsdom: dropdown options/default/remembered choice/info line, IC methods disabled for Other, Wang and Lin run through the real button (48 terms -> 10 clusters Wang, 9 Lin on mouse IC), IC 404 -> note, disabled, fallback to Wang | 13/13 |
| - | Every module resolved by scope analysis: no unresolved names, no missing exports, no unused imports | clean |

## 7. `render()`
Moved intact into `plot/render.js` (932 lines, over the ~600 guideline; the rest are under). I did not split it:
its sections share many locals (`svg`, `panelLayouts`, `MARGIN_LEFT`, `innerW`, `xScale`, `panelYOffsets`, `geneMatActive`, ...)
and without a browser I cannot confirm a hand-split draws identically. Proposed follow-up split points (current line numbers in `render.js`):
shared x scale (22) | per-panel layout (35) | build SVG (108) | shared scales (120) | draw each panel (167-636, the biggest block)
| gene matrix (637) | legend (794) | sticky gene header (916) | sticky term column (921). The jsdom comparison above can guard such a refactor.

## 8. Bugs and oddities noticed, NOT fixed
1. `setActivePanelId` sets min/max for the `minInter` and `maxTerm` sliders but not for `minTerm` (min/max only get updated when topN changes).
2. `parseFileText('')` throws a `TypeError` (`lines[0]`) inside the FileReader callback; no error toast.
3. Separator detection is `text.includes('\t')`: a comma CSV with a tab inside a field is treated as TSV and rejected as an unknown format.
4. `getPanelData` mutates the row objects (`d._hidden`).
5. Resnik is normalised by the maximum IC over the whole organism file, not over the clustered terms; `Math.max(...Object.values(ic))` spreads ~20k values on every Resnik run.
6. `localStorage.removeItem('skipDeleteConfirm')` runs on every page load, so "don't ask again" lasts only until reload (the code comment says this is intended).
7. The old IC data in the blob differs from `mm_IC.csv` (section 2), so IC-method results will change versus the old file.
8. Wang: the old code sets `sv['all'] = 0` for a root node called `all` that exists in the GOSemSim table but not in the OBO graph; with the OBO graph it is a harmless no-op (checked: contributes 0).
9. Clustering is O(n^3)-ish and slow, unchanged as instructed.
10. The `Note` in `startTitleEdit` mentions closure variables from `render()`; it re-reads `data-margin-left` instead (works, just fragile).

## 9. Not verified
No real-browser run: visual appearance, real layout/text measurement, drag and drop of terms, PNG download, CSV download, file picker, GitHub Pages sub-path, CDN fonts, the new dropdown's look. jsdom has no layout (widths 0). The `#gist=` path was not exercised. Timing of `DOMContentLoaded` vs module start is by specification, not observed. I did not compare the old and new apps for the semantic-clustering button (different graph by design) nor the PNG/CSV export output.

## 10. Manual browser checks for you
Serve with `python3 -m http.server`, open the page, console open (should stay free of red errors):
1. Page loads, sidebar looks as before; the **Organism** dropdown is directly below the upload zone and shows "Mouse (Mus musculus)", and under it "GO release 2026-07-26 · org.Mm.eg.db 3.23.0".
2. Load each sample: both CSVs in `tests/samples/`, then "Show supported formats & examples" -> the gProfiler and GeneCodis examples. The 13-cluster file should show 13 clusters in the cluster bar.
3. Sliders and number boxes (top N, min intersection, term size, log2 FE), typing a number and clicking elsewhere; GO group select; dot size / line width / colours / size mode / lollipop toggle / legend and plot scale.
4. Hide terms (Edit Visible Terms), cancel/apply; Reset buttons; add a second panel and move up/down; delete panel (confirmation dialog).
5. Manual clustering: add cluster, rename, change colour, drag a term onto a pill, assign menu, delete; "Filter Top per Cluster".
6. Gene Matrix on/off, expand/collapse, scrolling sticky headers; hover the GO term info -> definition tooltip appears (needs `data/go-defs.json`, Network tab: 200).
7. Semantic clustering: Wang at 0.7 on the 49-term file (expect 10 clusters + 1 ungrouped); then Lin or Rel (Mouse); switch organism to Human and run again; choose "Other": Resnik/Lin/Rel/Jiang greyed out with a note.
8. Reload: the last organism choice is remembered. Open DevTools -> Network: `manifest.json` loads on start, `go-dag.json` only when you cluster, `ic/<id>.json` only when you run an IC method.
9. PNG and CSV export open and look as before. `#data=<base64 csv>` URL loads data.
10. Deploy to a GitHub Pages sub-path and repeat 1, 6 and 7 there.
