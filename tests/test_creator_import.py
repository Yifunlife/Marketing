import unittest,importlib.util,tempfile,datetime,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('creator',Path(__file__).resolve().parents[1]/'scripts/import-creator.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CreatorImportTests(unittest.TestCase):
 def test_real_exports_have_consistent_days(self):
  groups=m.GROUPS
  original=m.workbook
  def fake(path):
   return {next(title for title,k in m.FIELDS.items() if k==key):[['日期','数值']]+[[(datetime.date(2026,10,30)-datetime.timedelta(days=i)).strftime('%Y年%m月%d日'),'0'] for i in range(30)] for key in groups[str(path)]}
  try:
   m.workbook=fake
   data=m.parse({g:g for g in groups},datetime.date(2026,10,31));self.assertEqual(len(data),30);self.assertEqual(data['2026-10-30']['net_followers'],0)
   with self.assertRaises(ValueError):m.parse({g:g for g in groups},datetime.date(2026,11,1))
  finally:m.workbook=original
if __name__=='__main__':unittest.main()
