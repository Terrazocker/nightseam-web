"""Real IndexedDB commit/abort and strict backup regression checks."""

from __future__ import annotations

import json
import re

from harness import ROOT, check
from web_suite import boot


@check("web-storage-atomic-restore-and-strict-snapshot", "web")
def storage_atomic_restore_and_strict_snapshot(c):
    boot(c)
    app = (ROOT / "web/app.js").read_text(encoding="utf-8")
    modules = {name: re.search(rf'\./{name}\.js\?v=\d+', app).group(0)
               for name in ("webstore", "horizon")}
    result = c.page.evaluate("""async modules => {
      const W = await import(modules.webstore);
      const H = await import(modules.horizon);
      const target = {id:'u_original',primary_name:'Original target',ra_hours:5,dec_deg:22};
      await W.saveTargetRec(target);
      const current = await W.collectBackup(H.getPrefs(), H.exportHorizons());
      await W.set('meta','safety',{marker:'previous-safety'});
      const put = IDBObjectStore.prototype.put;
      const abortPut = key => {
        IDBObjectStore.prototype.put = function(...args) {
          const request = put.apply(this,args);
          if (args[1] === key) request.addEventListener('success',()=>this.transaction.abort());
          return request;
        };
      };
      let reported, restoreError;
      try {
        abortPut('u_uncommitted');
        reported = await W.saveTargetRec({...target,id:'u_uncommitted'});
        abortPut('u_replacement');
        try {
          await W.restoreBackup({...current,
            sites:[{id:'s_replacement',name:'Replacement',lat:1,lon:2}],
            targets:[{...target,id:'u_replacement'}]},current);
        } catch(error) { restoreError = error.message; }
      } finally { IDBObjectStore.prototype.put = put; }
      const after = await W.collectBackup(H.getPrefs(),H.exportHorizons());
      const cursor = IDBObjectStore.prototype.openCursor;
      let snapshotError;
      try {
        IDBObjectStore.prototype.openCursor = function(...args) {
          if (this.name === 'sites') throw new DOMException('temporary read failure','UnknownError');
          return cursor.apply(this,args);
        };
        try { await W.collectBackup(H.getPrefs(),H.exportHorizons()); }
        catch(error) { snapshotError = error.message; }
      } finally { IDBObjectStore.prototype.openCursor = cursor; }
      return {reported, restoreError, snapshotError,
        uncommitted:await W.get('targets','u_uncommitted'),
        before:[current.sites,current.rigs,current.targets],
        after:[after.sites,after.rigs,after.targets],
        safety:await W.lastSafetySnapshot()};
    }""", modules)
    c.expect_eq(result["reported"], False, "request success is insufficient when commit aborts")
    c.expect_eq(result["uncommitted"], None, "aborted write is absent")
    c.expect(bool(result.get("restoreError")), "an aborted restore must reject")
    c.expect_eq(result["after"], result["before"], "all record stores survive aborted restoration")
    c.expect_eq(result["safety"], {"marker": "previous-safety"}, "safety write rolls back atomically")
    c.expect(bool(result.get("snapshotError")), "incomplete reads must refuse backup collection")
    (c.artifacts / "storage-atomic-restore.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8")
    c.assert_clean()
